package computeruse

import (
	"image"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestScaleImageKeepsTinyPositiveImagesNonZero(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))

	scaled := scaleImage(img, 0.1)

	assert.Equal(t, 1, scaled.Bounds().Dx())
	assert.Equal(t, 1, scaled.Bounds().Dy())
}
