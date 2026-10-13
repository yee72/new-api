package model

import (
	"database/sql/driver"
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	MaxModelUsageMessagesPerSession = 80
	MaxModelUsageModelNameLength    = 191
)

// ModelUsageSession stores one user's conversation for a single model.
type ModelUsageSession struct {
	Id          int                   `json:"id" gorm:"primaryKey"`
	UserId      int                   `json:"user_id" gorm:"uniqueIndex:uk_model_usage_user_model;index;not null"`
	ModelName   string                `json:"model_name" gorm:"type:varchar(191);uniqueIndex:uk_model_usage_user_model;not null"`
	Messages    ModelUsageMessageList `json:"messages" gorm:"type:text"`
	ImageConfig ModelUsageJSONMap     `json:"image_config" gorm:"type:text"`
	VideoConfig ModelUsageJSONMap     `json:"video_config" gorm:"type:text"`
	CreatedAt   int64                 `json:"created_at"`
	UpdatedAt   int64                 `json:"updated_at"`
}

// ModelUsageMessage is the persisted chat/image/video bubble shape.
type ModelUsageMessage struct {
	ID          string            `json:"id"`
	TurnID      string            `json:"turnId"`
	Role        string            `json:"role"`
	Content     string            `json:"content"`
	Status      string            `json:"status"`
	MediaType   string            `json:"mediaType"`
	Images      []string          `json:"images,omitempty"`
	Videos      []ModelUsageVideo `json:"videos,omitempty"`
	Prompt      string            `json:"prompt,omitempty"`
	ImageConfig map[string]any    `json:"imageConfig,omitempty"`
	VideoConfig map[string]any    `json:"videoConfig,omitempty"`
}

type ModelUsageVideo struct {
	TaskID string `json:"task_id,omitempty"`
	URL    string `json:"url,omitempty"`
}

type ModelUsageMessageList []ModelUsageMessage

func (m *ModelUsageMessageList) Scan(val any) error {
	bytesValue := jsonScanBytes(val)
	if len(bytesValue) == 0 {
		*m = nil
		return nil
	}
	return common.Unmarshal(bytesValue, m)
}

func (m ModelUsageMessageList) Value() (driver.Value, error) {
	if len(m) == 0 {
		return "[]", nil
	}
	b, err := common.Marshal(m)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

type ModelUsageJSONMap map[string]any

func (m *ModelUsageJSONMap) Scan(val any) error {
	bytesValue := jsonScanBytes(val)
	if len(bytesValue) == 0 {
		*m = nil
		return nil
	}
	return common.Unmarshal(bytesValue, m)
}

func (m ModelUsageJSONMap) Value() (driver.Value, error) {
	if len(m) == 0 {
		return "{}", nil
	}
	b, err := common.Marshal(m)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func NormalizeModelUsageModelName(modelName string) (string, error) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" || len(modelName) > MaxModelUsageModelNameLength {
		return "", errors.New("invalid model name")
	}
	if strings.Contains(modelName, "..") || strings.ContainsAny(modelName, "/\\") {
		return "", errors.New("invalid model name")
	}
	return modelName, nil
}

func GetModelUsageSession(userId int, modelName string) (*ModelUsageSession, error) {
	modelName, err := NormalizeModelUsageModelName(modelName)
	if err != nil {
		return nil, err
	}
	var session ModelUsageSession
	err = DB.Where("user_id = ? AND model_name = ?", userId, modelName).First(&session).Error
	if err != nil {
		return nil, err
	}
	return &session, nil
}

func UpsertModelUsageSession(session *ModelUsageSession) error {
	if session == nil {
		return errors.New("session is nil")
	}
	modelName, err := NormalizeModelUsageModelName(session.ModelName)
	if err != nil {
		return err
	}
	session.ModelName = modelName
	session.Messages = TrimModelUsageMessages(session.Messages)
	now := time.Now().Unix()
	if session.CreatedAt == 0 {
		session.CreatedAt = now
	}
	session.UpdatedAt = now

	var existing ModelUsageSession
	err = DB.Where("user_id = ? AND model_name = ?", session.UserId, session.ModelName).First(&existing).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return DB.Create(session).Error
		}
		return err
	}
	session.Id = existing.Id
	session.CreatedAt = existing.CreatedAt
	return DB.Model(&existing).Select("messages", "image_config", "video_config", "updated_at").Updates(session).Error
}

func TrimModelUsageMessages(messages []ModelUsageMessage) []ModelUsageMessage {
	if len(messages) <= MaxModelUsageMessagesPerSession {
		return messages
	}
	return messages[len(messages)-MaxModelUsageMessagesPerSession:]
}
