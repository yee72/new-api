package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSortModelUsageItems_Top3ByDisplayUsageThenRestByCreatedTime(t *testing.T) {
	items := []ModelUsageItem{
		{ModelName: "a", DisplayUsage: 1, CreatedTime: 100},
		{ModelName: "b", DisplayUsage: 50, CreatedTime: 10},
		{ModelName: "c", DisplayUsage: 40, CreatedTime: 90},
		{ModelName: "d", DisplayUsage: 30, CreatedTime: 80},
		{ModelName: "e", DisplayUsage: 2, CreatedTime: 70},
	}

	sortModelUsageItems(items)

	assert.Equal(t, []string{"b", "c", "d", "a", "e"}, []string{
		items[0].ModelName,
		items[1].ModelName,
		items[2].ModelName,
		items[3].ModelName,
		items[4].ModelName,
	})
}
