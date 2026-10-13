package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"gorm.io/gorm"
)

var (
	ErrModelUsageObjectStoreRequired = errors.New("object storage is not configured")
	ErrModelUsageMediaForbidden      = errors.New("media access denied")
	ErrModelUsageInvalidRequest      = errors.New("invalid model usage request")
)

const (
	modelUsageMediaURLPrefix     = "/api/model-usage/media/"
	modelUsageMediaAccessVersion = "mu1"
	modelUsageMediaAccessLength  = 43
	maxModelUsageInlineDataBytes = 32 << 20
	maxModelUsageVideoBytes      = 200 << 20
)

type ModelUsageSessionDTO struct {
	ModelName   string                    `json:"model_name"`
	Messages    []model.ModelUsageMessage `json:"messages"`
	ImageConfig map[string]any            `json:"image_config,omitempty"`
	VideoConfig map[string]any            `json:"video_config,omitempty"`
}

type ModelUsageTurnRequest struct {
	UserMessage      model.ModelUsageMessage `json:"user_message"`
	AssistantMessage model.ModelUsageMessage `json:"assistant_message"`
	ImageSources     []string                `json:"image_sources,omitempty"`
	VideoTaskIDs     []string                `json:"video_task_ids,omitempty"`
	ImageConfig      map[string]any          `json:"image_config,omitempty"`
	VideoConfig      map[string]any          `json:"video_config,omitempty"`
}

func GetModelUsageSessionDTO(userId int, modelName string) (*ModelUsageSessionDTO, error) {
	session, err := model.GetModelUsageSession(userId, modelName)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		normalized, normErr := model.NormalizeModelUsageModelName(modelName)
		if normErr != nil {
			return nil, ErrModelUsageInvalidRequest
		}
		return &ModelUsageSessionDTO{
			ModelName: normalized,
			Messages:  []model.ModelUsageMessage{},
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return sessionToDTO(session), nil
}

func ReplaceModelUsageSession(userId int, modelName string, dto ModelUsageSessionDTO) (*ModelUsageSessionDTO, error) {
	modelName, err := model.NormalizeModelUsageModelName(modelName)
	if err != nil {
		return nil, ErrModelUsageInvalidRequest
	}
	for _, message := range dto.Messages {
		if err := validatePersistedMessage(message); err != nil {
			return nil, err
		}
	}
	session := &model.ModelUsageSession{
		UserId:      userId,
		ModelName:   modelName,
		Messages:    dto.Messages,
		ImageConfig: dto.ImageConfig,
		VideoConfig: dto.VideoConfig,
	}
	if err := model.UpsertModelUsageSession(session); err != nil {
		return nil, err
	}
	return sessionToDTO(session), nil
}

func CommitModelUsageTurn(ctx context.Context, userId int, modelName string, req ModelUsageTurnRequest) (*ModelUsageSessionDTO, error) {
	modelName, err := model.NormalizeModelUsageModelName(modelName)
	if err != nil {
		return nil, ErrModelUsageInvalidRequest
	}
	if strings.TrimSpace(req.UserMessage.ID) == "" || strings.TrimSpace(req.AssistantMessage.ID) == "" {
		return nil, ErrModelUsageInvalidRequest
	}
	if strings.TrimSpace(req.UserMessage.TurnID) == "" {
		req.UserMessage.TurnID = req.AssistantMessage.TurnID
	}
	if req.UserMessage.TurnID == "" || req.UserMessage.TurnID != req.AssistantMessage.TurnID {
		return nil, ErrModelUsageInvalidRequest
	}

	assistant := req.AssistantMessage
	assistant.Images = nil
	assistant.Videos = nil

	switch assistant.MediaType {
	case "image":
		if len(req.ImageSources) == 0 {
			return nil, ErrModelUsageInvalidRequest
		}
		urls, err := persistModelUsageImages(ctx, userId, modelName, assistant.ID, req.ImageSources)
		if err != nil {
			return nil, err
		}
		assistant.Images = urls
		assistant.Status = "done"
		// chat 生图常把 data: 写在 content；入库只保留对象存储 URL
		if containsDataURL(assistant.Content) {
			assistant.Content = ""
		}
	case "video":
		videos, status, err := persistOrTrackModelUsageVideos(ctx, userId, modelName, assistant.ID, req.VideoTaskIDs)
		if err != nil {
			return nil, err
		}
		assistant.Videos = videos
		assistant.Status = status
		// 完成后去掉「生成中」占位文案，避免与视频并存
		if status == "done" {
			assistant.Content = ""
		}
	default:
		assistant.MediaType = "text"
		if containsDataURL(assistant.Content) {
			return nil, ErrModelUsageInvalidRequest
		}
	}

	if err := validatePersistedMessage(req.UserMessage); err != nil {
		return nil, err
	}
	if err := validatePersistedMessage(assistant); err != nil {
		return nil, err
	}

	session, err := model.GetModelUsageSession(userId, modelName)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		session = &model.ModelUsageSession{UserId: userId, ModelName: modelName}
		err = nil
	}
	if err != nil {
		return nil, err
	}

	messages := removeTurn([]model.ModelUsageMessage(session.Messages), req.UserMessage.TurnID)
	messages = append(messages, req.UserMessage, assistant)
	session.Messages = messages
	if req.ImageConfig != nil {
		session.ImageConfig = req.ImageConfig
	}
	if req.VideoConfig != nil {
		session.VideoConfig = req.VideoConfig
	}
	if err := model.UpsertModelUsageSession(session); err != nil {
		return nil, err
	}
	return sessionToDTO(session), nil
}

func RefreshModelUsageVideoTurn(ctx context.Context, userId int, modelName, turnID string) (*ModelUsageSessionDTO, error) {
	modelName, err := model.NormalizeModelUsageModelName(modelName)
	if err != nil || strings.TrimSpace(turnID) == "" {
		return nil, ErrModelUsageInvalidRequest
	}
	session, err := model.GetModelUsageSession(userId, modelName)
	if err != nil {
		return nil, err
	}
	changed := false
	messages := []model.ModelUsageMessage(session.Messages)
	for i := range messages {
		message := &messages[i]
		if message.TurnID != turnID || message.Role != "assistant" || message.MediaType != "video" {
			continue
		}
		taskIDs := collectVideoTaskIDs(message.Videos)
		if len(taskIDs) == 0 {
			continue
		}
		needRefresh := false
		for _, video := range message.Videos {
			if video.URL == "" {
				needRefresh = true
				break
			}
		}
		if !needRefresh {
			// URL 已齐：补齐完成态并清掉占位文案，无需再次拉任务/上传
			if message.Status != "done" || message.Content != "" {
				message.Status = "done"
				message.Content = ""
				changed = true
			}
			continue
		}
		videos, status, err := persistOrTrackModelUsageVideos(ctx, userId, modelName, message.ID, taskIDs)
		if err != nil {
			return nil, err
		}
		message.Videos = videos
		message.Status = status
		if status == "done" {
			message.Content = ""
		}
		changed = true
	}
	if !changed {
		return sessionToDTO(session), nil
	}
	session.Messages = messages
	if err := model.UpsertModelUsageSession(session); err != nil {
		return nil, err
	}
	return sessionToDTO(session), nil
}

// ResolveModelUsageMediaObjectKey validates an HMAC access token or matching
// owner session, then returns the full S3 object key for streaming.
// 失效/跨节点不一致的 access 不得挡住资源所有者本人（Bearer）访问。
func ResolveModelUsageMediaObjectKey(userId int, rawKey, access string) (string, error) {
	relativeKey, err := decodeModelUsageMediaKey(rawKey)
	if err != nil {
		return "", err
	}
	ownerID, ok := modelUsageOwnerID(relativeKey)
	if !ok {
		return "", ErrModelUsageMediaForbidden
	}
	accessOK := access != "" && VerifyModelUsageMediaAccess(access, ownerID, relativeKey)
	ownerOK := userId > 0 && userId == ownerID
	if !accessOK && !ownerOK {
		return "", ErrModelUsageMediaForbidden
	}
	store := GetObjectBlobStore()
	if !store.Enabled() {
		return "", ErrModelUsageObjectStoreRequired
	}
	return store.Prefix() + strings.TrimPrefix(relativeKey, "/"), nil
}

func BuildModelUsageMediaURL(userId int, relativeKey string) string {
	relativeKey = strings.TrimPrefix(strings.TrimSpace(relativeKey), "/")
	access, err := IssueModelUsageMediaAccess(userId, relativeKey)
	if err != nil {
		return modelUsageMediaURLPrefix + relativeKey
	}
	return modelUsageMediaURLPrefix + relativeKey + "?access=" + url.QueryEscape(access)
}

func IssueModelUsageMediaAccess(userId int, relativeKey string) (string, error) {
	relativeKey = strings.TrimSpace(relativeKey)
	if userId <= 0 || relativeKey == "" || common.CryptoSecret == "" {
		return "", ErrModelUsageInvalidRequest
	}
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = mac.Write(modelUsageMediaAccessMessage(userId, relativeKey))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func VerifyModelUsageMediaAccess(access string, userId int, relativeKey string) bool {
	if len(access) != modelUsageMediaAccessLength || userId <= 0 || relativeKey == "" || common.CryptoSecret == "" {
		return false
	}
	actual, err := base64.RawURLEncoding.Strict().DecodeString(access)
	if err != nil || len(actual) != sha256.Size {
		return false
	}
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = mac.Write(modelUsageMediaAccessMessage(userId, relativeKey))
	return hmac.Equal(actual, mac.Sum(nil))
}

func modelUsageMediaAccessMessage(userId int, relativeKey string) []byte {
	return []byte(modelUsageMediaAccessVersion + "\x00" + strconv.Itoa(userId) + "\x00" + relativeKey)
}

func modelUsageOwnerID(relativeKey string) (int, bool) {
	parts := strings.Split(relativeKey, "/")
	if len(parts) < 3 || parts[0] != "model-usage" {
		return 0, false
	}
	id, err := strconv.Atoi(parts[1])
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func decodeModelUsageMediaKey(raw string) (string, error) {
	raw = strings.TrimSpace(strings.TrimPrefix(raw, "/"))
	if raw == "" {
		return "", ErrModelUsageInvalidRequest
	}
	decoded, err := url.PathUnescape(raw)
	if err != nil {
		return "", ErrModelUsageInvalidRequest
	}
	decoded = strings.TrimPrefix(decoded, "/")
	if decoded == "" || strings.Contains(decoded, "..") || !strings.HasPrefix(decoded, "model-usage/") {
		return "", ErrModelUsageInvalidRequest
	}
	return decoded, nil
}

func persistModelUsageImages(ctx context.Context, userId int, modelName, messageID string, sources []string) ([]string, error) {
	if !GetObjectBlobStore().Enabled() {
		return nil, ErrModelUsageObjectStoreRequired
	}
	urls := make([]string, 0, len(sources))
	for index, source := range sources {
		url, err := persistModelUsageImageAt(ctx, userId, modelName, messageID, index, source)
		if err != nil {
			return nil, err
		}
		urls = append(urls, url)
	}
	return urls, nil
}

// persistModelUsageImageAt 写入单张图；若 source 已是本用户 media 短链则直接复用，不再重传。
func persistModelUsageImageAt(ctx context.Context, userId int, modelName, messageID string, index int, source string) (string, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return "", ErrModelUsageInvalidRequest
	}
	if relative, ok := modelUsageMediaRelativeKey(source); ok {
		owner, ownerOK := modelUsageOwnerID(relative)
		if !ownerOK || owner != userId {
			return "", ErrModelUsageInvalidRequest
		}
		return BuildModelUsageMediaURL(userId, relative), nil
	}
	store := GetObjectBlobStore()
	if !store.Enabled() {
		return "", ErrModelUsageObjectStoreRequired
	}
	body, contentType, size, ext, err := loadModelUsageMediaBytes(source, true)
	if err != nil {
		return "", err
	}
	relative := fmt.Sprintf(
		"model-usage/%d/%s/%s/%d.%s",
		userId,
		sanitizeModelUsagePath(modelName),
		sanitizeModelUsagePath(messageID),
		index,
		ext,
	)
	fullKey := store.Prefix() + relative
	if _, err := store.PutObject(ctx, fullKey, contentType, bytes.NewReader(body), size); err != nil {
		return "", err
	}
	return BuildModelUsageMediaURL(userId, relative), nil
}

func modelUsageMediaRelativeKey(source string) (string, bool) {
	source = strings.TrimSpace(source)
	if source == "" {
		return "", false
	}
	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		parsed, err := url.Parse(source)
		if err != nil {
			return "", false
		}
		source = parsed.Path
	}
	pathOnly, _, _ := strings.Cut(source, "?")
	if after, ok := strings.CutPrefix(pathOnly, modelUsageMediaURLPrefix); ok {
		relative, err := decodeModelUsageMediaKey(after)
		if err != nil {
			return "", false
		}
		return relative, true
	}
	return "", false
}

func persistOrTrackModelUsageVideos(ctx context.Context, userId int, modelName, messageID string, taskIDs []string) ([]model.ModelUsageVideo, string, error) {
	if len(taskIDs) == 0 {
		return nil, "", ErrModelUsageInvalidRequest
	}
	videos := make([]model.ModelUsageVideo, 0, len(taskIDs))
	pending := false
	failed := 0
	for index, taskID := range taskIDs {
		taskID = strings.TrimSpace(taskID)
		if taskID == "" {
			continue
		}
		task, exist, err := model.GetByTaskId(userId, taskID)
		if err != nil {
			return nil, "", err
		}
		if !exist || task == nil {
			videos = append(videos, model.ModelUsageVideo{TaskID: taskID})
			pending = true
			continue
		}
		switch task.Status {
		case model.TaskStatusSuccess:
			store := GetObjectBlobStore()
			if !store.Enabled() {
				return nil, "", ErrModelUsageObjectStoreRequired
			}
			body, contentType, size, ext, err := loadTaskResultBytes(task)
			if err != nil {
				return nil, "", err
			}
			relative := fmt.Sprintf("model-usage/%d/%s/%s/v%d.%s", userId, sanitizeModelUsagePath(modelName), sanitizeModelUsagePath(messageID), index, ext)
			fullKey := store.Prefix() + relative
			if _, err := store.PutObject(ctx, fullKey, contentType, bytes.NewReader(body), size); err != nil {
				return nil, "", err
			}
			videos = append(videos, model.ModelUsageVideo{
				TaskID: taskID,
				URL:    BuildModelUsageMediaURL(userId, relative),
			})
		case model.TaskStatusFailure:
			videos = append(videos, model.ModelUsageVideo{TaskID: taskID})
			failed++
		default:
			videos = append(videos, model.ModelUsageVideo{TaskID: taskID})
			pending = true
		}
	}
	if len(videos) == 0 {
		return nil, "", ErrModelUsageInvalidRequest
	}
	if pending {
		return videos, "pending", nil
	}
	if failed == len(videos) {
		return videos, "error", nil
	}
	return videos, "done", nil
}

func loadTaskResultBytes(task *model.Task) ([]byte, string, int64, string, error) {
	resultURL := task.GetResultURL()
	if resultURL == "" {
		return nil, "", 0, "", errors.New("task has no result url")
	}
	if strings.HasPrefix(resultURL, "data:") {
		return decodeDataURL(resultURL, false)
	}
	if strings.HasPrefix(resultURL, "/") {
		base := strings.TrimRight(system_setting.ServerAddress, "/")
		if base == "" {
			return nil, "", 0, "", errors.New("server address is not configured for task proxy url")
		}
		resultURL = base + resultURL
	}
	return fetchRemoteMediaBytes(resultURL, false)
}

func loadModelUsageMediaBytes(source string, imageOnly bool) ([]byte, string, int64, string, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, "", 0, "", ErrModelUsageInvalidRequest
	}
	if strings.HasPrefix(source, "data:") {
		return decodeDataURL(source, imageOnly)
	}
	if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		return fetchRemoteMediaBytes(source, imageOnly)
	}
	return nil, "", 0, "", ErrModelUsageInvalidRequest
}

func decodeDataURL(dataURL string, imageOnly bool) ([]byte, string, int64, string, error) {
	header, encoded, ok := strings.Cut(dataURL, ",")
	if !ok || !strings.HasPrefix(header, "data:") {
		return nil, "", 0, "", ErrModelUsageInvalidRequest
	}
	meta := strings.TrimPrefix(header, "data:")
	if !strings.Contains(meta, "base64") {
		return nil, "", 0, "", ErrModelUsageInvalidRequest
	}
	contentType, _, _ := strings.Cut(meta, ";")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if imageOnly && !strings.HasPrefix(contentType, "image/") {
		return nil, "", 0, "", ErrModelUsageInvalidRequest
	}
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(encoded)
	}
	if err != nil {
		return nil, "", 0, "", ErrModelUsageInvalidRequest
	}
	if len(raw) == 0 || len(raw) > maxModelUsageInlineDataBytes {
		return nil, "", 0, "", ErrModelUsageInvalidRequest
	}
	return raw, contentType, int64(len(raw)), extensionForMIME(contentType), nil
}

func fetchRemoteMediaBytes(rawURL string, imageOnly bool) ([]byte, string, int64, string, error) {
	resp, err := DoDownloadRequest(rawURL)
	if err != nil {
		return nil, "", 0, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", 0, "", fmt.Errorf("download failed: HTTP %d", resp.StatusCode)
	}
	contentType := resp.Header.Get("Content-Type")
	if imageOnly {
		if contentType != "application/octet-stream" && !strings.HasPrefix(contentType, "image/") {
			return nil, "", 0, "", fmt.Errorf("invalid content type: %s", contentType)
		}
	}
	maxSize := int64(maxModelUsageVideoBytes)
	if imageOnly {
		maxSize = int64(constant.MaxFileDownloadMB) * 1024 * 1024
		if maxSize <= 0 {
			maxSize = maxModelUsageInlineDataBytes
		}
	}
	if resp.ContentLength > maxSize {
		return nil, "", 0, "", errors.New("media exceeds size limit")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxSize+1))
	if err != nil {
		return nil, "", 0, "", err
	}
	if int64(len(body)) > maxSize {
		return nil, "", 0, "", errors.New("media exceeds size limit")
	}
	if contentType == "" || contentType == "application/octet-stream" {
		if imageOnly {
			contentType = "image/png"
		} else {
			contentType = "video/mp4"
		}
	}
	return body, contentType, int64(len(body)), extensionForMIME(contentType), nil
}

func extensionForMIME(contentType string) string {
	contentType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch contentType {
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "video/webm":
		return "webm"
	case "video/quicktime":
		return "mov"
	default:
		if strings.HasPrefix(contentType, "video/") {
			return "mp4"
		}
		if strings.HasPrefix(contentType, "image/") {
			return "png"
		}
		return "bin"
	}
}

func sanitizeModelUsagePath(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "x"
	}
	var builder strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_', r == '.':
			builder.WriteRune(r)
		default:
			builder.WriteByte('_')
		}
	}
	out := builder.String()
	if out == "" || out == "." || out == ".." {
		return "x"
	}
	if utf8.RuneCountInString(out) > 80 {
		runes := []rune(out)
		out = string(runes[:80])
	}
	return out
}

func validatePersistedMessage(message model.ModelUsageMessage) error {
	if containsDataURL(message.Content) {
		return ErrModelUsageInvalidRequest
	}
	for _, image := range message.Images {
		if !strings.HasPrefix(image, modelUsageMediaURLPrefix) {
			return ErrModelUsageInvalidRequest
		}
	}
	for _, video := range message.Videos {
		if video.URL != "" && !strings.HasPrefix(video.URL, modelUsageMediaURLPrefix) {
			return ErrModelUsageInvalidRequest
		}
	}
	return nil
}

func containsDataURL(value string) bool {
	return strings.Contains(value, "data:")
}

func removeTurn(messages []model.ModelUsageMessage, turnID string) []model.ModelUsageMessage {
	if turnID == "" {
		return messages
	}
	out := make([]model.ModelUsageMessage, 0, len(messages))
	for _, message := range messages {
		if message.TurnID == turnID {
			continue
		}
		out = append(out, message)
	}
	return out
}

func collectVideoTaskIDs(videos []model.ModelUsageVideo) []string {
	ids := make([]string, 0, len(videos))
	for _, video := range videos {
		if video.TaskID != "" {
			ids = append(ids, video.TaskID)
		}
	}
	return ids
}

func sessionToDTO(session *model.ModelUsageSession) *ModelUsageSessionDTO {
	if session == nil {
		return &ModelUsageSessionDTO{Messages: []model.ModelUsageMessage{}}
	}
	messages := []model.ModelUsageMessage(session.Messages)
	if messages == nil {
		messages = []model.ModelUsageMessage{}
	}
	return &ModelUsageSessionDTO{
		ModelName:   session.ModelName,
		Messages:    refreshModelUsageMediaURLs(messages),
		ImageConfig: session.ImageConfig,
		VideoConfig: session.VideoConfig,
	}
}

// refreshModelUsageMediaURLs 用当前 CryptoSecret 重签短链，避免换号/重启后旧 access 失效。
func refreshModelUsageMediaURLs(messages []model.ModelUsageMessage) []model.ModelUsageMessage {
	if len(messages) == 0 {
		return messages
	}
	out := make([]model.ModelUsageMessage, len(messages))
	copy(out, messages)
	for i := range out {
		if len(out[i].Images) > 0 {
			images := make([]string, len(out[i].Images))
			for j, src := range out[i].Images {
				images[j] = resignModelUsageMediaURL(src)
			}
			out[i].Images = images
		}
		if len(out[i].Videos) > 0 {
			videos := make([]model.ModelUsageVideo, len(out[i].Videos))
			copy(videos, out[i].Videos)
			for j := range videos {
				if videos[j].URL != "" {
					videos[j].URL = resignModelUsageMediaURL(videos[j].URL)
				}
			}
			out[i].Videos = videos
		}
	}
	return out
}

func resignModelUsageMediaURL(source string) string {
	relative, ok := modelUsageMediaRelativeKey(source)
	if !ok {
		return source
	}
	owner, ownerOK := modelUsageOwnerID(relative)
	if !ownerOK {
		return source
	}
	return BuildModelUsageMediaURL(owner, relative)
}
