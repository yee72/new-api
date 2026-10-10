package common

import (
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
	require.True(t, strings.HasPrefix(challenge.ImageBase64, "data:image/png;base64,"))

	SeedCaptchaForTest(challenge.ID, "ABCD")
	assert.True(t, ConsumeCaptcha(challenge.ID, "abcd"))
	assert.False(t, ConsumeCaptcha(challenge.ID, "ABCD"), "captcha must be single-use")
}

func TestConsumeCaptchaRejectsWrongOrExpired(t *testing.T) {
	SeedCaptchaForTest("cap-wrong", "WXYZ")
	assert.False(t, ConsumeCaptcha("cap-wrong", "AAAA"))

	SeedCaptchaForTest("cap-empty", "WXYZ")
	assert.False(t, ConsumeCaptcha("", "WXYZ"))
	assert.False(t, ConsumeCaptcha("cap-empty", ""))

	captchaMutex.Lock()
	captchaMap["cap-expired"] = captchaValue{
		code: "WXYZ",
		time: time.Now().Add(-time.Duration(CaptchaValidMinutes+1) * time.Minute),
	}
	captchaMutex.Unlock()
	assert.False(t, ConsumeCaptcha("cap-expired", "WXYZ"))
}
