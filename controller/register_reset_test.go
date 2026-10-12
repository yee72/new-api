package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRegisterResetTest(t *testing.T) {
	t.Helper()
	require.NoError(t, i18n.Init())
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedis := common.RedisEnabled
	previousRegister := common.RegisterEnabled
	previousPasswordRegister := common.PasswordRegisterEnabled
	previousEmailVerification := common.EmailVerificationEnabled
	previousQuota := common.QuotaForNewUser
	previousTurnstile := common.TurnstileCheckEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.Log{}))
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.QuotaForNewUser = 0
	common.TurnstileCheckEnabled = false
	common.EmailVerificationEnabled = false

	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedis
		common.RegisterEnabled = previousRegister
		common.PasswordRegisterEnabled = previousPasswordRegister
		common.EmailVerificationEnabled = previousEmailVerification
		common.QuotaForNewUser = previousQuota
		common.TurnstileCheckEnabled = previousTurnstile
	})
	gin.SetMode(gin.TestMode)
}

func postJSON(t *testing.T, handler gin.HandlerFunc, path string, body string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")
	handler(c)
	return recorder
}

func TestRegisterStoresOptionalPhoneAndRequiresEmailCode(t *testing.T) {
	setupRegisterResetTest(t)
	common.EmailVerificationEnabled = true
	email := "new-user@example.com"
	code := "246810"
	common.RegisterVerificationCodeWithKey(email, code, common.EmailVerificationPurpose)

	recorder := postJSON(t, Register, "/api/user/register", `{
		"username":"phoneuser",
		"password":"Password123",
		"email":"New-User@example.com",
		"phone":"+86 138-0013-8000",
		"verification_code":"246810"
	}`)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)

	var user model.User
	require.NoError(t, model.DB.Where("username = ?", "phoneuser").First(&user).Error)
	assert.Equal(t, "new-user@example.com", user.Email)
	assert.Equal(t, "+8613800138000", user.Phone)
	assert.False(t, common.VerifyCodeWithKey(email, code, common.EmailVerificationPurpose))
}

func TestRegisterRejectsReplayOfEmailCode(t *testing.T) {
	setupRegisterResetTest(t)
	common.EmailVerificationEnabled = true
	email := "once@example.com"
	code := "112233"
	common.RegisterVerificationCodeWithKey(email, code, common.EmailVerificationPurpose)

	first := postJSON(t, Register, "/api/user/register", `{
		"username":"onceuser",
		"password":"Password123",
		"email":"once@example.com",
		"verification_code":"112233"
	}`)
	var firstResponse struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(first.Body.Bytes(), &firstResponse))
	require.True(t, firstResponse.Success)

	second := postJSON(t, Register, "/api/user/register", `{
		"username":"onceuser2",
		"password":"Password123",
		"email":"once@example.com",
		"verification_code":"112233"
	}`)
	var secondResponse struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(second.Body.Bytes(), &secondResponse))
	assert.False(t, secondResponse.Success)
}

func TestRegisterRejectsInvalidPhone(t *testing.T) {
	setupRegisterResetTest(t)
	recorder := postJSON(t, Register, "/api/user/register", `{
		"username":"badphone",
		"password":"Password123",
		"phone":"abc123"
	}`)
	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
}

func TestSendEmailVerificationRequiresCaptcha(t *testing.T) {
	setupRegisterResetTest(t)

	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/verification?email=fresh@example.com", nil)
	SendEmailVerification(c)

	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
}

func TestSendEmailVerificationChecksCaptchaBeforeEmailValidation(t *testing.T) {
	setupRegisterResetTest(t)

	// 非法邮箱且无验证码：必须先因验证码失败，不能暴露邮箱格式错误
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/verification?email=not-an-email", nil)
	SendEmailVerification(c)

	var denied struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &denied))
	assert.False(t, denied.Success)
	assert.True(t,
		strings.Contains(strings.ToLower(denied.Message), "captcha") ||
			strings.Contains(denied.Message, "图形验证码"),
		"expected captcha failure message, got %q", denied.Message,
	)

	common.SeedCaptchaForTest("cap-email-order", "EF56")
	okRecorder := httptest.NewRecorder()
	okCtx, _ := gin.CreateTestContext(okRecorder)
	okCtx.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/verification?email=not-an-email&captcha_id=cap-email-order&captcha_code=EF56",
		nil,
	)
	SendEmailVerification(okCtx)

	var afterCaptcha struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(okRecorder.Body.Bytes(), &afterCaptcha))
	assert.False(t, afterCaptcha.Success)
	assert.False(t,
		strings.Contains(strings.ToLower(afterCaptcha.Message), "captcha") ||
			strings.Contains(afterCaptcha.Message, "图形验证码"),
		"after captcha, expected email validation error, got %q", afterCaptcha.Message,
	)
}

func TestSendEmailVerificationHidesExistingAccounts(t *testing.T) {
	setupRegisterResetTest(t)
	user := &model.User{
		Username: "taken-mail", Password: "Password123", Email: "taken@example.com",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default",
	}
	require.NoError(t, user.Insert(0))

	common.SeedCaptchaForTest("cap-taken", "AB12")
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(
		http.MethodGet,
		"/api/verification?email=taken@example.com&captcha_id=cap-taken&captcha_code=AB12",
		nil,
	)
	SendEmailVerification(c)

	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.False(t, common.VerifyCodeWithKey("taken@example.com", "", common.EmailVerificationPurpose))
}

func TestRegisterWithoutEmailVerificationRequiresCaptcha(t *testing.T) {
	setupRegisterResetTest(t)
	common.EmailVerificationEnabled = false

	denied := postJSON(t, Register, "/api/user/register", `{
		"username":"nocaptchauser",
		"password":"Password123"
	}`)
	var deniedBody struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(denied.Body.Bytes(), &deniedBody))
	assert.False(t, deniedBody.Success)

	common.SeedCaptchaForTest("cap-reg", "CD34")
	ok := postJSON(t, Register, "/api/user/register", `{
		"username":"captchauser",
		"password":"Password123",
		"captcha_id":"cap-reg",
		"captcha_code":"CD34"
	}`)
	var okBody struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(ok.Body.Bytes(), &okBody))
	assert.True(t, okBody.Success)
}

func TestResetPasswordRejectsEmptyPassword(t *testing.T) {
	setupRegisterResetTest(t)
	user := &model.User{
		Username: "empty-pass-user", Password: "OldPassword123", Email: "empty-pass@example.com",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default",
	}
	require.NoError(t, user.Insert(0))
	token := "empty-pass-token"
	common.RegisterVerificationCodeWithKey("empty-pass@example.com", token, common.PasswordResetPurpose)

	recorder := postJSON(t, ResetPassword, "/api/user/reset", `{
		"email":"empty-pass@example.com",
		"token":"empty-pass-token",
		"password":""
	}`)
	var response struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.False(t, response.Success)
	// 空密码不得消耗重置令牌
	assert.True(t, common.VerifyCodeWithKey("empty-pass@example.com", token, common.PasswordResetPurpose))

	stored, err := model.GetUserById(user.Id, true)
	require.NoError(t, err)
	assert.True(t, common.ValidatePasswordAndHash("OldPassword123", stored.Password))
}

func TestResetPasswordUsesCallerChosenPasswordOnce(t *testing.T) {
	setupRegisterResetTest(t)
	user := &model.User{
		Username: "reset-user", Password: "OldPassword123", Email: "reset@example.com",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default",
	}
	require.NoError(t, user.Insert(0))
	token := "resettokenvalue"
	common.RegisterVerificationCodeWithKey("reset@example.com", token, common.PasswordResetPurpose)

	first := postJSON(t, ResetPassword, "/api/user/reset", `{
		"email":"reset@example.com",
		"token":"resettokenvalue",
		"password":"NewPassword123"
	}`)
	var firstResponse struct {
		Success bool `json:"success"`
		Data    any  `json:"data"`
	}
	require.NoError(t, common.Unmarshal(first.Body.Bytes(), &firstResponse))
	require.True(t, firstResponse.Success)
	assert.Nil(t, firstResponse.Data)

	stored, err := model.GetUserById(user.Id, true)
	require.NoError(t, err)
	assert.True(t, common.ValidatePasswordAndHash("NewPassword123", stored.Password))

	second := postJSON(t, ResetPassword, "/api/user/reset", `{
		"email":"reset@example.com",
		"token":"resettokenvalue",
		"password":"AnotherPassword123"
	}`)
	var secondResponse struct {
		Success bool `json:"success"`
	}
	require.NoError(t, common.Unmarshal(second.Body.Bytes(), &secondResponse))
	assert.False(t, secondResponse.Success)
}
