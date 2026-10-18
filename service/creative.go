package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/google/uuid"
)

const (
	maxCreativeReferenceBytes = 10 << 20
	creativeReferenceTTL      = 7 * 24 * time.Hour
	creativeOutputTTL         = 90 * 24 * time.Hour
)

// CreativeConfigSnapshot 任务启动时冻结的配置
type CreativeConfigSnapshot struct {
	Package  model.CreativeTypePackage             `json:"package"`
	Bindings map[string]model.CreativeModelBinding `json:"bindings"`
	SkillIds map[string]int                        `json:"skill_ids"` // stage -> skill row id
}

func BuildCreativeConfigSnapshot(typeId string) (*CreativeConfigSnapshot, error) {
	ct, err := model.GetCreativeTypeByTypeId(typeId)
	if err != nil {
		return nil, err
	}
	pkg, err := model.ParseCreativePackage(ct.PackageJSON)
	if err != nil {
		return nil, err
	}
	bindings, err := model.GetCreativeBindings(typeId)
	if err != nil {
		return nil, err
	}
	snap := &CreativeConfigSnapshot{
		Package:  pkg,
		Bindings: map[string]model.CreativeModelBinding{},
		SkillIds: map[string]int{},
	}
	for _, b := range bindings {
		if b != nil {
			snap.Bindings[b.Stage] = *b
		}
	}
	for _, stage := range []string{
		model.CreativeStageAnalyzeVL,
		model.CreativeStageCopyLLM,
		model.CreativeStageImageGen,
		model.CreativeStageImageQA,
	} {
		skill, err := model.GetEnabledCreativeSkill(typeId, stage, "")
		if err == nil && skill != nil {
			snap.SkillIds[stage] = skill.Id
		}
	}
	return snap, nil
}

func EstimateCreativeQuota(pkg model.CreativeTypePackage, platform model.CreativePlatformPackage) int64 {
	images := int64(platform.TotalImages())
	perImage := pkg.QuotaPerImageEst
	if perImage <= 0 {
		perImage = 50000
	}
	analyze := pkg.QuotaAnalyzeEst
	if analyze <= 0 {
		analyze = 20000
	}
	factor := pkg.EstimateFactor
	if factor <= 0 {
		factor = 1.2
	}
	// 预估含自动重试上限：按每张最多 (1+maxRetries) 次生图计
	retries := int64(pkg.MaxAutoRetries)
	if retries < 0 {
		retries = 0
	}
	return int64(float64(analyze+images*perImage*(1+retries)) * factor)
}

func UploadCreativeReference(ctx context.Context, userId int, fileName, contentType string, size int64, body io.Reader) (*model.CreativeAsset, error) {
	if userId <= 0 || body == nil {
		return nil, fmt.Errorf("invalid upload")
	}
	store := GetObjectBlobStore()
	if !store.Enabled() {
		return nil, ErrModelUsageObjectStoreRequired
	}
	fileName = strings.TrimSpace(fileName)
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(fileName), "."))
	switch ext {
	case "jpg", "jpeg", "png", "webp":
	default:
		return nil, fmt.Errorf("unsupported image type")
	}
	if size < 0 || size > maxCreativeReferenceBytes {
		return nil, fmt.Errorf("image too large")
	}
	if contentType == "" {
		contentType = "image/" + ext
		if ext == "jpg" {
			contentType = "image/jpeg"
		}
	}
	data, err := io.ReadAll(io.LimitReader(body, maxCreativeReferenceBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maxCreativeReferenceBytes {
		return nil, fmt.Errorf("image too large")
	}
	id := strings.ReplaceAll(uuid.NewString(), "-", "")
	relative := fmt.Sprintf("creative/references/%d/%s.%s", userId, id, ext)
	fullKey := store.Prefix() + relative
	if _, err := store.PutObject(ctx, fullKey, contentType, bytes.NewReader(data), int64(len(data))); err != nil {
		return nil, err
	}
	expiresAt := time.Now().Add(creativeReferenceTTL).Unix()
	url := BuildModelUsageMediaURL(userId, relative, expiresAt)
	now := model.CreativeNow()
	asset := &model.CreativeAsset{
		UserId:    userId,
		Kind:      model.CreativeAssetKindReference,
		Status:    model.CreativeAssetApproved,
		URL:       url,
		ObjectKey: relative,
		CreatedAt: now,
		UpdatedAt: now,
	}
	return asset, nil
}

func ParseCreativeProfile(raw string) (*model.CreativeProductProfile, error) {
	profile := &model.CreativeProductProfile{}
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return profile, nil
	}
	// 允许模型返回夹杂 markdown
	if i := strings.Index(raw, "{"); i >= 0 {
		if j := strings.LastIndex(raw, "}"); j > i {
			raw = raw[i : j+1]
		}
	}
	if err := common.Unmarshal([]byte(raw), profile); err != nil {
		return nil, err
	}
	ok, missing := model.CreativeProfileComplete(profile)
	profile.Complete = ok
	profile.Missing = missing
	return profile, nil
}

// EnsureCreativeProfileUsable 启动后不可改参，缺项用占位补齐以便继续生图
func EnsureCreativeProfileUsable(profile *model.CreativeProductProfile, fallback string) {
	if profile == nil {
		return
	}
	fallback = strings.TrimSpace(fallback)
	if strings.TrimSpace(profile.CategoryL1) == "" {
		profile.CategoryL1 = "未分类"
	}
	if strings.TrimSpace(profile.CategoryL2) == "" {
		profile.CategoryL2 = "未分类"
	}
	if strings.TrimSpace(profile.Appearance) == "" {
		if fallback != "" {
			profile.Appearance = fallback
		} else {
			profile.Appearance = "未命名商品"
		}
	}
	for len(profile.SellingPoints) < 3 {
		profile.SellingPoints = append(profile.SellingPoints, "待补充卖点")
	}
	ok, missing := model.CreativeProfileComplete(profile)
	profile.Complete = ok
	profile.Missing = missing
}

func CreativeSubjectFromProfile(profile *model.CreativeProductProfile, extraText string) string {
	candidates := []string{}
	if profile != nil {
		candidates = append(candidates, profile.Appearance, profile.CategoryL2, profile.CategoryL1)
		candidates = append(candidates, profile.SellingPoints...)
	}
	candidates = append(candidates, extraText)
	for _, item := range candidates {
		name := truncateCreativeRunes(strings.TrimSpace(item), 12)
		if name != "" {
			return name
		}
	}
	return "未命名商品"
}

func BuildCreativeHistoryTitle(typeTitle, subject string, at int64) string {
	typeTitle = strings.TrimSpace(typeTitle)
	if typeTitle == "" {
		typeTitle = "电商套图"
	}
	subject = strings.TrimSpace(subject)
	if subject == "" {
		subject = "未命名商品"
	}
	subject = truncateCreativeRunes(subject, 12)
	if at <= 0 {
		at = time.Now().Unix()
	}
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.FixedZone("CST", 8*3600)
	}
	return typeTitle + "+" + subject + "+" + time.Unix(at, 0).In(loc).Format("2006/01/02 15:04")
}

func truncateCreativeRunes(s string, max int) string {
	runes := []rune(strings.TrimSpace(s))
	if max <= 0 || len(runes) <= max {
		return string(runes)
	}
	return string(runes[:max])
}

func CreativeQARulePass(url string) (bool, string) {
	url = strings.TrimSpace(url)
	if url == "" {
		return false, "empty image url"
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		// 短链可能需鉴权，无法 HEAD 时仅做非空校验
		if strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://") || strings.HasPrefix(url, "/api/") {
			return true, ""
		}
		return false, "unreachable image"
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return false, "bad image status"
	}
	n, _ := io.Copy(io.Discard, io.LimitReader(resp.Body, 512))
	if n < 32 {
		return false, "image too small"
	}
	return true, ""
}

func BuildCreativeZip(taskId, userId int) ([]byte, string, error) {
	assets, err := model.ListCreativeAssets(taskId)
	if err != nil {
		return nil, "", err
	}
	buf := &bytes.Buffer{}
	zw := zip.NewWriter(buf)
	client := &http.Client{Timeout: 60 * time.Second}
	count := 0
	for _, asset := range assets {
		if asset.UserId != userId {
			continue
		}
		if asset.Kind == model.CreativeAssetKindReference {
			continue
		}
		if asset.Status != model.CreativeAssetApproved && asset.Status != model.CreativeAssetReview {
			continue
		}
		if strings.TrimSpace(asset.URL) == "" {
			continue
		}
		folder := model.CreativeAssetFolderName(asset.Kind)
		name := fmt.Sprintf("%s/%02d.png", folder, asset.SlotIndex+1)
		resp, err := client.Get(asset.URL)
		var data []byte
		if err == nil && resp != nil {
			data, _ = io.ReadAll(io.LimitReader(resp.Body, 20<<20))
			resp.Body.Close()
		}
		if len(data) == 0 {
			// 写入占位说明，避免空 zip
			data = []byte("missing image: " + asset.URL)
			name = strings.TrimSuffix(name, ".png") + ".txt"
		}
		w, err := zw.Create(name)
		if err != nil {
			_ = zw.Close()
			return nil, "", err
		}
		if _, err := w.Write(data); err != nil {
			_ = zw.Close()
			return nil, "", err
		}
		count++
	}
	if err := zw.Close(); err != nil {
		return nil, "", err
	}
	if count == 0 {
		return nil, "", fmt.Errorf("no approved images")
	}
	filename := fmt.Sprintf("creative-task-%d.zip", taskId)
	return buf.Bytes(), filename, nil
}

func CreativeBindingModel(snap *CreativeConfigSnapshot, stage string) string {
	if snap == nil {
		return ""
	}
	b, ok := snap.Bindings[stage]
	if !ok {
		return ""
	}
	if strings.TrimSpace(b.PrimaryModel) != "" {
		return strings.TrimSpace(b.PrimaryModel)
	}
	return strings.TrimSpace(b.FallbackModel)
}

func LoadCreativeSkillBody(skillRowId int) (string, error) {
	var skill model.CreativeSkill
	if err := model.DB.First(&skill, skillRowId).Error; err != nil {
		return "", err
	}
	return skill.Body, nil
}

func CreativeQuotaLabel(n int64) string {
	return strconv.FormatInt(n, 10)
}
