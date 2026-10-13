package service

import (
	"errors"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
)

// ErrInvalidModelUsageVendorIDs 表示 vendor_ids 含非整数或 0。
// 负数是默认定价展示厂商，例如 OpenAI 为 -1012，属于合法筛选值。
var ErrInvalidModelUsageVendorIDs = errors.New("invalid vendor_ids")

const modelUsageCacheTTL = 2 * time.Minute

type ModelUsageItem struct {
	ID                     int                     `json:"id"`
	ModelName              string                  `json:"model_name"`
	Description            string                  `json:"description,omitempty"`
	Icon                   string                  `json:"icon,omitempty"`
	ModelType              string                  `json:"model_type"`
	VendorID               int                     `json:"vendor_id,omitempty"`
	VendorName             string                  `json:"vendor_name,omitempty"`
	VendorIcon             string                  `json:"vendor_icon,omitempty"`
	Status                 int                     `json:"status"`
	EndpointPath           string                  `json:"endpoint_path,omitempty"`
	SupportedEndpointTypes []constant.EndpointType `json:"supported_endpoint_types,omitempty"`
	CreatedTime            int64                   `json:"created_time"`
	ManualUsage            int64                   `json:"manual_usage"`
	ActualUsage7d          int64                   `json:"actual_usage_7d"`
	DisplayUsage           int64                   `json:"display_usage"`
	GenerationCapabilities string                  `json:"generation_capabilities,omitempty"`
}

type ModelUsageListResponse struct {
	Models  []ModelUsageItem      `json:"models"`
	Vendors []model.PricingVendor `json:"vendors"`
}

type modelUsageCacheEntry struct {
	expiresAt time.Time
	items     []ModelUsageItem
	vendors   []model.PricingVendor
}

var (
	modelUsageCacheMu sync.Mutex
	modelUsageCache   *modelUsageCacheEntry
)

func GetModelUsageCatalog(typeFilter, keyword, rawVendorIDs string) (*ModelUsageListResponse, error) {
	var vendorIDs []int
	for part := range strings.SplitSeq(strings.TrimSpace(rawVendorIDs), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.Atoi(part)
		if err != nil || id == 0 {
			return nil, ErrInvalidModelUsageVendorIDs
		}
		vendorIDs = append(vendorIDs, id)
	}

	items, vendors, err := loadModelUsageCatalog()
	if err != nil {
		return nil, err
	}

	normalizedType := strings.TrimSpace(strings.ToLower(typeFilter))
	if normalizedType == "" || normalizedType == "all" {
		normalizedType = "all"
	}
	keyword = strings.TrimSpace(strings.ToLower(keyword))
	vendorSet := make(map[int]struct{}, len(vendorIDs))
	for _, id := range vendorIDs {
		vendorSet[id] = struct{}{}
	}

	// 搜索与厂商互斥：有 keyword 时忽略厂商
	useSearch := keyword != ""
	filtered := make([]ModelUsageItem, 0, len(items))
	for _, item := range items {
		if normalizedType != "all" && item.ModelType != normalizedType {
			continue
		}
		if useSearch {
			if !strings.Contains(strings.ToLower(item.ModelName), keyword) {
				continue
			}
		} else if len(vendorSet) > 0 {
			if _, ok := vendorSet[item.VendorID]; !ok {
				continue
			}
		}
		filtered = append(filtered, item)
	}

	sortModelUsageItems(filtered)
	return &ModelUsageListResponse{Models: filtered, Vendors: vendors}, nil
}

func loadModelUsageCatalog() ([]ModelUsageItem, []model.PricingVendor, error) {
	modelUsageCacheMu.Lock()
	defer modelUsageCacheMu.Unlock()
	if modelUsageCache != nil && time.Now().Before(modelUsageCache.expiresAt) {
		return modelUsageCache.items, modelUsageCache.vendors, nil
	}

	pricing := model.GetPricing()
	vendors := model.GetVendors()
	vendorByID := make(map[int]model.PricingVendor, len(vendors))
	for _, v := range vendors {
		vendorByID[v.ID] = v
	}

	var metas []model.Model
	if err := model.DB.Find(&metas).Error; err != nil {
		return nil, nil, err
	}
	names := make([]string, 0, len(pricing))
	for _, p := range pricing {
		names = append(names, p.ModelName)
	}
	// 复用元数据匹配规则
	metaByName := map[string]*model.Model{}
	{
		// resolve via exported search: match pricing names against metadata
		for i := range metas {
			meta := &metas[i]
			if meta.NameRule == model.NameRuleExact {
				metaByName[meta.ModelName] = meta
			}
		}
		for _, rule := range []int{model.NameRulePrefix, model.NameRuleSuffix, model.NameRuleContains} {
			for i := range metas {
				meta := &metas[i]
				if meta.NameRule != rule {
					continue
				}
				for _, name := range names {
					if _, exists := metaByName[name]; !exists && meta.MatchesName(name) {
						metaByName[name] = meta
					}
				}
			}
		}
	}

	end := time.Now().Unix()
	start := end - 7*24*3600
	totals, err := model.GetModelUsageRequestTotals(start, end)
	if err != nil {
		return nil, nil, err
	}
	usageByName := make(map[string]int64, len(totals))
	for _, row := range totals {
		usageByName[row.ModelName] = row.TotalCount
	}

	items := make([]ModelUsageItem, 0, len(pricing))
	for _, p := range pricing {
		meta := metaByName[p.ModelName]
		item := ModelUsageItem{
			ModelName:              p.ModelName,
			Description:            p.Description,
			Icon:                   p.Icon,
			ModelType:              model.ModelTypeChat,
			VendorID:               p.VendorID,
			Status:                 1,
			SupportedEndpointTypes: p.SupportedEndpointTypes,
			EndpointPath:           defaultEndpointPath(p.SupportedEndpointTypes),
		}
		if vendor, ok := vendorByID[p.VendorID]; ok {
			item.VendorName = vendor.Name
			item.VendorIcon = vendor.Icon
			if item.Icon == "" {
				item.Icon = vendor.Icon
			}
		}
		if meta != nil {
			item.ID = meta.Id
			item.ModelType = model.NormalizeModelType(meta.ModelType)
			item.ManualUsage = meta.ManualUsage
			item.CreatedTime = meta.CreatedTime
			item.GenerationCapabilities = meta.GenerationCapabilities
			item.Status = meta.Status
			if item.Description == "" {
				item.Description = meta.Description
			}
			if meta.Icon != "" {
				item.Icon = meta.Icon
			}
		} else {
			// 无元数据时按 endpoint 启发式类型
			item.ModelType = inferModelTypeFromEndpoints(p.SupportedEndpointTypes)
		}
		item.ActualUsage7d = usageByName[p.ModelName]
		item.DisplayUsage = item.ActualUsage7d + item.ManualUsage
		items = append(items, item)
	}

	modelUsageCache = &modelUsageCacheEntry{
		expiresAt: time.Now().Add(modelUsageCacheTTL),
		items:     items,
		vendors:   vendors,
	}
	return items, vendors, nil
}

func sortModelUsageItems(items []ModelUsageItem) {
	if len(items) <= 1 {
		return
	}
	indexed := make([]ModelUsageItem, len(items))
	copy(indexed, items)
	sort.SliceStable(indexed, func(i, j int) bool {
		if indexed[i].DisplayUsage != indexed[j].DisplayUsage {
			return indexed[i].DisplayUsage > indexed[j].DisplayUsage
		}
		if indexed[i].CreatedTime != indexed[j].CreatedTime {
			return indexed[i].CreatedTime > indexed[j].CreatedTime
		}
		return indexed[i].ModelName < indexed[j].ModelName
	})

	topN := min(3, len(indexed))
	top := indexed[:topN]
	rest := append([]ModelUsageItem(nil), indexed[topN:]...)
	sort.SliceStable(rest, func(i, j int) bool {
		if rest[i].CreatedTime != rest[j].CreatedTime {
			return rest[i].CreatedTime > rest[j].CreatedTime
		}
		return rest[i].ModelName < rest[j].ModelName
	})
	copy(items, append(top, rest...))
}

func inferModelTypeFromEndpoints(endpoints []constant.EndpointType) string {
	if slices.Contains(endpoints, constant.EndpointTypeOpenAIVideo) {
		return model.ModelTypeVideo
	}
	if slices.Contains(endpoints, constant.EndpointTypeImageGeneration) {
		return model.ModelTypeImage
	}
	return model.ModelTypeChat
}

func defaultEndpointPath(endpoints []constant.EndpointType) string {
	if len(endpoints) == 0 {
		return "/v1/chat/completions"
	}
	if info, ok := common.GetDefaultEndpointInfo(endpoints[0]); ok && info.Path != "" {
		return info.Path
	}
	switch endpoints[0] {
	case constant.EndpointTypeImageGeneration:
		return "/v1/images/generations"
	case constant.EndpointTypeOpenAIVideo:
		return "/v1/videos"
	default:
		return "/v1/chat/completions"
	}
}

// InvalidateModelUsageCache 元数据变更后清除缓存
func InvalidateModelUsageCache() {
	modelUsageCacheMu.Lock()
	defer modelUsageCacheMu.Unlock()
	modelUsageCache = nil
}
