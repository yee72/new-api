package service

import (
	"context"
	"io"
	"net/url"
	"strings"
	"testing"
	"time"

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

	// 旧 access 失效时，资源所有者本人仍可通过 Bearer 访问
	common.CryptoSecret = "rotated-secret-for-model-usage"
	assert.False(t, VerifyModelUsageMediaAccess(access, 7, relative))
	key, err = ResolveModelUsageMediaObjectKey(7, relative, access)
	require.NoError(t, err)
	assert.Equal(t, "test/model-usage/7/flux/a1/0.png", key)
	_, err = ResolveModelUsageMediaObjectKey(0, relative, access)
	require.ErrorIs(t, err, ErrModelUsageMediaForbidden)
}

func TestSessionToDTORefreshesMediaAccess(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	relative := "model-usage/3/flux/a1/0.png"
	stale := modelUsageMediaURLPrefix + relative + "?access=stale-token-not-valid-hmac-value!!"
	dto := sessionToDTO(&model.ModelUsageSession{
		ModelName: "flux",
		Messages: []model.ModelUsageMessage{{
			ID: "a1", TurnID: "t1", Role: "assistant", Status: "done", MediaType: "image",
			Images: []string{stale},
			Videos: []model.ModelUsageVideo{{TaskID: "task1", URL: stale}},
		}},
	})
	require.Len(t, dto.Messages, 1)
	require.NotEmpty(t, dto.Messages[0].Images)
	assert.True(t, strings.HasPrefix(dto.Messages[0].Images[0], modelUsageMediaURLPrefix))
	assert.Contains(t, dto.Messages[0].Images[0], "access=")
	assert.NotEqual(t, stale, dto.Messages[0].Images[0])
	assert.NotEqual(t, stale, dto.Messages[0].Videos[0].URL)
	relativeKey, ok := modelUsageMediaRelativeKey(dto.Messages[0].Images[0])
	require.True(t, ok)
	parsed, err := url.Parse(dto.Messages[0].Images[0])
	require.NoError(t, err)
	assert.True(t, VerifyModelUsageMediaAccess(parsed.Query().Get("access"), 3, relativeKey))
}

func TestReplaceModelUsageSessionRejectsDataURLs(t *testing.T) {
	_, err := ReplaceModelUsageSession(1, "gpt", ModelUsageSessionDTO{
		Messages: []model.ModelUsageMessage{{
			ID: "a1", TurnID: "t1", Role: "assistant", Content: "data:image/png;base64,xx", Status: "done", MediaType: "text",
		}},
	})
	require.ErrorIs(t, err, ErrModelUsageInvalidRequest)
}

func TestCommitModelUsageTurnAllowsQuotedOutputAsAttachment(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	setupModelUsageSessionTestDB(t)
	_ = withMemoryBlobStore(t)

	workURL := BuildModelUsageMediaURL(
		7,
		"model-usage/outputs/7/flux/a0/0.png",
		time.Now().Add(24*time.Hour).Unix(),
	)
	dto, err := CommitModelUsageTurn(context.Background(), 7, "flux", ModelUsageTurnRequest{
		UserMessage: model.ModelUsageMessage{
			ID: "u2", TurnID: "t2", Role: "user", Content: "add wings", Status: "done", MediaType: "image",
			Attachments: []model.ModelUsageAttachment{{
				ID: "ref-1", Name: "work-1.png", Kind: "image", URL: workURL,
				ExpiresAt: time.Now().Add(24 * time.Hour).Unix(),
			}},
		},
		AssistantMessage: model.ModelUsageMessage{
			ID: "a2", TurnID: "t2", Role: "assistant", Content: "", Status: "done", MediaType: "image",
		},
		ImageSources: []string{"data:image/png;base64,iVBORw0KGgo="},
	})
	require.NoError(t, err)
	require.Len(t, dto.Messages[0].Attachments, 1)
	assert.Contains(t, dto.Messages[0].Attachments[0].URL, "model-usage/outputs/7/")
}

func TestUploadModelUsageAttachmentPersistsMetadataOnly(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	setupModelUsageSessionTestDB(t)
	store := withMemoryBlobStore(t)

	attachment, err := UploadModelUsageAttachment(
		context.Background(),
		9,
		"notes.csv",
		"text/csv",
		5,
		strings.NewReader("a,b,c\n"),
	)
	require.NoError(t, err)
	require.NotNil(t, attachment)
	assert.Equal(t, "notes.csv", attachment.Name)
	assert.Equal(t, "sheet", attachment.Kind)
	assert.True(t, strings.HasPrefix(attachment.URL, modelUsageMediaURLPrefix))
	assert.Contains(t, attachment.URL, "model-usage/attachments/9/")
	assert.Greater(t, attachment.ExpiresAt, time.Now().Unix())
	assert.NotEmpty(t, store.objects)

	dto, err := CommitModelUsageTurn(context.Background(), 9, "gpt-4o", ModelUsageTurnRequest{
		UserMessage: model.ModelUsageMessage{
			ID: "u1", TurnID: "t1", Role: "user", Content: "see file", Status: "done", MediaType: "text",
			Attachments: []model.ModelUsageAttachment{*attachment},
		},
		AssistantMessage: model.ModelUsageMessage{
			ID: "a1", TurnID: "t1", Role: "assistant", Content: "ok", Status: "done", MediaType: "text",
		},
	})
	require.NoError(t, err)
	require.Len(t, dto.Messages[0].Attachments, 1)
	assert.Equal(t, "notes.csv", dto.Messages[0].Attachments[0].Name)
}

func TestModelUsageOwnerIDSupportsPrefixedPaths(t *testing.T) {
	id, ok := modelUsageOwnerID("model-usage/attachments/12/abc/file.csv")
	assert.True(t, ok)
	assert.Equal(t, 12, id)
	id, ok = modelUsageOwnerID("model-usage/outputs/8/m/a/0.png")
	assert.True(t, ok)
	assert.Equal(t, 8, id)
	id, ok = modelUsageOwnerID("model-usage/8/m/a/0.png")
	assert.True(t, ok)
	assert.Equal(t, 8, id)
	id, ok = modelUsageOwnerID("creative/references/9/abc.webp")
	assert.True(t, ok)
	assert.Equal(t, 9, id)
	_, ok = modelUsageOwnerID("creative/other/9/abc.webp")
	assert.False(t, ok)
}

func TestDecodeModelUsageMediaKeyAllowsCreativePrefix(t *testing.T) {
	key, err := decodeModelUsageMediaKey("creative/references/1/a.webp")
	require.NoError(t, err)
	assert.Equal(t, "creative/references/1/a.webp", key)
	_, err = decodeModelUsageMediaKey("other/references/1/a.webp")
	require.ErrorIs(t, err, ErrModelUsageInvalidRequest)
}

func TestResolveCreativeReferenceMediaAccess(t *testing.T) {
	common.CryptoSecret = "test-secret-for-creative-media"
	relative := "creative/references/7/shot.webp"
	access, err := IssueModelUsageMediaAccess(7, relative)
	require.NoError(t, err)
	withMemoryBlobStore(t)
	key, err := ResolveModelUsageMediaObjectKey(0, relative, access)
	require.NoError(t, err)
	assert.Equal(t, "test/creative/references/7/shot.webp", key)
	key, err = ResolveModelUsageMediaObjectKey(7, relative, "")
	require.NoError(t, err)
	assert.Equal(t, "test/creative/references/7/shot.webp", key)
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
