package model_setting

import (
	"fmt"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const defaultGeminiSafetySetting = "OFF"

var validGeminiSafetySettings = map[string]struct{}{
	"OFF":                              {},
	"BLOCK_NONE":                       {},
	"BLOCK_ONLY_HIGH":                  {},
	"BLOCK_MEDIUM_AND_ABOVE":           {},
	"BLOCK_LOW_AND_ABOVE":              {},
	"HARM_BLOCK_THRESHOLD_UNSPECIFIED": {},
}

// GeminiSettings defines Gemini model configuration. 注意bool要以enabled结尾才可以生效编辑
type GeminiSettings struct {
	SafetySettings                        map[string]string `json:"safety_settings"`
	VersionSettings                       map[string]string `json:"version_settings"`
	SupportedImagineModels                []string          `json:"supported_imagine_models"`
	ThinkingAdapterEnabled                bool              `json:"thinking_adapter_enabled"`
	ThinkingAdapterBudgetTokensPercentage float64           `json:"thinking_adapter_budget_tokens_percentage"`
	FunctionCallThoughtSignatureEnabled   bool              `json:"function_call_thought_signature_enabled"`
	RemoveFunctionResponseIdEnabled       bool              `json:"remove_function_response_id_enabled"`
}

// 默认配置
var defaultGeminiSettings = GeminiSettings{
	SafetySettings: map[string]string{
		"default": defaultGeminiSafetySetting,
	},
	VersionSettings: map[string]string{
		"default":        "v1beta",
		"gemini-1.0-pro": "v1",
	},
	SupportedImagineModels: []string{
		"gemini-2.0-flash-exp-image-generation",
		"gemini-2.0-flash-exp",
		"gemini-3-pro-image-preview",
		"gemini-3-pro-image",
		"gemini-2.5-flash-image",
		"gemini-3.1-flash-image",
		"gemini-3.1-flash-image-preview",
	},
	ThinkingAdapterEnabled:                false,
	ThinkingAdapterBudgetTokensPercentage: 0.6,
	FunctionCallThoughtSignatureEnabled:   true,
	RemoveFunctionResponseIdEnabled:       true,
}

// 全局实例
var geminiSettings = defaultGeminiSettings

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("gemini", &geminiSettings)
}

// GetGeminiSettings 获取Gemini配置
func GetGeminiSettings() *GeminiSettings {
	return &geminiSettings
}

// GetGeminiSafetySetting 获取安全设置
func GetGeminiSafetySetting(key string) string {
	settings := geminiSettings.SafetySettings
	if value := settings[key]; value != "" {
		return value
	}
	if value := settings["default"]; value != "" {
		return value
	}
	return defaultGeminiSafetySetting
}

// ValidateGeminiSafetySettings validates the JSON persisted by the option API.
// Empty values remain valid because read-time fallback returns the default.
func ValidateGeminiSafetySettings(value string) error {
	var settings map[string]string
	if err := common.UnmarshalJsonStr(value, &settings); err != nil {
		return fmt.Errorf("Gemini safety settings must be a JSON string map: %w", err)
	}
	if settings == nil {
		return fmt.Errorf("Gemini safety settings must be a JSON string map")
	}
	for category, threshold := range settings {
		if threshold == "" {
			continue
		}
		if _, ok := validGeminiSafetySettings[threshold]; !ok {
			return fmt.Errorf("invalid Gemini safety threshold %q for %q", threshold, category)
		}
	}
	return nil
}

// GetGeminiVersionSetting 获取版本设置
func GetGeminiVersionSetting(key string) string {
	if value, ok := geminiSettings.VersionSettings[key]; ok {
		return value
	}
	return geminiSettings.VersionSettings["default"]
}

func IsGeminiModelSupportImagine(model string) bool {
	name := strings.TrimSpace(model)
	if name == "" {
		return false
	}
	if slices.Contains(geminiSettings.SupportedImagineModels, name) {
		return true
	}
	// 渠道前缀：provider/gemini-xxx
	base := name
	if i := strings.LastIndex(name, "/"); i >= 0 && i+1 < len(name) {
		base = name[i+1:]
		if slices.Contains(geminiSettings.SupportedImagineModels, base) {
			return true
		}
	}
	lower := strings.ToLower(base)
	// 未录入列表的新版生图模型名启发（避免只回文本）
	if strings.Contains(lower, "flash-image") ||
		strings.Contains(lower, "pro-image") ||
		strings.Contains(lower, "image-generation") {
		return true
	}
	return strings.HasSuffix(lower, "-image") ||
		strings.HasSuffix(lower, "-image-preview")
}
