package service

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/model"
	"github.com/google/uuid"
)

const (
	modelUsageAttachmentTTL      = 3 * 24 * time.Hour
	modelUsageOutputTTL          = 90 * 24 * time.Hour
	maxModelUsageAttachmentBytes = 20 << 20
	maxModelUsageAttachmentImage = 10 << 20
	maxModelUsageAttachmentsMsg  = 5
)

// UploadModelUsageAttachment 将用户附件写入 R2 attachments 前缀，返回可落库的元数据。
func UploadModelUsageAttachment(ctx context.Context, userId int, fileName, contentType string, size int64, body io.Reader) (*model.ModelUsageAttachment, error) {
	if userId <= 0 || body == nil {
		return nil, ErrModelUsageInvalidRequest
	}
	store := GetObjectBlobStore()
	if !store.Enabled() {
		return nil, ErrModelUsageObjectStoreRequired
	}
	fileName = strings.TrimSpace(fileName)
	if fileName == "" || utf8.RuneCountInString(fileName) > 200 {
		return nil, ErrModelUsageInvalidRequest
	}
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(fileName), "."))
	kind, allowedMime := classifyModelUsageAttachment(ext, contentType)
	if kind == "" {
		return nil, ErrModelUsageInvalidRequest
	}
	limit := int64(maxModelUsageAttachmentBytes)
	if kind == "image" {
		limit = maxModelUsageAttachmentImage
	}
	if size < 0 || size > limit {
		return nil, ErrModelUsageInvalidRequest
	}
	if contentType == "" {
		contentType = allowedMime
	}
	id := strings.ReplaceAll(uuid.NewString(), "-", "")
	safeName := sanitizeModelUsagePath(fileName)
	if ext == "" {
		ext = "bin"
	}
	relative := fmt.Sprintf(
		"model-usage/attachments/%d/%s/%s.%s",
		userId,
		id,
		safeName,
		ext,
	)
	fullKey := store.Prefix() + relative
	limited := io.LimitReader(body, limit+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, ErrModelUsageInvalidRequest
	}
	if _, err := store.PutObject(ctx, fullKey, contentType, bytes.NewReader(data), int64(len(data))); err != nil {
		return nil, err
	}
	expiresAt := time.Now().Add(modelUsageAttachmentTTL).Unix()
	return &model.ModelUsageAttachment{
		ID:        id,
		Name:      fileName,
		Mime:      contentType,
		Size:      int64(len(data)),
		Kind:      kind,
		URL:       BuildModelUsageMediaURL(userId, relative, expiresAt),
		ExpiresAt: expiresAt,
	}, nil
}

func classifyModelUsageAttachment(ext, contentType string) (kind, mimeType string) {
	contentType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	switch ext {
	case "png", "jpg", "jpeg", "gif", "webp", "bmp":
		if contentType == "" {
			contentType = mime.TypeByExtension("." + ext)
		}
		return "image", contentType
	case "pdf":
		return "pdf", "application/pdf"
	case "xls", "xlsx", "csv":
		return "sheet", firstNonEmpty(contentType, "application/vnd.ms-excel")
	case "ppt", "pptx":
		return "ppt", firstNonEmpty(contentType, "application/vnd.ms-powerpoint")
	case "doc", "docx", "txt", "md":
		return "doc", firstNonEmpty(contentType, "application/msword")
	default:
		return "", ""
	}
}

func normalizePersistedAttachments(userId int, attachments []model.ModelUsageAttachment) ([]model.ModelUsageAttachment, error) {
	if len(attachments) == 0 {
		return nil, nil
	}
	if len(attachments) > maxModelUsageAttachmentsMsg {
		return nil, ErrModelUsageInvalidRequest
	}
	out := make([]model.ModelUsageAttachment, 0, len(attachments))
	now := time.Now().Unix()
	for _, item := range attachments {
		item.ID = strings.TrimSpace(item.ID)
		item.Name = strings.TrimSpace(item.Name)
		item.URL = strings.TrimSpace(item.URL)
		item.Kind = strings.TrimSpace(item.Kind)
		if item.ID == "" || item.Name == "" || item.URL == "" || item.Kind == "" {
			return nil, ErrModelUsageInvalidRequest
		}
		if containsDataURL(item.URL) || containsDataURL(item.Name) {
			return nil, ErrModelUsageInvalidRequest
		}
		relative, ok := modelUsageMediaRelativeKey(item.URL)
		if !ok || !strings.HasPrefix(relative, "model-usage/attachments/") {
			return nil, ErrModelUsageInvalidRequest
		}
		owner, ownerOK := modelUsageOwnerID(relative)
		if !ownerOK || owner != userId {
			return nil, ErrModelUsageInvalidRequest
		}
		if item.ExpiresAt <= 0 {
			item.ExpiresAt = parseModelUsageExpiresQuery(item.URL)
		}
		if item.ExpiresAt <= 0 {
			item.ExpiresAt = now + int64(modelUsageAttachmentTTL/time.Second)
		}
		item.URL = BuildModelUsageMediaURL(userId, relative, item.ExpiresAt)
		out = append(out, item)
	}
	return out, nil
}

func parseModelUsageExpiresQuery(source string) int64 {
	source = strings.TrimSpace(source)
	if source == "" {
		return 0
	}
	// 相对路径也可能带 query
	if i := strings.Index(source, "?"); i >= 0 {
		q := source[i+1:]
		for part := range strings.SplitSeq(q, "&") {
			key, value, ok := strings.Cut(part, "=")
			if !ok || key != "expires" {
				continue
			}
			n, err := strconv.ParseInt(value, 10, 64)
			if err != nil || n <= 0 {
				return 0
			}
			return n
		}
	}
	return 0
}
