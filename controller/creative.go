package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func creativeActor(c *gin.Context) (int, string) {
	id := c.GetInt("id")
	name := c.GetString("username")
	return id, name
}

func creativeUserVisible() bool {
	if !model.IsCreativeGloballyEnabled() {
		return false
	}
	n, err := model.CountEnabledCreativeTypes()
	return err == nil && n > 0
}

// GetCreativeStatusPublic 供 /api/status 与前端判断菜单
func GetCreativeStatusPublic() gin.H {
	enabled := creativeUserVisible()
	return gin.H{
		"creative_enabled": enabled,
	}
}

// ——— 用户 API ———

func ListCreativeTypesUser(c *gin.Context) {
	if !creativeUserVisible() {
		common.ApiSuccess(c, []any{})
		return
	}
	items, err := model.ListCreativeTypes(true)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	out := make([]gin.H, 0, len(items))
	for _, item := range items {
		pkg, _ := model.ParseCreativePackage(item.PackageJSON)
		out = append(out, gin.H{
			"type_id":      item.TypeId,
			"title":        item.Title,
			"description":  item.Description,
			"icon":         item.Icon,
			"sort_order":   item.SortOrder,
			"billing_mode": item.BillingMode,
			"package":      pkg,
		})
	}
	common.ApiSuccess(c, out)
}

type createCreativeTaskRequest struct {
	TypeId      string `json:"type_id"`
	Platform    string `json:"platform"`
	Style       string `json:"style"`
	StyleCustom string `json:"style_custom"`
	ExtraText   string `json:"extra_text"`
	ImageKind   string `json:"image_kind"`
	ImageCount  int    `json:"image_count"`
}

func normalizeCreativeImageCount(count int) int {
	if count <= 0 {
		return 2
	}
	if count > 12 {
		return 12
	}
	return count
}

func normalizeCreativeImageKind(kind string) string {
	switch strings.TrimSpace(kind) {
	case model.CreativeAssetKindHero:
		return model.CreativeAssetKindHero
	default:
		return model.CreativeAssetKindDetail
	}
}

// creativeTaskUserView 用户侧任务视图：不透出 Token/额度数字
func creativeTaskUserView(task *model.CreativeTask) gin.H {
	if task == nil {
		return gin.H{}
	}
	return gin.H{
		"id":              task.Id,
		"user_id":         task.UserId,
		"type_id":         task.TypeId,
		"status":          task.Status,
		"platform":        task.Platform,
		"style":           task.Style,
		"style_custom":    task.StyleCustom,
		"extra_text":      task.ExtraText,
		"product_profile": task.ProductProfile,
		"image_kind":      task.ImageKind,
		"image_count":     task.ImageCount,
		"completed_at":    task.CompletedAt,
		"error_message":   task.ErrorMessage,
		"created_at":      task.CreatedAt,
		"updated_at":      task.UpdatedAt,
	}
}

func CreateCreativeTask(c *gin.Context) {
	if !creativeUserVisible() {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "创作面板未启用"})
		return
	}
	var req createCreativeTaskRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	req.TypeId = strings.TrimSpace(req.TypeId)
	if req.TypeId == "" {
		req.TypeId = model.CreativeTypeEcommerceSuite
	}
	ct, err := model.GetCreativeTypeByTypeId(req.TypeId)
	if err != nil || !ct.Enabled {
		common.ApiErrorMsg(c, "创作类型不可用")
		return
	}
	pkg, err := model.ParseCreativePackage(ct.PackageJSON)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if _, err := pkg.PlatformByKey(req.Platform); err != nil {
		common.ApiErrorMsg(c, "请选择平台")
		return
	}
	if strings.TrimSpace(req.Style) == "" {
		common.ApiErrorMsg(c, "请选择风格")
		return
	}
	if req.Style == "其他风格要求" && strings.TrimSpace(req.StyleCustom) == "" {
		common.ApiErrorMsg(c, "请填写其他风格要求")
		return
	}
	if len([]rune(req.StyleCustom)) > 200 {
		common.ApiErrorMsg(c, "风格说明不超过 200 字")
		return
	}
	snap, err := service.BuildCreativeConfigSnapshot(req.TypeId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	snapJSON, _ := common.Marshal(snap)
	now := model.CreativeNow()
	userId := c.GetInt("id")
	task := &model.CreativeTask{
		UserId:         userId,
		TypeId:         req.TypeId,
		Status:         model.CreativeTaskDraft,
		Platform:       req.Platform,
		Style:          req.Style,
		StyleCustom:    strings.TrimSpace(req.StyleCustom),
		ExtraText:      req.ExtraText,
		ImageKind:      normalizeCreativeImageKind(req.ImageKind),
		ImageCount:     normalizeCreativeImageCount(req.ImageCount),
		ConfigSnapshot: string(snapJSON),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if err := model.DB.Create(task).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, creativeTaskUserView(task))
}

func GetCreativeTask(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	assets, err := model.ListCreativeAssets(taskId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var snap service.CreativeConfigSnapshot
	_ = common.Unmarshal([]byte(task.ConfigSnapshot), &snap)
	common.ApiSuccess(c, gin.H{
		"task":   creativeTaskUserView(task),
		"assets": assets,
		"config": snap,
	})
}

func ListCreativeTasks(c *gin.Context) {
	userId := c.GetInt("id")
	var tasks []*model.CreativeTask
	if err := model.DB.Where("user_id = ?", userId).Order("id desc").Limit(50).Find(&tasks).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	typeTitles := map[string]string{}
	out := make([]gin.H, 0, len(tasks))
	for _, task := range tasks {
		typeTitle := typeTitles[task.TypeId]
		if typeTitle == "" {
			if ct, err := model.GetCreativeTypeByTypeId(task.TypeId); err == nil && ct != nil {
				typeTitle = ct.Title
			}
			if typeTitle == "" {
				typeTitle = "电商套图"
			}
			typeTitles[task.TypeId] = typeTitle
		}
		profile, _ := service.ParseCreativeProfile(task.ProductProfile)
		subject := service.CreativeSubjectFromProfile(profile, task.ExtraText)
		at := task.CompletedAt
		if at <= 0 {
			at = task.UpdatedAt
		}
		successCount := 0
		assets, _ := model.ListCreativeAssets(task.Id)
		for _, asset := range assets {
			if asset.Kind == model.CreativeAssetKindReference {
				continue
			}
			if asset.URL != "" && (asset.Status == model.CreativeAssetReview || asset.Status == model.CreativeAssetApproved) {
				successCount++
			}
		}
		item := creativeTaskUserView(task)
		item["type_title"] = typeTitle
		item["subject"] = subject
		item["title"] = service.BuildCreativeHistoryTitle(typeTitle, subject, at)
		item["success_image_count"] = successCount
		out = append(out, item)
	}
	common.ApiSuccess(c, out)
}

func UploadCreativeTaskReference(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 进入分析中后输入锁定，仅草稿可继续上传
	if task.Status != model.CreativeTaskDraft {
		common.ApiErrorMsg(c, "任务已启动，不可再修改参考图")
		return
	}
	var snap service.CreativeConfigSnapshot
	_ = common.Unmarshal([]byte(task.ConfigSnapshot), &snap)
	assets, _ := model.ListCreativeAssets(taskId)
	refCount := 0
	for _, a := range assets {
		if a.Kind == model.CreativeAssetKindReference {
			refCount++
		}
	}
	maxRef := snap.Package.MaxReferences
	if maxRef <= 0 {
		maxRef = 5
	}
	if refCount >= maxRef {
		common.ApiErrorMsg(c, fmt.Sprintf("参考图最多 %d 张", maxRef))
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "请选择文件")
		return
	}
	f, err := file.Open()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer f.Close()
	asset, err := service.UploadCreativeReference(c.Request.Context(), userId, file.Filename, file.Header.Get("Content-Type"), file.Size, f)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	asset.TaskId = taskId
	asset.SlotIndex = refCount
	if err := model.DB.Create(asset).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, asset)
}

type creativeAnalyzePrepareResponse struct {
	Model        string            `json:"model"`
	Fallback     string            `json:"fallback_model"`
	SystemPrompt string            `json:"system_prompt"`
	UserPrompt   string            `json:"user_prompt"`
	References   []string          `json:"references"`
	Vars         map[string]string `json:"vars"`
}

type prepareCreativeAnalyzeRequest struct {
	Platform    string `json:"platform"`
	Style       string `json:"style"`
	StyleCustom string `json:"style_custom"`
	ExtraText   string `json:"extra_text"`
	ImageKind   string `json:"image_kind"`
	ImageCount  int    `json:"image_count"`
}

func PrepareCreativeAnalyze(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if task.Status != model.CreativeTaskDraft {
		common.ApiErrorMsg(c, "任务已启动，不可重复分析")
		return
	}
	var req prepareCreativeAnalyzeRequest
	_ = common.DecodeJson(c.Request.Body, &req)
	if strings.TrimSpace(req.Platform) != "" {
		task.Platform = strings.TrimSpace(req.Platform)
	}
	if strings.TrimSpace(req.Style) != "" {
		task.Style = strings.TrimSpace(req.Style)
	}
	if req.StyleCustom != "" || req.Style == "其他风格要求" {
		task.StyleCustom = strings.TrimSpace(req.StyleCustom)
	}
	if req.ExtraText != "" {
		task.ExtraText = req.ExtraText
	}
	if req.ImageKind != "" || req.ImageCount > 0 {
		task.ImageKind = normalizeCreativeImageKind(req.ImageKind)
		task.ImageCount = normalizeCreativeImageCount(req.ImageCount)
	}
	if task.ImageCount <= 0 {
		task.ImageCount = 2
	}
	if task.ImageKind == "" {
		task.ImageKind = model.CreativeAssetKindDetail
	}
	var snap service.CreativeConfigSnapshot
	_ = common.Unmarshal([]byte(task.ConfigSnapshot), &snap)
	if _, err := snap.Package.PlatformByKey(task.Platform); err != nil {
		common.ApiErrorMsg(c, "请选择平台")
		return
	}
	modelName := service.CreativeBindingModel(&snap, model.CreativeStageAnalyzeVL)
	if modelName == "" {
		common.ApiErrorMsg(c, "管理员尚未绑定分析模型")
		return
	}
	binding := snap.Bindings[model.CreativeStageAnalyzeVL]
	skillBody := defaultAnalyzeSkill()
	if id := snap.SkillIds[model.CreativeStageAnalyzeVL]; id > 0 {
		if body, err := service.LoadCreativeSkillBody(id); err == nil && body != "" {
			skillBody = body
		}
	}
	assets, _ := model.ListCreativeAssets(taskId)
	refs := make([]string, 0)
	for _, a := range assets {
		if a.Kind == model.CreativeAssetKindReference && a.URL != "" {
			refs = append(refs, a.URL)
		}
	}
	if len(refs) == 0 {
		common.ApiErrorMsg(c, "请至少上传 1 张参考图")
		return
	}
	style := task.Style
	if task.Style == "其他风格要求" {
		style = task.StyleCustom
	}
	vars := map[string]string{
		"platform": task.Platform,
		"style":    style,
		"specs":    task.ExtraText,
	}
	prompt := model.RenderCreativeSkill(skillBody, vars)
	task.Status = model.CreativeTaskAnalyzing
	task.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(task).Error
	common.ApiSuccess(c, creativeAnalyzePrepareResponse{
		Model:        modelName,
		Fallback:     binding.FallbackModel,
		SystemPrompt: "你是电商商品分析助手，只输出合法 JSON。",
		UserPrompt:   prompt,
		References:   refs,
		Vars:         vars,
	})
}

func defaultAnalyzeSkill() string {
	return `根据参考图与补充文本，输出 JSON：
{"category_l1":"","category_l2":"","selling_points":["至少3条"],"appearance":"主体外观一句","complete":true/false,"missing":["缺项"]}
平台={{platform}} 风格={{style}} 补充={{specs}}`
}

type creativeAnalyzeResultRequest struct {
	RawResponse string                        `json:"raw_response"`
	Profile     *model.CreativeProductProfile `json:"profile"`
}

func SubmitCreativeAnalyzeResult(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req creativeAnalyzeResultRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	var profile *model.CreativeProductProfile
	if req.Profile != nil {
		profile = req.Profile
	} else {
		profile, err = service.ParseCreativeProfile(req.RawResponse)
		if err != nil {
			common.ApiErrorMsg(c, "无法解析商品档案，请继续补充对话")
			return
		}
	}
	// 启动后不可改参：缺项用占位补齐，直接进入待确认
	service.EnsureCreativeProfileUsable(profile, task.ExtraText)
	b, _ := common.Marshal(profile)
	task.ProductProfile = string(b)
	task.Status = model.CreativeTaskAwaitingConfirm
	task.UpdatedAt = model.CreativeNow()
	if err := model.DB.Save(task).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"task": creativeTaskUserView(task), "profile": profile})
}

type creativeUpdateProfileRequest struct {
	Profile model.CreativeProductProfile `json:"profile"`
}

func UpdateCreativeProfile(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// 进入分析中后规划不可再改
	if task.Status != model.CreativeTaskDraft {
		common.ApiErrorMsg(c, "任务已启动，不可再修改规划")
		return
	}
	var req creativeUpdateProfileRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	service.EnsureCreativeProfileUsable(&req.Profile, task.ExtraText)
	b, _ := common.Marshal(req.Profile)
	task.ProductProfile = string(b)
	task.Status = model.CreativeTaskAwaitingConfirm
	task.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(task).Error
	common.ApiSuccess(c, gin.H{"task": creativeTaskUserView(task), "profile": req.Profile})
}

type confirmCreativeTaskRequest struct {
	ImageKind  string `json:"image_kind"`
	ImageCount int    `json:"image_count"`
}

func ConfirmCreativeTask(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if task.Status != model.CreativeTaskAwaitingConfirm && task.Status != model.CreativeTaskAnalyzing {
		common.ApiErrorMsg(c, "当前状态不可确认生成")
		return
	}
	var req confirmCreativeTaskRequest
	_ = common.DecodeJson(c.Request.Body, &req)
	if req.ImageKind != "" || req.ImageCount > 0 {
		task.ImageKind = normalizeCreativeImageKind(req.ImageKind)
		task.ImageCount = normalizeCreativeImageCount(req.ImageCount)
	}
	if task.ImageCount <= 0 {
		task.ImageCount = 2
	}
	if task.ImageKind == "" {
		task.ImageKind = model.CreativeAssetKindDetail
	}
	profile, err := service.ParseCreativeProfile(task.ProductProfile)
	if err != nil {
		common.ApiErrorMsg(c, "请先补全商品档案必齐字段")
		return
	}
	service.EnsureCreativeProfileUsable(profile, task.ExtraText)
	if !profile.Complete {
		common.ApiErrorMsg(c, "请先补全商品档案必齐字段")
		return
	}
	b, _ := common.Marshal(profile)
	task.ProductProfile = string(b)
	var snap service.CreativeConfigSnapshot
	_ = common.Unmarshal([]byte(task.ConfigSnapshot), &snap)
	plat, err := snap.Package.PlatformByKey(task.Platform)
	if err != nil {
		common.ApiErrorMsg(c, "平台配置无效")
		return
	}
	plat = plat.ApplyUserImageCount(task.ImageKind, task.ImageCount)
	// 生图模型可由用户在前端选择；管理端绑定仅作默认回退，不再强制拦截确认
	est := service.EstimateCreativeQuota(snap.Package, plat)
	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if int64(user.Quota) < est {
		// 用户侧不透出 Token 数字
		c.JSON(http.StatusPaymentRequired, gin.H{
			"success": false,
			"message": "额度不足，请充值",
		})
		return
	}
	// 清理旧生成槽，保留参考图
	_ = model.DB.Where("task_id = ? AND kind <> ?", taskId, model.CreativeAssetKindReference).Delete(&model.CreativeAsset{}).Error
	if err := model.CreateCreativeAssetSlots(task, plat); err != nil {
		common.ApiError(c, err)
		return
	}
	task.EstimatedQuota = est
	task.Status = model.CreativeTaskGenerating
	task.UpdatedAt = model.CreativeNow()
	if err := model.DB.Save(task).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	assets, _ := model.ListCreativeAssets(taskId)
	common.ApiSuccess(c, gin.H{"task": creativeTaskUserView(task), "assets": assets})
}

type creativePrepareAssetRequest struct {
	AssetId int `json:"asset_id"`
}

func PrepareCreativeAssetGeneration(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if task.Status != model.CreativeTaskGenerating && task.Status != model.CreativeTaskReviewing {
		common.ApiErrorMsg(c, "当前状态不可生成")
		return
	}
	var req creativePrepareAssetRequest
	_ = common.DecodeJson(c.Request.Body, &req)
	var asset model.CreativeAsset
	q := model.DB.Where("task_id = ? AND user_id = ?", taskId, userId)
	if req.AssetId > 0 {
		q = q.Where("id = ?", req.AssetId)
	} else {
		// generating：客户端中断/刷新后可能残留，需重新领取，否则循环会误判 done
		q = q.Where("kind <> ? AND status IN ?", model.CreativeAssetKindReference,
			[]string{
				model.CreativeAssetPending,
				model.CreativeAssetGenerating,
				model.CreativeAssetRetrying,
				model.CreativeAssetRefining,
			})
	}
	if err := q.Order("id asc").First(&asset).Error; err != nil {
		common.ApiSuccess(c, gin.H{"done": true})
		return
	}
	var snap service.CreativeConfigSnapshot
	_ = common.Unmarshal([]byte(task.ConfigSnapshot), &snap)
	imgModel := service.CreativeBindingModel(&snap, model.CreativeStageImageGen)
	copyBody := "根据参考图生成电商套图图片：平台={{platform}} 风格={{style}} 类型={{kind}} 尺寸={{width}}x{{height}} 卖点={{selling_points}} 外观={{appearance}} {{refine}}。直接生成图片，不要只输出文字。"
	if id := snap.SkillIds[model.CreativeStageCopyLLM]; id > 0 {
		if body, err := service.LoadCreativeSkillBody(id); err == nil && body != "" {
			copyBody = body
		}
	}
	profile, _ := service.ParseCreativeProfile(task.ProductProfile)
	style := task.Style
	if task.Style == "其他风格要求" {
		style = task.StyleCustom
	}
	vars := map[string]string{
		"platform":       task.Platform,
		"style":          style,
		"kind":           asset.Kind,
		"slot_index":     strconv.Itoa(asset.SlotIndex + 1),
		"width":          strconv.Itoa(asset.Width),
		"height":         strconv.Itoa(asset.Height),
		"selling_points": strings.Join(profile.SellingPoints, "；"),
		"appearance":     profile.Appearance,
		"refine":         asset.RefineNote,
		"prompt":         asset.Prompt,
		"specs":          task.ExtraText,
	}
	prompt := model.RenderCreativeSkill(copyBody, vars)
	if strings.TrimSpace(asset.Prompt) != "" && asset.Status == model.CreativeAssetRefining {
		prompt = asset.Prompt + "\n修改意见：" + asset.RefineNote
	}
	asset.Status = model.CreativeAssetGenerating
	asset.Prompt = prompt
	asset.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(&asset).Error

	refs := []string{}
	all, _ := model.ListCreativeAssets(taskId)
	for _, a := range all {
		if a.Kind == model.CreativeAssetKindReference {
			refs = append(refs, a.URL)
		}
	}
	common.ApiSuccess(c, gin.H{
		"done":        false,
		"asset":       asset,
		"model":       imgModel,
		"prompt":      prompt,
		"width":       asset.Width,
		"height":      asset.Height,
		"references":  refs,
		"max_retries": snap.Package.MaxAutoRetries,
	})
}

type creativeCompleteAssetRequest struct {
	AssetId int      `json:"asset_id"`
	URL     string   `json:"url"`
	URLs    []string `json:"urls"`
	Error   string   `json:"error"`
}

func CompleteCreativeAssetGeneration(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req creativeCompleteAssetRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || req.AssetId <= 0 {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	var asset model.CreativeAsset
	if err := model.DB.Where("id = ? AND task_id = ? AND user_id = ?", req.AssetId, taskId, userId).First(&asset).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var snap service.CreativeConfigSnapshot
	_ = common.Unmarshal([]byte(task.ConfigSnapshot), &snap)
	maxRetry := snap.Package.MaxAutoRetries
	if maxRetry < 0 {
		maxRetry = 2
	}

	if strings.TrimSpace(req.Error) != "" || (strings.TrimSpace(req.URL) == "" && len(req.URLs) == 0) {
		asset.RetryCount++
		if asset.RetryCount <= maxRetry {
			asset.Status = model.CreativeAssetRetrying
			asset.ErrorMessage = req.Error
			asset.QAMessage = "generation failed, retrying"
		} else {
			asset.Status = model.CreativeAssetFailed
			asset.ErrorMessage = req.Error
			if asset.ErrorMessage == "" {
				asset.ErrorMessage = "generation failed"
			}
		}
		asset.UpdatedAt = model.CreativeNow()
		_ = model.DB.Save(&asset).Error
		maybeFinishCreativeTask(task)
		common.ApiSuccess(c, asset)
		return
	}

	url := strings.TrimSpace(req.URL)
	if url == "" && len(req.URLs) > 0 {
		url = strings.TrimSpace(req.URLs[0])
	}
	asset.URL = url
	asset.Status = model.CreativeAssetQA
	asset.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(&asset).Error

	ok, qaMsg := service.CreativeQARulePass(url)
	// 可选：若绑定了 QA 模型，前端可二次提交；此处规则质检
	if !ok {
		asset.QAPassed = false
		asset.QAMessage = qaMsg
		asset.RetryCount++
		if asset.RetryCount <= maxRetry {
			asset.Status = model.CreativeAssetRetrying
			asset.URL = ""
		} else {
			asset.Status = model.CreativeAssetFailed
			asset.ErrorMessage = qaMsg
		}
	} else {
		asset.QAPassed = true
		asset.QAMessage = ""
		asset.Status = model.CreativeAssetReview
		asset.ErrorMessage = ""
	}
	asset.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(&asset).Error
	maybeFinishCreativeTask(task)
	common.ApiSuccess(c, asset)
}

func maybeFinishCreativeTask(task *model.CreativeTask) {
	assets, err := model.ListCreativeAssets(task.Id)
	if err != nil {
		return
	}
	pending := 0
	failed := 0
	review := 0
	for _, a := range assets {
		if a.Kind == model.CreativeAssetKindReference {
			continue
		}
		switch a.Status {
		case model.CreativeAssetPending, model.CreativeAssetGenerating, model.CreativeAssetQA, model.CreativeAssetRetrying, model.CreativeAssetRefining:
			pending++
		case model.CreativeAssetFailed:
			failed++
		case model.CreativeAssetReview, model.CreativeAssetApproved:
			review++
		}
	}
	if pending > 0 {
		return
	}
	if review > 0 {
		task.Status = model.CreativeTaskReviewing
		if task.CompletedAt <= 0 {
			task.CompletedAt = model.CreativeNow()
		}
	} else if failed > 0 {
		task.Status = model.CreativeTaskFailed
		if task.CompletedAt <= 0 {
			task.CompletedAt = model.CreativeNow()
		}
	}
	task.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(task).Error
}

type creativeRefineRequest struct {
	Note string `json:"note"`
}

func RefineCreativeAsset(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	assetId, _ := strconv.Atoi(c.Param("assetId"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var req creativeRefineRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil || strings.TrimSpace(req.Note) == "" {
		common.ApiErrorMsg(c, "请填写修改意见")
		return
	}
	var asset model.CreativeAsset
	if err := model.DB.Where("id = ? AND task_id = ? AND user_id = ?", assetId, taskId, userId).First(&asset).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	asset.RefineNote = strings.TrimSpace(req.Note)
	asset.Status = model.CreativeAssetRefining
	asset.URL = ""
	asset.QAPassed = false
	asset.RetryCount = 0
	asset.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(&asset).Error
	task.Status = model.CreativeTaskGenerating
	task.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(task).Error
	common.ApiSuccess(c, asset)
}

func ApproveCreativeAsset(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	assetId, _ := strconv.Atoi(c.Param("assetId"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var asset model.CreativeAsset
	if err := model.DB.Where("id = ? AND task_id = ? AND user_id = ?", assetId, taskId, userId).First(&asset).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	asset.Status = model.CreativeAssetApproved
	asset.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(&asset).Error
	checkCreativeAllApproved(task)
	common.ApiSuccess(c, asset)
}

func ApproveAllCreativeAssets(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	task, err := model.GetCreativeTaskForUser(taskId, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	_ = model.DB.Model(&model.CreativeAsset{}).
		Where("task_id = ? AND user_id = ? AND kind <> ? AND status = ?", taskId, userId, model.CreativeAssetKindReference, model.CreativeAssetReview).
		Updates(map[string]any{"status": model.CreativeAssetApproved, "updated_at": model.CreativeNow()}).Error
	checkCreativeAllApproved(task)
	assets, _ := model.ListCreativeAssets(taskId)
	common.ApiSuccess(c, gin.H{"task": task, "assets": assets})
}

func checkCreativeAllApproved(task *model.CreativeTask) {
	assets, err := model.ListCreativeAssets(task.Id)
	if err != nil {
		return
	}
	for _, a := range assets {
		if a.Kind == model.CreativeAssetKindReference {
			continue
		}
		if a.Status != model.CreativeAssetApproved {
			return
		}
	}
	task.Status = model.CreativeTaskDone
	task.UpdatedAt = model.CreativeNow()
	_ = model.DB.Save(task).Error
}

func DownloadCreativeZip(c *gin.Context) {
	taskId, _ := strconv.Atoi(c.Param("id"))
	userId := c.GetInt("id")
	if _, err := model.GetCreativeTaskForUser(taskId, userId); err != nil {
		common.ApiError(c, err)
		return
	}
	data, filename, err := service.BuildCreativeZip(taskId, userId)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, "application/zip", data)
}

// ——— 管理端 API ———

func AdminListCreativeTypes(c *gin.Context) {
	items, err := model.ListCreativeTypes(false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

type adminCreativeTypeRequest struct {
	Title       string                     `json:"title"`
	Enabled     *bool                      `json:"enabled"`
	SortOrder   *int                       `json:"sort_order"`
	Description string                     `json:"description"`
	Icon        string                     `json:"icon"`
	Package     *model.CreativeTypePackage `json:"package"`
}

func AdminUpdateCreativeType(c *gin.Context) {
	typeId := c.Param("typeId")
	item, err := model.GetCreativeTypeByTypeId(typeId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	before := *item
	var req adminCreativeTypeRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	if req.Title != "" {
		item.Title = req.Title
	}
	if req.Enabled != nil {
		item.Enabled = *req.Enabled
	}
	if req.SortOrder != nil {
		item.SortOrder = *req.SortOrder
	}
	if req.Description != "" || c.Request.ContentLength > 0 {
		item.Description = req.Description
	}
	if req.Icon != "" || req.Icon == "" {
		item.Icon = req.Icon
	}
	if req.Package != nil {
		b, err := common.Marshal(req.Package)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		item.PackageJSON = string(b)
	}
	item.UpdatedAt = model.CreativeNow()
	if err := model.DB.Save(item).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	actorId, actorName := creativeActor(c)
	_ = model.WriteCreativeAudit(actorId, actorName, "creative_type", typeId, "update", before, item)
	common.ApiSuccess(c, item)
}

func AdminListCreativeBindings(c *gin.Context) {
	typeId := c.Param("typeId")
	items, err := model.GetCreativeBindings(typeId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminUpsertCreativeBinding(c *gin.Context) {
	typeId := c.Param("typeId")
	var binding model.CreativeModelBinding
	if err := common.DecodeJson(c.Request.Body, &binding); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	binding.TypeId = typeId
	beforeList, _ := model.GetCreativeBindings(typeId)
	var before any
	for _, b := range beforeList {
		if b.Stage == binding.Stage {
			before = b
			break
		}
	}
	if err := model.UpsertCreativeBinding(&binding); err != nil {
		common.ApiError(c, err)
		return
	}
	actorId, actorName := creativeActor(c)
	_ = model.WriteCreativeAudit(actorId, actorName, "creative_binding", typeId+":"+binding.Stage, "upsert", before, binding)
	common.ApiSuccess(c, binding)
}

func AdminListCreativeSkills(c *gin.Context) {
	typeId := c.Query("type_id")
	q := model.DB.Model(&model.CreativeSkill{}).Order("skill_id asc, version desc")
	if typeId != "" {
		q = q.Where("type_id = ?", typeId)
	}
	var items []*model.CreativeSkill
	if err := q.Find(&items).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminCreateCreativeSkill(c *gin.Context) {
	var skill model.CreativeSkill
	if err := common.DecodeJson(c.Request.Body, &skill); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	skill.SkillId = strings.TrimSpace(skill.SkillId)
	if skill.SkillId == "" || skill.TypeId == "" || skill.Stage == "" {
		common.ApiErrorMsg(c, "skill_id / type_id / stage 必填")
		return
	}
	var maxVer int
	_ = model.DB.Model(&model.CreativeSkill{}).
		Where("skill_id = ?", skill.SkillId).
		Select("COALESCE(MAX(version),0)").Scan(&maxVer).Error
	skill.Version = maxVer + 1
	skill.CreatedAt = model.CreativeNow()
	skill.UpdatedAt = skill.CreatedAt
	if err := model.DB.Create(&skill).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	actorId, actorName := creativeActor(c)
	_ = model.WriteCreativeAudit(actorId, actorName, "creative_skill", skill.SkillId, "create", nil, skill)
	common.ApiSuccess(c, skill)
}

func AdminUpdateCreativeSkill(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var skill model.CreativeSkill
	if err := model.DB.First(&skill, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	before := skill
	var req model.CreativeSkill
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	skill.Name = req.Name
	skill.Body = req.Body
	skill.Platform = req.Platform
	skill.Stage = req.Stage
	skill.Enabled = req.Enabled
	skill.UpdatedAt = model.CreativeNow()
	if err := model.DB.Save(&skill).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	actorId, actorName := creativeActor(c)
	_ = model.WriteCreativeAudit(actorId, actorName, "creative_skill", strconv.Itoa(id), "update", before, skill)
	common.ApiSuccess(c, skill)
}

func AdminCopyCreativeSkillVersion(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var skill model.CreativeSkill
	if err := model.DB.First(&skill, id).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	var maxVer int
	_ = model.DB.Model(&model.CreativeSkill{}).
		Where("skill_id = ?", skill.SkillId).
		Select("COALESCE(MAX(version),0)").Scan(&maxVer).Error
	next := skill
	next.Id = 0
	next.Version = maxVer + 1
	next.Enabled = false
	next.CreatedAt = model.CreativeNow()
	next.UpdatedAt = next.CreatedAt
	if err := model.DB.Create(&next).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	actorId, actorName := creativeActor(c)
	_ = model.WriteCreativeAudit(actorId, actorName, "creative_skill", next.SkillId, "copy_version", skill, next)
	common.ApiSuccess(c, next)
}

type adminCreativeGlobalRequest struct {
	Enabled            *bool  `json:"enabled"`
	DefaultConcurrency *int   `json:"default_concurrency"`
	SensitiveWordsJSON string `json:"sensitive_words_json"`
}

func AdminGetCreativeGlobal(c *gin.Context) {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	common.ApiSuccess(c, gin.H{
		"enabled":              common.OptionMap[model.OptionCreativeEnabled] != "false",
		"default_concurrency":  common.OptionMap[model.OptionCreativeDefaultConcurrency],
		"sensitive_words_json": common.OptionMap[model.OptionCreativeSensitiveWords],
		"menu_visible":         creativeUserVisible(),
	})
}

func AdminUpdateCreativeGlobal(c *gin.Context) {
	var req adminCreativeGlobalRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的参数")
		return
	}
	before, _ := c.Get("unused")
	_ = before
	actorId, actorName := creativeActor(c)
	old := gin.H{}
	common.OptionMapRWMutex.RLock()
	old["enabled"] = common.OptionMap[model.OptionCreativeEnabled]
	old["default_concurrency"] = common.OptionMap[model.OptionCreativeDefaultConcurrency]
	old["sensitive_words_json"] = common.OptionMap[model.OptionCreativeSensitiveWords]
	common.OptionMapRWMutex.RUnlock()

	if req.Enabled != nil {
		val := "false"
		if *req.Enabled {
			val = "true"
		}
		_ = model.UpdateOption(model.OptionCreativeEnabled, val)
	}
	if req.DefaultConcurrency != nil && *req.DefaultConcurrency > 0 {
		_ = model.UpdateOption(model.OptionCreativeDefaultConcurrency, strconv.Itoa(*req.DefaultConcurrency))
	}
	if req.SensitiveWordsJSON != "" {
		_ = model.UpdateOption(model.OptionCreativeSensitiveWords, req.SensitiveWordsJSON)
	}
	_ = model.WriteCreativeAudit(actorId, actorName, "creative_global", "global", "update", old, req)
	AdminGetCreativeGlobal(c)
}

func AdminListCreativeAudits(c *gin.Context) {
	var items []*model.CreativeAuditLog
	if err := model.DB.Order("id desc").Limit(200).Find(&items).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}
