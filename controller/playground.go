package controller

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

// Playground 浏览器会话下的对话试用（UserAuth → 临时 Token）
func Playground(c *gin.Context) {
	if !setupPlaygroundToken(c, types.RelayFormatOpenAI) {
		return
	}
	Relay(c, types.RelayFormatOpenAI)
}

// PlaygroundImage 浏览器会话下的图片生成试用
func PlaygroundImage(c *gin.Context) {
	if !setupPlaygroundToken(c, types.RelayFormatOpenAIImage) {
		return
	}
	RelayTaskPluginEndpoint(c, func(c *gin.Context) {
		Relay(c, types.RelayFormatOpenAIImage)
	})
}

// PlaygroundVideo 浏览器会话下的视频任务试用
func PlaygroundVideo(c *gin.Context) {
	if !setupPlaygroundToken(c, types.RelayFormatOpenAI) {
		return
	}
	RelayTaskPluginEndpoint(c, RelayTask)
}

// setupPlaygroundToken 校验会话并写入临时 Token 上下文；失败时已写响应
func setupPlaygroundToken(c *gin.Context, relayFormat types.RelayFormat) bool {
	if c.GetBool("use_access_token") {
		newAPIError := types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		c.JSON(newAPIError.StatusCode, gin.H{
			"error": newAPIError.ToOpenAIError(),
		})
		return false
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, relayFormat, nil, nil)
	if err != nil {
		newAPIError := types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		c.JSON(newAPIError.StatusCode, gin.H{
			"error": newAPIError.ToOpenAIError(),
		})
		return false
	}

	userId := c.GetInt("id")

	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError := types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		c.JSON(newAPIError.StatusCode, gin.H{
			"error": newAPIError.ToOpenAIError(),
		})
		return false
	}
	userCache.WriteContext(c)

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	_ = middleware.SetupContextForToken(c, tempToken)
	return true
}
