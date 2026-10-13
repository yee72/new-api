package service

import (
	"errors"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
)

// ErrInvalidModelUsageVendorIDs 表示 vendor_ids 含非整数或 0。
// 负数是默认定价展示厂商，例如 OpenAI 为 -1012，属于合法筛选值。
var ErrInvalidModelUsageVendorIDs = errors.New("invalid vendor_ids")

const modelUsageCacheTTL = 2 * time.Minute

// 模型使用页的实际调用协议（与 Tab 用的 model_type 解耦）。
const (
	InvokeProtocolChat   = "chat"
	InvokeProtocolImages = "images"
	InvokeProtocolVideos = "videos"
)

type ModelUsageItem struct {
	ID                     int                     `json:"id"`
	ModelName              string                  `json:"model_name"`
	Description            string                  `json:"description,omitempty"`
	Icon                   string                  `json:"icon,omitempty"`
	ModelType              string                  `json:"model_type"`
	InvokeProtocol         string                  `json:"invoke_protocol"`
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

func GetModelUsageCatalog(userId int, typeFilter, keyword, rawVendorIDs string) (*ModelUsageListResponse, error) {
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

	baseItems, vendors, err := loadModelUsageCatalog()
	if err != nil {
		return nil, err
	}

	// 个人近 7 天用量；未登录仅用管理员手动增量排序
	usageByName := map[string]int64{}
	if userId > 0 {
		end := time.Now().Unix()
		start := end - 7*24*3600
		totals, usageErr := model.GetModelUsageRequestTotalsByUser(userId, start, end)
		if usageErr != nil {
			return nil, usageErr
		}
		usageByName = make(map[string]int64, len(totals))
		for _, row := range totals {
			usageByName[row.ModelName] = row.TotalCount
		}
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
	filtered := make([]ModelUsageItem, 0, len(baseItems))
	for _, item := range baseItems {
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
		item.ActualUsage7d = usageByName[item.ModelName]
		item.DisplayUsage = item.ActualUsage7d + item.ManualUsage
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

	// 缓存仅存元数据与管理员手动增量；个人用量在 GetModelUsageCatalog 按用户叠加
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
			// 产品类型以元数据为准（可把 chat 协议模型标成 image/video Tab）
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
		// 调用协议：endpoint 优先，其次按产品类型（任务视频常无 openai-video）
		item.InvokeProtocol = resolveInvokeProtocol(p.SupportedEndpointTypes, item.ModelType)
		item.EndpointPath = endpointPathForProtocol(item.InvokeProtocol)
		items = append(items, item)
	}

	modelUsageCache = &modelUsageCacheEntry{
		expiresAt: time.Now().Add(modelUsageCacheTTL),
		items:     items,
		vendors:   vendors,
	}
	return items, vendors, nil
}

// sortModelUsageItems：display_usage（个人用量+管理员增量）降序，其次创建 时间、名称。
func sortModelUsageItems(items []ModelUsageItem) {
	if len(items) <= 1 {
		return
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].DisplayUsage != items[j].DisplayUsage {
			return items[i].DisplayUsage > items[j].DisplayUsage
		}
		if items[i].CreatedTime != items[j].CreatedTime {
			return items[i].CreatedTime > items[j].CreatedTime
		}
		return items[i].ModelName < items[j].ModelName
	})
}

func inferModelTypeFromEndpoints(endpoints []constant.EndpointType) string {
	switch resolveInvokeProtocol(endpoints, "") {
	case InvokeProtocolVideos:
		return model.ModelTypeVideo
	case InvokeProtocolImages:
		return model.ModelTypeImage
	default:
		return model.ModelTypeChat
	}
}

// resolveInvokeProtocol 决定模型使用页的实际调用协议。
// endpoint 有明确能力时优先；否则用 model_type（例如 Wan 任务视频标成 video 但无 openai-video）。
func resolveInvokeProtocol(endpoints []constant.EndpointType, modelType string) string {
	if slices.Contains(endpoints, constant.EndpointTypeOpenAIVideo) {
		return InvokeProtocolVideos
	}
	if slices.Contains(endpoints, constant.EndpointTypeImageGeneration) {
		return InvokeProtocolImages
	}
	switch model.NormalizeModelType(modelType) {
	case model.ModelTypeVideo:
		return InvokeProtocolVideos
	case model.ModelTypeImage:
		// 无 image-generation 端点时走 chat 生图（如 Gemini image）
		return InvokeProtocolChat
	default:
		return InvokeProtocolChat
	}
}

func endpointPathForProtocol(protocol string) string {
	switch protocol {
	case InvokeProtocolImages:
		return "/v1/images/generations"
	case InvokeProtocolVideos:
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
