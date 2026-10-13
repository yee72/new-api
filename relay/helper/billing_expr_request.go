package helper

import (
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
)

// 渠道测试在无请求时长时用于任务用量表达式的默认秒数（落在合法时长范围内）。
const channelTestDefaultUsageSeconds = 5.0

func ResolveIncomingBillingExprRequestInput(c *gin.Context, info *relaycommon.RelayInfo) (billingexpr.RequestInput, error) {
	if info != nil && info.BillingRequestInput != nil {
		input := cloneRequestInput(*info.BillingRequestInput)
		merged := cloneStringMap(info.RequestHeaders)
		maps.Copy(merged, input.Headers)
		input.Headers = merged
		return input, nil
	}

	input := billingexpr.RequestInput{}
	if info != nil {
		input.Headers = cloneStringMap(info.RequestHeaders)
	}

	bodyBytes, err := readIncomingBillingExprBody(c)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

// ResolveImageBillingRequestInput freezes only the validated scalar image
// parameters needed by pricing. Image files, prompts and base64 payloads are
// deliberately excluded, including for multipart edits.
func ResolveImageBillingRequestInput(c *gin.Context, info *relaycommon.RelayInfo, input billingexpr.RequestInput) (billingexpr.RequestInput, error) {
	request, ok := info.Request.(*dto.ImageRequest)
	if !ok {
		return input, nil
	}
	count, err := request.ImageCount(false)
	if err != nil {
		return input, err
	}
	body := map[string]any{"model": request.Model, "n": count, "size": request.Size, "quality": request.Quality}
	if request.BillingParameters != nil {
		body["parameters"] = request.BillingParameters
	}
	encoded, err := common.Marshal(body)
	if err != nil {
		return input, err
	}
	input.Body = encoded
	input.ImageCount = &count
	return input, nil
}

func BuildBillingExprRequestInputFromRequest(request dto.Request, headers map[string]string) (billingexpr.RequestInput, error) {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(headers),
	}
	if request == nil {
		return input, nil
	}

	bodyBytes, err := common.Marshal(request)
	if err != nil {
		return billingexpr.RequestInput{}, err
	}
	input.Body = bodyBytes
	return input, nil
}

func readIncomingBillingExprBody(c *gin.Context) ([]byte, error) {
	if c == nil || c.Request == nil || !isJSONContentType(c.Request.Header.Get("Content-Type")) {
		return nil, nil
	}
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	return storage.Bytes()
}

func cloneRequestInput(src billingexpr.RequestInput) billingexpr.RequestInput {
	input := billingexpr.RequestInput{
		Headers: cloneStringMap(src.Headers),
	}
	if src.ImageCount != nil {
		count := *src.ImageCount
		input.ImageCount = &count
	}
	if len(src.Body) > 0 {
		input.Body = append([]byte(nil), src.Body...)
	}
	if len(src.Usage) > 0 {
		input.Usage = maps.Clone(src.Usage)
	}
	return input
}

// ensureBillingUsageFacts 为含 u("…") 的任务用量表达式补齐 Usage。
// 渠道测试可在缺失时填默认秒数；正式请求仍要求调用方提供用量事实。
func ensureBillingUsageFacts(input *billingexpr.RequestInput, usageKeys map[string]bool, allowChannelTestDefaults bool) error {
	if input == nil || len(usageKeys) == 0 {
		return nil
	}
	if input.Usage == nil {
		input.Usage = map[string]any{}
	}
	fillUsageFactsFromBody(input.Body, input.Usage, usageKeys)

	var missing []string
	for key := range usageKeys {
		if _, ok := input.Usage[key]; ok {
			continue
		}
		if allowChannelTestDefaults {
			switch key {
			case "seconds", "duration":
				input.Usage[key] = channelTestDefaultUsageSeconds
				continue
			case "clips", "image_count", "n":
				input.Usage[key] = float64(1)
				continue
			}
		}
		missing = append(missing, key)
	}
	if len(missing) == 0 {
		return nil
	}
	slices.Sort(missing)
	return fmt.Errorf("missing usage facts %v (task/video models require these via the task API, not chat completions)", missing)
}

func fillUsageFactsFromBody(body []byte, usage map[string]any, usageKeys map[string]bool) {
	if len(body) == 0 || usage == nil || len(usageKeys) == 0 {
		return
	}
	var root map[string]any
	if err := common.Unmarshal(body, &root); err != nil || len(root) == 0 {
		return
	}
	parameters, _ := root["parameters"].(map[string]any)
	for key := range usageKeys {
		if _, ok := usage[key]; ok {
			continue
		}
		if value, ok := root[key]; ok && value != nil {
			usage[key] = value
			continue
		}
		if parameters != nil {
			if value, ok := parameters[key]; ok && value != nil {
				usage[key] = value
			}
		}
	}
	if usageKeys["seconds"] {
		if _, ok := usage["seconds"]; ok {
			return
		}
		if value, ok := root["duration"]; ok && value != nil {
			usage["seconds"] = value
			return
		}
		if parameters != nil {
			if value, ok := parameters["duration"]; ok && value != nil {
				usage["seconds"] = value
			}
		}
	}
}

func isJSONContentType(contentType string) bool {
	contentType = strings.ToLower(strings.TrimSpace(contentType))
	return strings.HasPrefix(contentType, "application/json")
}

func cloneStringMap(src map[string]string) map[string]string {
	if len(src) == 0 {
		return map[string]string{}
	}
	dst := make(map[string]string, len(src))
	for key, value := range src {
		if strings.TrimSpace(key) == "" {
			continue
		}
		dst[key] = value
	}
	return dst
}
