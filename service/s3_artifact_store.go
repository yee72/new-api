package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
)

const artifactStoreBackendS3 = "s3"

type s3ArtifactStore struct {
	client *s3.Client
	bucket string
	prefix string
}

func newS3ArtifactStore(config system_setting.TaskArtifactStoreConfig) (*s3ArtifactStore, error) {
	endpoint := strings.TrimRight(strings.TrimSpace(config.S3Endpoint), "/")
	if endpoint == "" || config.S3Bucket == "" || config.S3Region == "" {
		return nil, errors.New("incomplete S3 artifact store configuration")
	}
	client := s3.New(s3.Options{
		BaseEndpoint: aws.String(endpoint),
		Region:       config.S3Region,
		Credentials:  credentials.NewStaticCredentialsProvider(config.S3AccessKey, config.S3SecretKey, ""),
		UsePathStyle: true,
	})
	prefix := strings.TrimSpace(config.S3Prefix)
	if prefix != "" && !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}
	return &s3ArtifactStore{client: client, bucket: config.S3Bucket, prefix: prefix}, nil
}

func (s *s3ArtifactStore) Enabled() bool {
	return s != nil && s.client != nil
}

func (s *s3ArtifactStore) objectKey(relative string) string {
	return s.prefix + strings.TrimPrefix(relative, "/")
}

func (s *s3ArtifactStore) taskObjectKey(taskID, artifactKey string) string {
	return s.objectKey(fmt.Sprintf("tasks/%s/%s", taskID, artifactKey))
}

func (s *s3ArtifactStore) Resolve(task *model.Task, artifactKey string) (*StoredArtifactRef, error) {
	if task == nil || artifactKey == "" {
		return nil, nil
	}
	if ref, ok := task.PrivateData.ArtifactRefs[artifactKey]; ok && ref.ObjectKey != "" {
		return &StoredArtifactRef{
			Backend:   artifactStoreBackendS3,
			Bucket:    firstNonEmpty(ref.Bucket, s.bucket),
			ObjectKey: ref.ObjectKey,
			MimeType:  ref.MimeType,
			Size:      ref.Size,
		}, nil
	}
	return nil, nil
}

func (s *s3ArtifactStore) Persist(ctx context.Context, task *model.Task, artifact types.TaskArtifact, content io.Reader) (*StoredArtifactRef, error) {
	if task == nil || strings.TrimSpace(task.TaskID) == "" || strings.TrimSpace(artifact.Key) == "" {
		return nil, errors.New("task and artifact key are required")
	}
	key := s.taskObjectKey(task.TaskID, artifact.Key)
	ref, err := s.PutObject(ctx, key, artifact.MimeType, content, -1)
	if err != nil {
		return nil, err
	}
	if task.PrivateData.ArtifactRefs == nil {
		task.PrivateData.ArtifactRefs = make(map[string]model.StoredArtifactRef)
	}
	task.PrivateData.ArtifactRefs[artifact.Key] = model.StoredArtifactRef{
		Backend:   ref.Backend,
		Bucket:    ref.Bucket,
		ObjectKey: ref.ObjectKey,
		MimeType:  ref.MimeType,
		Size:      ref.Size,
	}
	return ref, nil
}

func (s *s3ArtifactStore) Serve(c *gin.Context, _ *model.Task, ref *StoredArtifactRef) error {
	if ref == nil || ref.ObjectKey == "" {
		return errors.New("artifact reference is empty")
	}
	return s.ServeObject(c, ref.ObjectKey, ref.MimeType)
}

// PutObject writes bytes under an absolute object key (already includes prefix).
func (s *s3ArtifactStore) PutObject(ctx context.Context, objectKey, contentType string, body io.Reader, size int64) (*StoredArtifactRef, error) {
	if !s.Enabled() {
		return nil, ErrTaskArtifactStoreDisabled
	}
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" || strings.Contains(objectKey, "..") {
		return nil, errors.New("invalid object key")
	}
	input := &s3.PutObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
		Body:   body,
	}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	if size >= 0 {
		input.ContentLength = aws.Int64(size)
	}
	if _, err := s.client.PutObject(ctx, input); err != nil {
		return nil, fmt.Errorf("put object: %w", err)
	}
	return &StoredArtifactRef{
		Backend:   artifactStoreBackendS3,
		Bucket:    s.bucket,
		ObjectKey: objectKey,
		MimeType:  contentType,
		Size:      size,
	}, nil
}

// ServeObject streams an object to the HTTP response.
func (s *s3ArtifactStore) ServeObject(c *gin.Context, objectKey, mimeType string) error {
	if !s.Enabled() {
		return ErrTaskArtifactStoreDisabled
	}
	objectKey = strings.TrimSpace(objectKey)
	if objectKey == "" || strings.Contains(objectKey, "..") {
		return errors.New("invalid object key")
	}
	out, err := s.client.GetObject(c.Request.Context(), &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return fmt.Errorf("get object: %w", err)
	}
	defer out.Body.Close()

	contentType := mimeType
	if contentType == "" && out.ContentType != nil {
		contentType = *out.ContentType
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	if out.ContentLength != nil && *out.ContentLength >= 0 {
		c.Header("Content-Length", fmt.Sprintf("%d", *out.ContentLength))
	}
	if out.ETag != nil && *out.ETag != "" {
		c.Header("ETag", *out.ETag)
	}
	c.Status(http.StatusOK)
	_, err = io.Copy(c.Writer, out.Body)
	return err
}

func (s *s3ArtifactStore) Prefix() string {
	if s == nil {
		return ""
	}
	return s.prefix
}

func (s *s3ArtifactStore) Bucket() string {
	if s == nil {
		return ""
	}
	return s.bucket
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// ObjectBlobStore is the key/value blob API used by model-usage media.
type ObjectBlobStore interface {
	Enabled() bool
	Prefix() string
	PutObject(ctx context.Context, objectKey, contentType string, body io.Reader, size int64) (*StoredArtifactRef, error)
	ServeObject(c *gin.Context, objectKey, mimeType string) error
}

var objectBlobStoreOverride ObjectBlobStore

func GetObjectBlobStore() ObjectBlobStore {
	if objectBlobStoreOverride != nil {
		return objectBlobStoreOverride
	}
	if store, ok := taskArtifactStore.(*s3ArtifactStore); ok && store.Enabled() {
		return store
	}
	return disabledObjectBlobStore{}
}

// SetObjectBlobStoreForTest replaces the blob store used by model-usage media.
func SetObjectBlobStoreForTest(store ObjectBlobStore) {
	objectBlobStoreOverride = store
}

type disabledObjectBlobStore struct{}

func (disabledObjectBlobStore) Enabled() bool  { return false }
func (disabledObjectBlobStore) Prefix() string { return "" }
func (disabledObjectBlobStore) PutObject(context.Context, string, string, io.Reader, int64) (*StoredArtifactRef, error) {
	return nil, ErrTaskArtifactStoreDisabled
}
func (disabledObjectBlobStore) ServeObject(*gin.Context, string, string) error {
	return ErrTaskArtifactStoreDisabled
}

func initS3ArtifactStoreFromConfig() {
	config := system_setting.LoadTaskArtifactStoreConfig()
	if config.Mode != system_setting.TaskArtifactStoreModeS3 {
		taskArtifactStore = &disabledArtifactStore{}
		return
	}
	store, err := newS3ArtifactStore(config)
	if err != nil {
		common.SysError("failed to initialize S3 artifact store: " + err.Error() + "; using disabled store")
		taskArtifactStore = &disabledArtifactStore{}
		return
	}
	taskArtifactStore = store
	common.SysLog("task artifact S3 store enabled bucket=" + config.S3Bucket)
}
