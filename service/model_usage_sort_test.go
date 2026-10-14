package service

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
)

func TestResolveInvokeProtocol(t *testing.T) {
	t.Parallel()
	assert.Equal(t, InvokeProtocolChat, resolveInvokeProtocol(nil, ""))
	assert.Equal(t, InvokeProtocolChat, resolveInvokeProtocol([]constant.EndpointType{constant.EndpointTypeOpenAI}, ""))
	assert.Equal(t, InvokeProtocolMessages, resolveInvokeProtocol([]constant.EndpointType{
		constant.EndpointTypeAnthropic,
		constant.EndpointTypeOpenAI,
	}, ""))
	assert.Equal(t, InvokeProtocolImages, resolveInvokeProtocol([]constant.EndpointType{
		constant.EndpointTypeImageGeneration,
		constant.EndpointTypeOpenAI,
	}, ""))
	assert.Equal(t, InvokeProtocolVideos, resolveInvokeProtocol([]constant.EndpointType{
		constant.EndpointTypeOpenAIVideo,
		constant.EndpointTypeImageGeneration,
	}, ""))
	// 任务视频常无 openai-video，按产品类型走视频 API
	assert.Equal(t, InvokeProtocolVideos, resolveInvokeProtocol(
		[]constant.EndpointType{constant.EndpointTypeOpenAI}, model.ModelTypeVideo,
	))
	assert.Equal(t, InvokeProtocolChat, resolveInvokeProtocol(
		[]constant.EndpointType{constant.EndpointTypeOpenAI}, model.ModelTypeImage,
	))
	// 图片类型即使带 anthropic 仍走 chat 生图路径
	assert.Equal(t, InvokeProtocolChat, resolveInvokeProtocol(
		[]constant.EndpointType{constant.EndpointTypeAnthropic}, model.ModelTypeImage,
	))
	assert.Equal(t, model.ModelTypeChat, inferModelTypeFromEndpoints([]constant.EndpointType{constant.EndpointTypeOpenAI}))
	assert.Equal(t, model.ModelTypeImage, inferModelTypeFromEndpoints([]constant.EndpointType{constant.EndpointTypeImageGeneration}))
	assert.Equal(t, "/v1/images/generations", endpointPathForProtocol(InvokeProtocolImages))
	assert.Equal(t, "/v1/videos", endpointPathForProtocol(InvokeProtocolVideos))
	assert.Equal(t, "/v1/messages", endpointPathForProtocol(InvokeProtocolMessages))
	assert.Equal(t, "/v1/chat/completions", endpointPathForProtocol(InvokeProtocolChat))
}

func TestSortModelUsageItems_ByDisplayUsageThenCreatedTime(t *testing.T) {
	items := []ModelUsageItem{
		{ModelName: "a", DisplayUsage: 1, CreatedTime: 100},
		{ModelName: "b", DisplayUsage: 50, CreatedTime: 10},
		{ModelName: "c", DisplayUsage: 40, CreatedTime: 90},
		{ModelName: "d", DisplayUsage: 30, CreatedTime: 80},
		{ModelName: "e", DisplayUsage: 2, CreatedTime: 70},
	}

	sortModelUsageItems(items)

	assert.Equal(t, []string{"b", "c", "d", "e", "a"}, []string{
		items[0].ModelName,
		items[1].ModelName,
		items[2].ModelName,
		items[3].ModelName,
		items[4].ModelName,
	})
}
