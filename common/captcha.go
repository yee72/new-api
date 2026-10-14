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
	CaptchaTypeMath  = "math"
	CaptchaTypeSlide = "slide"

	CaptchaValidMinutes = 5
	captchaMapMaxSize   = 1024

	slideTrackWidth  = 280
	slideTrackHeight = 140
	slidePieceSize   = 40
	slideTolerancePx = 4
)

type captchaValue struct {
	code      string
	kind      string
	tolerance int
	time      time.Time
}

var (
	captchaMutex sync.Mutex
	captchaMap   = make(map[string]captchaValue)
)

// CaptchaChallenge 一次性人机挑战（答案仅存服务端）。
type CaptchaChallenge struct {
	ID          string
	Type        string
	ImageBase64 string
	PieceBase64 string
	PieceY      int
	TrackWidth  int
}

// NewCaptchaChallenge 随机生成数学计算或滑动拼图挑战。
func NewCaptchaChallenge() (*CaptchaChallenge, error) {
	kind, err := randomCaptchaKind()
	if err != nil {
		return nil, err
	}
	if kind == CaptchaTypeSlide {
		return newSlideCaptchaChallenge()
	}
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
	if value.kind == CaptchaTypeSlide {
		return consumeSlideAnswer(value, code)
	}
	return strings.EqualFold(value.code, code)
}

// SeedCaptchaForTest 仅供测试注入已知答案（按精确匹配校验）。
func SeedCaptchaForTest(id string, code string) {
	captchaMutex.Lock()
	captchaMap[id] = captchaValue{
		code: strings.TrimSpace(code),
		kind: CaptchaTypeMath,
		time: time.Now(),
	}
	captchaMutex.Unlock()
}

func consumeSlideAnswer(value captchaValue, code string) bool {
	got, err := strconv.Atoi(code)
	if err != nil {
		return false
	}
	want, err := strconv.Atoi(value.code)
	if err != nil {
		return false
	}
	diff := got - want
	if diff < 0 {
		diff = -diff
	}
	tolerance := value.tolerance
	if tolerance <= 0 {
		tolerance = slideTolerancePx
	}
	return diff <= tolerance
}

func randomCaptchaKind() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(2))
	if err != nil {
		return "", err
	}
	if n.Int64() == 0 {
		return CaptchaTypeMath, nil
	}
	return CaptchaTypeSlide, nil
}

func storeCaptcha(kind, code string, tolerance int) string {
	id := strings.ReplaceAll(uuid.NewString(), "-", "")
	captchaMutex.Lock()
	captchaMap[id] = captchaValue{
		code:      code,
		kind:      kind,
		tolerance: tolerance,
		time:      time.Now(),
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
	id := storeCaptcha(CaptchaTypeMath, strconv.Itoa(answer), 0)
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

func newSlideCaptchaChallenge() (*CaptchaChallenge, error) {
	maxX := slideTrackWidth - slidePieceSize - 20
	xN, err := rand.Int(rand.Reader, big.NewInt(int64(maxX-40)))
	if err != nil {
		return nil, err
	}
	yN, err := rand.Int(rand.Reader, big.NewInt(int64(slideTrackHeight-slidePieceSize-20)))
	if err != nil {
		return nil, err
	}
	targetX := int(xN.Int64()) + 40
	targetY := int(yN.Int64()) + 10

	bg, piece, err := renderSlidePuzzle(targetX, targetY)
	if err != nil {
		return nil, err
	}
	id := storeCaptcha(CaptchaTypeSlide, strconv.Itoa(targetX), slideTolerancePx)
	return &CaptchaChallenge{
		ID:          id,
		Type:        CaptchaTypeSlide,
		ImageBase64: pngDataURL(bg),
		PieceBase64: pngDataURL(piece),
		PieceY:      targetY,
		TrackWidth:  slideTrackWidth,
	}, nil
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

func renderSlidePuzzle(targetX, targetY int) (bgPNG, piecePNG []byte, err error) {
	bg := image.NewRGBA(image.Rect(0, 0, slideTrackWidth, slideTrackHeight))
	for y := range slideTrackHeight {
		for x := range slideTrackWidth {
			r := uint8(90 + (x*40)/slideTrackWidth + (y*20)/slideTrackHeight)
			g := uint8(130 + (y*50)/slideTrackHeight)
			b := uint8(170 + (x*30)/slideTrackWidth)
			bg.Set(x, y, color.RGBA{R: r, G: g, B: b, A: 255})
		}
	}
	for range 120 {
		x, _ := rand.Int(rand.Reader, big.NewInt(slideTrackWidth))
		y, _ := rand.Int(rand.Reader, big.NewInt(slideTrackHeight))
		bg.Set(int(x.Int64()), int(y.Int64()), color.RGBA{R: 220, G: 230, B: 240, A: 180})
	}
	for range 6 {
		x1, _ := rand.Int(rand.Reader, big.NewInt(slideTrackWidth))
		y1, _ := rand.Int(rand.Reader, big.NewInt(slideTrackHeight))
		x2, _ := rand.Int(rand.Reader, big.NewInt(slideTrackWidth))
		y2, _ := rand.Int(rand.Reader, big.NewInt(slideTrackHeight))
		drawCaptchaLine(bg, int(x1.Int64()), int(y1.Int64()), int(x2.Int64()), int(y2.Int64()), color.RGBA{R: 255, G: 255, B: 255, A: 90})
	}

	piece := image.NewRGBA(image.Rect(0, 0, slidePieceSize, slidePieceSize))
	hole := color.RGBA{R: 30, G: 41, B: 59, A: 210}
	for dy := range slidePieceSize {
		for dx := range slidePieceSize {
			src := bg.RGBAAt(targetX+dx, targetY+dy)
			piece.Set(dx, dy, src)
			bg.Set(targetX+dx, targetY+dy, hole)
		}
	}
	// 拼图块描边，便于辨认
	border := color.RGBA{R: 255, G: 255, B: 255, A: 220}
	for i := range slidePieceSize {
		piece.Set(i, 0, border)
		piece.Set(i, slidePieceSize-1, border)
		piece.Set(0, i, border)
		piece.Set(slidePieceSize-1, i, border)
	}

	var bgBuf, pieceBuf bytes.Buffer
	if err := png.Encode(&bgBuf, bg); err != nil {
		return nil, nil, err
	}
	if err := png.Encode(&pieceBuf, piece); err != nil {
		return nil, nil, err
	}
	return bgBuf.Bytes(), pieceBuf.Bytes(), nil
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
