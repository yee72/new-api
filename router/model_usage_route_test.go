package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestModelUsageSessionRouteMatchesDottedModelName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	g := api.Group("/model-usage")
	g.GET("/sessions/:model", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"model": c.Param("model")})
	})
	r.NoRoute(controller.RelayNotFound)

	req := httptest.NewRequest(http.MethodGet, "/api/model-usage/sessions/gpt-5.5", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code, w.Body.String())
	assert.Contains(t, w.Body.String(), "gpt-5.5")
	assert.NotContains(t, w.Body.String(), "Invalid URL")
}
