package common

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

const (
	CaptchaLength       = 4
	CaptchaValidMinutes = 5
	captchaCharset      = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	captchaMapMaxSize   = 1024
)

type captchaValue struct {
	code string
	time time.Time
}

var (
	captchaMutex sync.Mutex
	captchaMap   = make(map[string]captchaValue)
)

type CaptchaChallenge struct {
	ID          string
	ImageBase64 string
}

// NewCaptchaChallenge 生成一次性图形验证码（答案不返回给客户端）。
func NewCaptchaChallenge() (*CaptchaChallenge, error) {
	code, err := randomCaptchaCode(CaptchaLength)
	if err != nil {
		return nil, err
	}
	imagePNG, err := renderCaptchaPNG(code)
	if err != nil {
		return nil, err
	}
	id := strings.ReplaceAll(uuid.NewString(), "-", "")
	captchaMutex.Lock()
	captchaMap[id] = captchaValue{code: strings.ToUpper(code), time: time.Now()}
	if len(captchaMap) > captchaMapMaxSize {
		removeExpiredCaptchasLocked()
	}
	captchaMutex.Unlock()
	return &CaptchaChallenge{
		ID:          id,
		ImageBase64: "data:image/png;base64," + base64.StdEncoding.EncodeToString(imagePNG),
	}, nil
}

// ConsumeCaptcha 校验成功后立即作废。
func ConsumeCaptcha(id string, code string) bool {
	id = strings.TrimSpace(id)
	code = strings.ToUpper(strings.TrimSpace(code))
	if id == "" || code == "" {
		return false
	}
	captchaMutex.Lock()
	defer captchaMutex.Unlock()
	value, ok := captchaMap[id]
	if !ok {
		return false
	}
	delete(captchaMap, id)
	if int(time.Since(value.time).Seconds()) >= CaptchaValidMinutes*60 {
		return false
	}
	return value.code == code
}

// SeedCaptchaForTest 仅供测试注入已知图形验证码。
func SeedCaptchaForTest(id string, code string) {
	captchaMutex.Lock()
	captchaMap[id] = captchaValue{code: strings.ToUpper(code), time: time.Now()}
	captchaMutex.Unlock()
}

func randomCaptchaCode(length int) (string, error) {
	var builder strings.Builder
	builder.Grow(length)
	max := big.NewInt(int64(len(captchaCharset)))
	for range length {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		builder.WriteByte(captchaCharset[n.Int64()])
	}
	return builder.String(), nil
}

func renderCaptchaPNG(code string) ([]byte, error) {
	const width, height = 140, 48
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: color.RGBA{R: 248, G: 250, B: 252, A: 255}}, image.Point{}, draw.Src)

	for range 40 {
		x, _ := rand.Int(rand.Reader, big.NewInt(width))
		y, _ := rand.Int(rand.Reader, big.NewInt(height))
		img.Set(int(x.Int64()), int(y.Int64()), color.RGBA{R: 180, G: 190, B: 200, A: 255})
	}
	for range 4 {
		x1, _ := rand.Int(rand.Reader, big.NewInt(width))
		y1, _ := rand.Int(rand.Reader, big.NewInt(height))
		x2, _ := rand.Int(rand.Reader, big.NewInt(width))
		y2, _ := rand.Int(rand.Reader, big.NewInt(height))
		drawCaptchaLine(img, int(x1.Int64()), int(y1.Int64()), int(x2.Int64()), int(y2.Int64()), color.RGBA{R: 160, G: 170, B: 185, A: 255})
	}

	face := basicfont.Face7x13
	drawer := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.RGBA{R: 30, G: 41, B: 59, A: 255}),
		Face: face,
	}
	startX := 18
	for i, r := range code {
		drawer.Dot = fixed.P(startX+i*28, 30)
		drawer.DrawString(string(r))
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func drawCaptchaLine(img *image.RGBA, x0, y0, x1, y1 int, c color.RGBA) {
	dx := absInt(x1 - x0)
	dy := absInt(y1 - y0)
	sx := -1
	if x0 < x1 {
		sx = 1
	}
	sy := -1
	if y0 < y1 {
		sy = 1
	}
	err := dx - dy
	for {
		img.Set(x0, y0, c)
		if x0 == x1 && y0 == y1 {
			return
		}
		e2 := 2 * err
		if e2 > -dy {
			err -= dy
			x0 += sx
		}
		if e2 < dx {
			err += dx
			y0 += sy
		}
	}
}

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

func removeExpiredCaptchasLocked() {
	now := time.Now()
	for id, value := range captchaMap {
		if int(now.Sub(value.time).Seconds()) >= CaptchaValidMinutes*60 {
			delete(captchaMap, id)
		}
	}
}
