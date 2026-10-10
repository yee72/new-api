package middleware

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
)

// PlaygroundPathAlias 将 /pg/... 改写为 /v1/...，便于任务插件按宿主协议路径认领；
// 同时打上 playground 标记，供计费与临时 Token 逻辑识别。
func PlaygroundPathAlias() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if after, ok := strings.CutPrefix(path, "/pg/"); ok {
			common.SetContextKey(c, constant.ContextKeyIsPlayground, true)
			c.Request.URL.Path = "/v1/" + after
		}
		c.Next()
	}
}
