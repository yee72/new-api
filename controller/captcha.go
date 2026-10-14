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
	data := gin.H{
		"captcha_id":    challenge.ID,
		"captcha_type":  challenge.Type,
		"captcha_image": challenge.ImageBase64,
	}
	if challenge.Type == common.CaptchaTypeSlide {
		data["captcha_piece"] = challenge.PieceBase64
		data["captcha_piece_y"] = challenge.PieceY
		data["captcha_track_width"] = challenge.TrackWidth
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    data,
	})
}

func requireImageCaptcha(c *gin.Context, captchaID string, captchaCode string) bool {
	if common.ConsumeCaptcha(captchaID, captchaCode) {
		return true
	}
	common.ApiErrorI18n(c, i18n.MsgUserCaptchaInvalid)
	return false
}
