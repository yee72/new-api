package common

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConsumeCodeWithKeyIsSingleUse(t *testing.T) {
	key := "user@example.com"
	code := "123456"
	RegisterVerificationCodeWithKey(key, code, EmailVerificationPurpose)

	require.True(t, ConsumeCodeWithKey(key, code, EmailVerificationPurpose))
	assert.False(t, ConsumeCodeWithKey(key, code, EmailVerificationPurpose))
	assert.False(t, VerifyCodeWithKey(key, code, EmailVerificationPurpose))
}

func TestConsumeCodeWithKeyRejectsWrongCodeWithoutConsuming(t *testing.T) {
	key := "keep@example.com"
	code := "654321"
	RegisterVerificationCodeWithKey(key, code, PasswordResetPurpose)

	assert.False(t, ConsumeCodeWithKey(key, "000000", PasswordResetPurpose))
	assert.True(t, VerifyCodeWithKey(key, code, PasswordResetPurpose))
	require.True(t, ConsumeCodeWithKey(key, code, PasswordResetPurpose))
}

func TestConsumeCodeWithKeyRejectsExpiredCode(t *testing.T) {
	previousMinutes := VerificationValidMinutes
	VerificationValidMinutes = 0
	t.Cleanup(func() { VerificationValidMinutes = previousMinutes })

	key := "expired@example.com"
	code := "111111"
	RegisterVerificationCodeWithKey(key, code, EmailVerificationPurpose)
	time.Sleep(time.Millisecond)
	assert.False(t, ConsumeCodeWithKey(key, code, EmailVerificationPurpose))
}
