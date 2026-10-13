package service

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupModelUsageSessionTestDB(t *testing.T) {
	t.Helper()
	previous := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.ModelUsageSession{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previous })
}

type memoryBlobStore struct {
	prefix  string
	objects map[string][]byte
	types   map[string]string
}

func newMemoryBlobStore() *memoryBlobStore {
	return &memoryBlobStore{
		prefix:  "test/",
		objects: map[string][]byte{},
		types:   map[string]string{},
	}
}

func (m *memoryBlobStore) Enabled() bool  { return true }
func (m *memoryBlobStore) Prefix() string { return m.prefix }
func (m *memoryBlobStore) PutObject(_ context.Context, objectKey, contentType string, body io.Reader, _ int64) (*StoredArtifactRef, error) {
	data, err := io.ReadAll(body)
	if err != nil {
		return nil, err
	}
	m.objects[objectKey] = data
	m.types[objectKey] = contentType
	return &StoredArtifactRef{Backend: "s3", Bucket: "test", ObjectKey: objectKey, MimeType: contentType, Size: int64(len(data))}, nil
}
func (m *memoryBlobStore) ServeObject(c *gin.Context, objectKey, _ string) error {
	data, ok := m.objects[objectKey]
	if !ok {
		return io.EOF
	}
	c.Data(200, m.types[objectKey], data)
	return nil
}

func withMemoryBlobStore(t *testing.T) *memoryBlobStore {
	t.Helper()
	store := newMemoryBlobStore()
	SetObjectBlobStoreForTest(store)
	t.Cleanup(func() { SetObjectBlobStoreForTest(nil) })
	return store
}

func TestCommitModelUsageTurnImageRequiresObjectStore(t *testing.T) {
	SetObjectBlobStoreForTest(nil)
	SetTaskArtifactStoreForTest(nil)
	_, err := CommitModelUsageTurn(context.Background(), 1, "image-model", ModelUsageTurnRequest{
		UserMessage: model.ModelUsageMessage{
			ID: "u1", TurnID: "t1", Role: "user", Content: "draw", Status: "done", MediaType: "image",
		},
		AssistantMessage: model.ModelUsageMessage{
			ID: "a1", TurnID: "t1", Role: "assistant", Content: "", Status: "pending", MediaType: "image",
		},
		ImageSources: []string{"data:image/png;base64,aGVsbG8="},
	})
	require.ErrorIs(t, err, ErrModelUsageObjectStoreRequired)
}

func TestCommitModelUsageTurnImagePersistsToObjectStore(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	setupModelUsageSessionTestDB(t)
	store := withMemoryBlobStore(t)

	dto, err := CommitModelUsageTurn(context.Background(), 42, "flux-test", ModelUsageTurnRequest{
		UserMessage: model.ModelUsageMessage{
			ID: "u1", TurnID: "t1", Role: "user", Content: "draw", Status: "done", MediaType: "image",
		},
		AssistantMessage: model.ModelUsageMessage{
			ID: "a1", TurnID: "t1", Role: "assistant", Content: "", Status: "pending", MediaType: "image",
		},
		ImageSources: []string{"data:image/png;base64,aGVsbG8="},
	})
	require.NoError(t, err)
	require.Len(t, dto.Messages, 2)
	require.NotEmpty(t, dto.Messages[1].Images)
	assert.True(t, strings.HasPrefix(dto.Messages[1].Images[0], modelUsageMediaURLPrefix))
	assert.NotEmpty(t, store.objects)
}

func TestCommitModelUsageTurnImageStripsDataURLContent(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	setupModelUsageSessionTestDB(t)
	withMemoryBlobStore(t)

	dto, err := CommitModelUsageTurn(context.Background(), 42, "gemini-flash-image", ModelUsageTurnRequest{
		UserMessage: model.ModelUsageMessage{
			ID: "u1", TurnID: "t1", Role: "user", Content: "一只猪在奔跑", Status: "done", MediaType: "image",
		},
		AssistantMessage: model.ModelUsageMessage{
			ID: "a1", TurnID: "t1", Role: "assistant",
			Content:   "![image](data:image/png;base64,aGVsbG8=)",
			Status:    "pending",
			MediaType: "image",
		},
		ImageSources: []string{"data:image/png;base64,aGVsbG8="},
	})
	require.NoError(t, err)
	require.Len(t, dto.Messages, 2)
	assert.Empty(t, dto.Messages[1].Content)
	require.NotEmpty(t, dto.Messages[1].Images)
}

func TestModelUsageMediaAccessBoundToOwner(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	relative := "model-usage/7/flux/a1/0.png"
	access, err := IssueModelUsageMediaAccess(7, relative)
	require.NoError(t, err)
	assert.True(t, VerifyModelUsageMediaAccess(access, 7, relative))
	assert.False(t, VerifyModelUsageMediaAccess(access, 8, relative))

	_, err = ResolveModelUsageMediaObjectKey(0, relative, access)
	require.ErrorIs(t, err, ErrModelUsageObjectStoreRequired)

	withMemoryBlobStore(t)
	key, err := ResolveModelUsageMediaObjectKey(0, relative, access)
	require.NoError(t, err)
	assert.Equal(t, "test/model-usage/7/flux/a1/0.png", key)

	_, err = ResolveModelUsageMediaObjectKey(8, relative, "")
	require.ErrorIs(t, err, ErrModelUsageMediaForbidden)
}

func TestReplaceModelUsageSessionRejectsDataURLs(t *testing.T) {
	_, err := ReplaceModelUsageSession(1, "gpt", ModelUsageSessionDTO{
		Messages: []model.ModelUsageMessage{{
			ID: "a1", TurnID: "t1", Role: "assistant", Content: "data:image/png;base64,xx", Status: "done", MediaType: "text",
		}},
	})
	require.ErrorIs(t, err, ErrModelUsageInvalidRequest)
}

func TestSanitizeAndDecodeHelpers(t *testing.T) {
	assert.Equal(t, "gpt-4o", sanitizeModelUsagePath("gpt-4o"))
	assert.Equal(t, "a_b", sanitizeModelUsagePath("a/b"))
	body, contentType, size, ext, err := decodeDataURL("data:image/png;base64,aGVsbG8=", true)
	require.NoError(t, err)
	assert.Equal(t, []byte("hello"), body)
	assert.Equal(t, "image/png", contentType)
	assert.Equal(t, int64(5), size)
	assert.Equal(t, "png", ext)
	_, _, _, _, err = decodeDataURL("data:text/plain;base64,aGVsbG8=", true)
	require.ErrorIs(t, err, ErrModelUsageInvalidRequest)
}
