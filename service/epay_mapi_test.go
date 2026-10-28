package service

import (
	"net/url"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildEpayMapiURL(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://pay.example.com/")
	require.NoError(t, err)
	got, err := buildEpayMapiURL(base)
	require.NoError(t, err)
	assert.Equal(t, "https://pay.example.com/mapi.php", got)

	submitBase, err := url.Parse("https://pay.example.com/submit.php")
	require.NoError(t, err)
	got, err = buildEpayMapiURL(submitBase)
	require.NoError(t, err)
	assert.Equal(t, "https://pay.example.com/mapi.php", got)
}

func TestEpayMapiSuccess(t *testing.T) {
	t.Parallel()

	assert.True(t, epayMapiSuccess(map[string]any{"code": float64(1)}))
	assert.True(t, epayMapiSuccess(map[string]any{"code": "1"}))
	assert.True(t, epayMapiSuccess(map[string]any{"payurl": "https://pay.example.com/c"}))
	assert.False(t, epayMapiSuccess(map[string]any{"code": float64(0), "msg": "fail"}))
}
