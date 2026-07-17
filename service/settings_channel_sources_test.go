package service

import (
	"reflect"
	"testing"

	"github.com/basketikun/infinite-canvas/model"
)

func TestBuildAdminChannelModelSources(t *testing.T) {
	channels := []model.ModelChannel{
		{Name: "主渠道", Enabled: true, Models: []string{"model-a", " shared-model ", ""}},
		{Name: "备用渠道", Enabled: true, Models: []string{"shared-model", "model-b"}},
		{Name: "已停用", Enabled: false, Models: []string{"model-a", "disabled-only"}},
		{Remark: "备注渠道", Enabled: true, Models: []string{"model-c"}},
		{Enabled: true, Models: []string{"model-d", "model-d"}},
	}

	want := []model.ChannelModelSource{
		{ModelName: "model-a", Channels: []string{"主渠道"}},
		{ModelName: "shared-model", Channels: []string{"主渠道", "备用渠道"}},
		{ModelName: "model-b", Channels: []string{"备用渠道"}},
		{ModelName: "model-c", Channels: []string{"备注渠道"}},
		{ModelName: "model-d", Channels: []string{"渠道 5"}},
	}

	if got := buildAdminChannelModelSources(channels); !reflect.DeepEqual(got, want) {
		t.Fatalf("buildAdminChannelModelSources() = %#v, want %#v", got, want)
	}
}
