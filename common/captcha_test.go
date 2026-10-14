package common

import (
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewCaptchaChallengeAndConsumeOnce(t *testing.T) {
	challenge, err := NewCaptchaChallenge()
	require.NoError(t, err)
	require.NotEmpty(t, challenge.ID)
	require.Contains(t, []string{CaptchaTypeMath, CaptchaTypeSlide}, challenge.Type)
	require.True(t, strings.HasPrefix(challenge.ImageBase64, "data:image/png;base64,"))
	if challenge.Type == CaptchaTypeSlide {
		require.True(t, strings.HasPrefix(challenge.PieceBase64, "data:image/png;base64,"))
		require.Greater(t, challenge.TrackWidth, 0)
	}

	SeedCaptchaForTest(challenge.ID, "12")
	assert.True(t, ConsumeCaptcha(challenge.ID, "12"))
	assert.False(t, ConsumeCaptcha(challenge.ID, "12"), "captcha must be single-use")
}

func TestConsumeCaptchaRejectsWrongOrExpired(t *testing.T) {
	SeedCaptchaForTest("cap-wrong", "9")
	assert.False(t, ConsumeCaptcha("cap-wrong", "1"))

	SeedCaptchaForTest("cap-empty", "9")
	assert.False(t, ConsumeCaptcha("", "9"))
	assert.False(t, ConsumeCaptcha("cap-empty", ""))

	captchaMutex.Lock()
	captchaMap["cap-expired"] = captchaValue{
		code: "9",
		kind: CaptchaTypeMath,
		time: time.Now().Add(-time.Duration(CaptchaValidMinutes+1) * time.Minute),
	}
	captchaMutex.Unlock()
	assert.False(t, ConsumeCaptcha("cap-expired", "9"))
}

func TestConsumeSlideCaptchaWithinTolerance(t *testing.T) {
	captchaMutex.Lock()
	captchaMap["cap-slide"] = captchaValue{
		code:      "120",
		kind:      CaptchaTypeSlide,
		tolerance: slideTolerancePx,
		time:      time.Now(),
	}
	captchaMutex.Unlock()
	assert.True(t, ConsumeCaptcha("cap-slide", strconv.Itoa(120+slideTolerancePx)))

	captchaMutex.Lock()
	captchaMap["cap-slide-far"] = captchaValue{
		code:      "120",
		kind:      CaptchaTypeSlide,
		tolerance: slideTolerancePx,
		time:      time.Now(),
	}
	captchaMutex.Unlock()
	assert.False(t, ConsumeCaptcha("cap-slide-far", strconv.Itoa(120+slideTolerancePx+1)))
}

func TestRandomMathPromptBounds(t *testing.T) {
	for range 20 {
		prompt, answer, err := randomMathPrompt()
		require.NoError(t, err)
		require.NotEmpty(t, prompt)
		require.GreaterOrEqual(t, answer, 0)
		require.LessOrEqual(t, answer, 20)
	}
}
