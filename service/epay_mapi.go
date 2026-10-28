package service

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
)

const epayMapiPath = "mapi.php"

// EpayMapiResult 易支付 mapi 程序化建单结果（用于页内扫码）
type EpayMapiResult struct {
	// PayURL 收银页 / 支付跳转地址
	PayURL string
	// QRContent 用于生成二维码的内容；优先官方收款码，否则回退 PayURL
	QRContent      string
	GatewayTradeNo string
}

// RequestEpayMapi 向易支付兼容网关 mapi.php 发起服务端建单
func RequestEpayMapi(client *epay.Client, args *epay.PurchaseArgs) (*EpayMapiResult, error) {
	if client == nil || client.BaseUrl == nil || client.Config == nil {
		return nil, fmt.Errorf("epay client not configured")
	}
	if args == nil || args.NotifyUrl == nil {
		return nil, fmt.Errorf("invalid purchase args")
	}

	requestParams := map[string]string{
		"pid":          client.Config.PartnerID,
		"type":         args.Type,
		"out_trade_no": args.ServiceTradeNo,
		"notify_url":   args.NotifyUrl.String(),
		"name":         args.Name,
		"money":        args.Money,
		"device":       string(args.Device),
		"sign_type":    "MD5",
		"sign":         "",
	}
	if args.ReturnUrl != nil {
		requestParams["return_url"] = args.ReturnUrl.String()
	}
	signed := epay.GenerateParams(requestParams, client.Config.Key)

	mapiURL, err := buildEpayMapiURL(client.BaseUrl)
	if err != nil {
		return nil, err
	}

	form := url.Values{}
	for key, value := range signed {
		form.Set(key, value)
	}

	httpClient := &http.Client{Timeout: 15 * time.Second}
	resp, err := httpClient.PostForm(mapiURL, form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("mapi http status %d", resp.StatusCode)
	}

	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("mapi response is not json: %w", err)
	}

	if !epayMapiSuccess(payload) {
		msg := firstNonEmptyString(
			stringFromAny(payload["msg"]),
			stringFromAny(payload["message"]),
			"mapi purchase failed",
		)
		return nil, fmt.Errorf("%s", msg)
	}

	payURL := firstNonEmptyString(
		stringFromAny(payload["payurl"]),
		stringFromAny(payload["payUrl"]),
		stringFromAny(payload["pay_url"]),
		stringFromAny(payload["url"]),
	)
	qrContent := firstNonEmptyString(
		stringFromAny(payload["qrcode"]),
		stringFromAny(payload["qrCode"]),
		stringFromAny(payload["qr_code"]),
		stringFromAny(payload["code_url"]),
		payURL,
	)
	if payURL == "" && qrContent == "" {
		return nil, fmt.Errorf("mapi response missing pay url")
	}
	if payURL == "" {
		payURL = qrContent
	}
	if qrContent == "" {
		qrContent = payURL
	}

	return &EpayMapiResult{
		PayURL:         payURL,
		QRContent:      qrContent,
		GatewayTradeNo: stringFromAny(payload["trade_no"]),
	}, nil
}

func buildEpayMapiURL(base *url.URL) (string, error) {
	u, err := url.Parse(base.String())
	if err != nil {
		return "", err
	}
	// 若配置已指向 submit.php，替换为同级 mapi.php
	trimmedPath := strings.TrimSuffix(u.Path, "/")
	if strings.HasSuffix(strings.ToLower(trimmedPath), "submit.php") {
		dir := path.Dir(trimmedPath)
		if dir == "." {
			dir = "/"
		}
		u.Path = path.Join(dir, epayMapiPath)
	} else {
		u.Path = path.Join(trimmedPath, epayMapiPath)
	}
	u.RawQuery = ""
	u.Fragment = ""
	return u.String(), nil
}

func epayMapiSuccess(payload map[string]any) bool {
	code := payload["code"]
	switch v := code.(type) {
	case float64:
		return v == 1
	case int:
		return v == 1
	case string:
		return v == "1" || strings.EqualFold(v, "success")
	case nil:
		// 部分网关成功时不返回 code，有支付地址即视为成功
		return firstNonEmptyString(
			stringFromAny(payload["payurl"]),
			stringFromAny(payload["payUrl"]),
			stringFromAny(payload["qrcode"]),
			stringFromAny(payload["url"]),
		) != ""
	default:
		return false
	}
}

func stringFromAny(value any) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		if v == float64(int64(v)) {
			return fmt.Sprintf("%.0f", v)
		}
		return strings.TrimSpace(fmt.Sprint(v))
	case nil:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
