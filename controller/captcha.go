package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
)

func GetCaptcha(c *gin.Context) {
	challenge, err := common.NewCaptchaChallenge()
	if err != nil {
		common.ApiErrorI18n(c, i18n.MsgGenerateFailed)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"captcha_id":    challenge.ID,
			"captcha_image": challenge.ImageBase64,
		},
	})
}

func requireImageCaptcha(c *gin.Context, captchaID string, captchaCode string) bool {
	if common.ConsumeCaptcha(captchaID, captchaCode) {
		return true
	}
	common.ApiErrorI18n(c, i18n.MsgUserCaptchaInvalid)
	return false
}
