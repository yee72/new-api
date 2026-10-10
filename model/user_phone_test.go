package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeContactPhone(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "empty", input: "  ", want: ""},
		{name: "cn mobile", input: "138-0013-8000", want: "13800138000"},
		{name: "e164", input: "+86 138 0013 8000", want: "+8613800138000"},
		{name: "letters", input: "abc123", wantErr: true},
		{name: "too short", input: "1234567", wantErr: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := NormalizeContactPhone(test.input)
			if test.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, test.want, got)
		})
	}
}
