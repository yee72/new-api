package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
)

func TestGetModelUsagePromptEnhanceDefaults(t *testing.T) {
	prevEnabled := common.PromptEnhanceEnabled
	prevModel := common.PromptEnhanceModel
	prevMax := common.PromptEnhanceMaxTokens
	t.Cleanup(func() {
		common.PromptEnhanceEnabled = prevEnabled
		common.PromptEnhanceModel = prevModel
		common.PromptEnhanceMaxTokens = prevMax
	})

	common.PromptEnhanceEnabled = true
	common.PromptEnhanceModel = " gpt-4o-mini "
	common.PromptEnhanceMaxTokens = 0

	cfg := GetModelUsagePromptEnhance()
	assert.True(t, cfg.Enabled)
	assert.Equal(t, "gpt-4o-mini", cfg.Model)
	assert.Equal(t, 512, cfg.MaxTokens)
}
