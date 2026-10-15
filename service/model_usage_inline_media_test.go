package service

import (
	"context"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRewritePlaygroundInlineImagesChatMarkdown(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	store := withMemoryBlobStore(t)

	body := []byte(`{
		"id":"chatcmpl-1",
		"object":"chat.completion",
		"choices":[{"index":0,"message":{"role":"assistant","content":"![image](data:image/png;base64,aGVsbG8=)"},"finish_reason":"stop"}],
		"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}
	}`)
	out, err := RewritePlaygroundInlineImages(context.Background(), 9, "gemini-flash-image", "req-1", body)
	require.NoError(t, err)
	require.NotContains(t, string(out), "data:image/")
	require.Contains(t, string(out), modelUsageMediaURLPrefix)
	assert.NotEmpty(t, store.objects)
}

func TestRewritePlaygroundInlineImagesChatMessageImages(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	store := withMemoryBlobStore(t)

	body := []byte(`{
		"id":"BGzQaqeB",
		"object":"chat.completion",
		"choices":[{
			"index":0,
			"message":{
				"role":"assistant",
				"content":null,
				"images":[{"type":"image_url","image_url":{"url":"data:image/png;base64,aGVsbG8="},"index":0}]
			},
			"finish_reason":"stop"
		}],
		"usage":{"prompt_tokens":24,"completion_tokens":10,"total_tokens":34}
	}`)
	out, err := RewritePlaygroundInlineImages(context.Background(), 9, "gemini-3.1-flash-image", "req-img", body)
	require.NoError(t, err)
	require.NotContains(t, string(out), "data:image/")
	require.Contains(t, string(out), `"images"`)
	require.Contains(t, string(out), modelUsageMediaURLPrefix)
	assert.NotEmpty(t, store.objects)
}

func TestRewritePlaygroundInlineImagesImagesAPI(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	withMemoryBlobStore(t)

	body := []byte(`{"created":1,"data":[{"b64_json":"aGVsbG8="}]}`)
	out, err := RewritePlaygroundInlineImages(context.Background(), 3, "flux", "req-2", body)
	require.NoError(t, err)
	require.NotContains(t, string(out), "b64_json")
	require.Contains(t, string(out), `"url":"`+modelUsageMediaURLPrefix)
}

func TestRewritePlaygroundInlineImagesNoopWithoutStore(t *testing.T) {
	SetObjectBlobStoreForTest(nil)
	SetTaskArtifactStoreForTest(nil)
	body := []byte(`{"choices":[{"message":{"content":"data:image/png;base64,aGVsbG8="}}]}`)
	out, err := RewritePlaygroundInlineImages(context.Background(), 1, "m", "r", body)
	require.NoError(t, err)
	assert.Equal(t, string(body), string(out))
}

func TestCommitModelUsageTurnReusesMediaShortLink(t *testing.T) {
	common.CryptoSecret = "test-secret-for-model-usage"
	setupModelUsageSessionTestDB(t)
	withMemoryBlobStore(t)

	first, err := CommitModelUsageTurn(context.Background(), 42, "flux-reuse", ModelUsageTurnRequest{
		UserMessage: modelUsageUserMsg("u1", "t1", "draw"),
		AssistantMessage: model.ModelUsageMessage{
			ID: "a1", TurnID: "t1", Role: "assistant", Content: "", Status: "pending", MediaType: "image",
		},
		ImageSources: []string{"data:image/png;base64,aGVsbG8="},
	})
	require.NoError(t, err)
	require.NotEmpty(t, first.Messages[1].Images)
	mediaURL := first.Messages[1].Images[0]

	second, err := CommitModelUsageTurn(context.Background(), 42, "flux-reuse", ModelUsageTurnRequest{
		UserMessage: modelUsageUserMsg("u2", "t2", "again"),
		AssistantMessage: model.ModelUsageMessage{
			ID: "a2", TurnID: "t2", Role: "assistant", Content: "", Status: "pending", MediaType: "image",
		},
		ImageSources: []string{mediaURL},
	})
	require.NoError(t, err)
	require.Len(t, second.Messages, 4)
	assert.True(t, strings.HasPrefix(second.Messages[3].Images[0], modelUsageMediaURLPrefix))
}

func modelUsageUserMsg(id, turnID, content string) model.ModelUsageMessage {
	return model.ModelUsageMessage{
		ID: id, TurnID: turnID, Role: "user", Content: content, Status: "done", MediaType: "image",
	}
}
