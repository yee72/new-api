package common

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

const (
	CaptchaTypeMath = "math"

	CaptchaValidMinutes = 5
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

// CaptchaChallenge 一次性数学计算挑战（答案仅存服务端）。
type CaptchaChallenge struct {
	ID          string
	Type        string
	ImageBase64 string
}

// NewCaptchaChallenge 生成数学计算验证码。
func NewCaptchaChallenge() (*CaptchaChallenge, error) {
	return newMathCaptchaChallenge()
}

// ConsumeCaptcha 校验成功后立即作废；错误答案也会消耗挑战。
func ConsumeCaptcha(id string, code string) bool {
	id = strings.TrimSpace(id)
	code = strings.TrimSpace(code)
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
	return strings.EqualFold(value.code, code)
}

// SeedCaptchaForTest 仅供测试注入已知答案（按精确匹配校验）。
func SeedCaptchaForTest(id string, code string) {
	captchaMutex.Lock()
	captchaMap[id] = captchaValue{
		code: strings.TrimSpace(code),
		time: time.Now(),
	}
	captchaMutex.Unlock()
}

func storeCaptcha(code string) string {
	id := strings.ReplaceAll(uuid.NewString(), "-", "")
	captchaMutex.Lock()
	captchaMap[id] = captchaValue{
		code: code,
		time: time.Now(),
	}
	if len(captchaMap) > captchaMapMaxSize {
		removeExpiredCaptchasLocked()
	}
	captchaMutex.Unlock()
	return id
}

func newMathCaptchaChallenge() (*CaptchaChallenge, error) {
	prompt, answer, err := randomMathPrompt()
	if err != nil {
		return nil, err
	}
	imagePNG, err := renderCaptchaPNG(prompt)
	if err != nil {
		return nil, err
	}
	id := storeCaptcha(strconv.Itoa(answer))
	return &CaptchaChallenge{
		ID:          id,
		Type:        CaptchaTypeMath,
		ImageBase64: pngDataURL(imagePNG),
	}, nil
}

func randomMathPrompt() (prompt string, answer int, err error) {
	opPick, err := rand.Int(rand.Reader, big.NewInt(2))
	if err != nil {
		return "", 0, err
	}
	if opPick.Int64() == 0 {
		a, err := rand.Int(rand.Reader, big.NewInt(9))
		if err != nil {
			return "", 0, err
		}
		b, err := rand.Int(rand.Reader, big.NewInt(9))
		if err != nil {
			return "", 0, err
		}
		left := int(a.Int64()) + 1
		right := int(b.Int64()) + 1
		return fmt.Sprintf("%d + %d = ?", left, right), left + right, nil
	}
	a, err := rand.Int(rand.Reader, big.NewInt(9))
	if err != nil {
		return "", 0, err
	}
	b, err := rand.Int(rand.Reader, big.NewInt(9))
	if err != nil {
		return "", 0, err
	}
	left := int(a.Int64()) + 5
	right := int(b.Int64()) + 1
	if right > left {
		left, right = right, left
	}
	return fmt.Sprintf("%d - %d = ?", left, right), left - right, nil
}

func pngDataURL(pngBytes []byte) string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)
}

func renderCaptchaPNG(text string) ([]byte, error) {
	const width, height = 160, 48
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

	drawer := &font.Drawer{
		Dst:  img,
		Src:  image.NewUniform(color.RGBA{R: 30, G: 41, B: 59, A: 255}),
		Face: basicfont.Face7x13,
	}
	drawer.Dot = fixed.P(16, 30)
	drawer.DrawString(text)

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
