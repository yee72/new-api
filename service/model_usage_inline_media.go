package service

import (
	"context"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

var modelUsageDataImageRe = regexp.MustCompile(`data:image/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+`)

// RewritePlaygroundInlineImages 将 playground 响应中的 data:image / b64_json 落对象存储，
// 回写为 /api/model-usage/media/... 短链，避免浏览器再搬一份 base64。
// 未配置对象存储或无内联图时原样返回。
func RewritePlaygroundInlineImages(ctx context.Context, userId int, modelName, batchID string, body []byte) ([]byte, error) {
	if userId <= 0 || len(body) == 0 || !GetObjectBlobStore().Enabled() {
		return body, nil
	}
	if !strings.Contains(string(body), "data:image/") && !strings.Contains(string(body), `"b64_json"`) {
		return body, nil
	}
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		modelName = "unknown"
	}
	batchID = strings.TrimSpace(batchID)
	if batchID == "" {
		batchID = "pg"
	}

	if rewritten, ok, err := rewritePlaygroundOpenAIChatBody(ctx, userId, modelName, batchID, body); err != nil {
		return nil, err
	} else if ok {
		return rewritten, nil
	}
	if rewritten, ok, err := rewritePlaygroundOpenAIImagesBody(ctx, userId, modelName, batchID, body); err != nil {
		return nil, err
	} else if ok {
		return rewritten, nil
	}
	return body, nil
}

func rewritePlaygroundOpenAIChatBody(ctx context.Context, userId int, modelName, batchID string, body []byte) ([]byte, bool, error) {
	var resp dto.OpenAITextResponse
	if err := common.Unmarshal(body, &resp); err != nil || len(resp.Choices) == 0 {
		return body, false, nil
	}
	changed := false
	nextIndex := 0
	for i := range resp.Choices {
		n, err := rewriteMessageInlineImages(ctx, userId, modelName, batchID, &resp.Choices[i].Message, &nextIndex)
		if err != nil {
			return nil, false, err
		}
		if n > 0 {
			changed = true
		}
	}
	if !changed {
		return body, false, nil
	}
	out, err := common.Marshal(resp)
	if err != nil {
		return nil, false, err
	}
	return out, true, nil
}

func rewritePlaygroundOpenAIImagesBody(ctx context.Context, userId int, modelName, batchID string, body []byte) ([]byte, bool, error) {
	var root map[string]any
	if err := common.Unmarshal(body, &root); err != nil {
		return body, false, nil
	}
	rawData, ok := root["data"]
	if !ok {
		return body, false, nil
	}
	items, ok := rawData.([]any)
	if !ok || len(items) == 0 {
		return body, false, nil
	}
	changed := false
	sources := make([]string, 0, len(items))
	sourceAt := make([]int, len(items))
	for i := range sourceAt {
		sourceAt[i] = -1
	}
	for i, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		b64, _ := m["b64_json"].(string)
		b64 = strings.TrimSpace(b64)
		if b64 == "" {
			continue
		}
		sourceAt[i] = len(sources)
		sources = append(sources, "data:image/png;base64,"+b64)
	}
	if len(sources) == 0 {
		return body, false, nil
	}
	urls, err := persistModelUsageImages(ctx, userId, modelName, batchID, sources)
	if err != nil {
		return nil, false, err
	}
	for i, item := range items {
		srcIdx := sourceAt[i]
		if srcIdx < 0 || srcIdx >= len(urls) {
			continue
		}
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		m["url"] = urls[srcIdx]
		delete(m, "b64_json")
		items[i] = m
		changed = true
	}
	if !changed {
		return body, false, nil
	}
	root["data"] = items
	out, err := common.Marshal(root)
	if err != nil {
		return nil, false, err
	}
	return out, true, nil
}

func rewriteMessageInlineImages(ctx context.Context, userId int, modelName, batchID string, msg *dto.Message, nextIndex *int) (int, error) {
	if msg == nil {
		return 0, nil
	}
	replaced := 0
	if msg.IsStringContent() {
		text := msg.StringContent()
		newText, n, err := replaceDataImagesInText(ctx, userId, modelName, batchID, text, nextIndex)
		if err != nil {
			return 0, err
		}
		if n > 0 {
			msg.SetStringContent(newText)
			replaced += n
		}
	} else {
		parts := msg.ParseContent()
		if len(parts) > 0 {
			changed := false
			for i := range parts {
				n, partChanged, err := rewriteMediaContentInlineImage(ctx, userId, modelName, batchID, &parts[i], nextIndex)
				if err != nil {
					return 0, err
				}
				replaced += n
				if partChanged {
					changed = true
				}
			}
			if changed {
				msg.SetMediaContent(parts)
			}
		}
	}
	// message.images（Gemini chat 生图等）：content 常为 null
	for i := range msg.Images {
		n, _, err := rewriteMediaContentInlineImage(ctx, userId, modelName, batchID, &msg.Images[i], nextIndex)
		if err != nil {
			return 0, err
		}
		replaced += n
	}
	return replaced, nil
}

func rewriteMediaContentInlineImage(
	ctx context.Context,
	userId int,
	modelName, batchID string,
	part *dto.MediaContent,
	nextIndex *int,
) (int, bool, error) {
	if part == nil {
		return 0, false, nil
	}
	if part.Type == dto.ContentTypeText {
		newText, n, err := replaceDataImagesInText(ctx, userId, modelName, batchID, part.Text, nextIndex)
		if err != nil {
			return 0, false, err
		}
		if n > 0 {
			part.Text = newText
			return n, true, nil
		}
		return 0, false, nil
	}
	img := part.GetImageMedia()
	if img == nil || !strings.HasPrefix(strings.TrimSpace(img.Url), "data:image/") {
		return 0, false, nil
	}
	url, err := persistModelUsageImageAt(ctx, userId, modelName, batchID, *nextIndex, img.Url)
	if err != nil {
		return 0, false, err
	}
	*nextIndex++
	img.Url = url
	part.ImageUrl = img
	if part.Type == "" {
		part.Type = dto.ContentTypeImageURL
	}
	return 1, true, nil
}

func replaceDataImagesInText(ctx context.Context, userId int, modelName, batchID, text string, nextIndex *int) (string, int, error) {
	if text == "" || !strings.Contains(text, "data:image/") {
		return text, 0, nil
	}
	matches := modelUsageDataImageRe.FindAllString(text, -1)
	if len(matches) == 0 {
		return text, 0, nil
	}
	type slot struct {
		raw     string
		cleaned string
	}
	slots := make([]slot, 0, len(matches))
	order := make([]string, 0, len(matches))
	seen := make(map[string]struct{}, len(matches))
	for _, raw := range matches {
		cleaned := strings.Join(strings.Fields(raw), "")
		slots = append(slots, slot{raw: raw, cleaned: cleaned})
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		order = append(order, cleaned)
	}
	urlBySource := make(map[string]string, len(order))
	for _, source := range order {
		url, err := persistModelUsageImageAt(ctx, userId, modelName, batchID, *nextIndex, source)
		if err != nil {
			return text, 0, err
		}
		*nextIndex++
		urlBySource[source] = url
	}
	out := text
	for _, s := range slots {
		mediaURL := urlBySource[s.cleaned]
		if mediaURL == "" {
			continue
		}
		out = strings.Replace(out, s.raw, mediaURL, 1)
	}
	return out, len(order), nil
}
