package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strconv"
)


// RequestField 定义模型级别的自定义请求字段。
// 字段名映射到发送给 AI API 的请求体字段；留空则不映射。
type RequestField struct {
	FieldName    string `json:"fieldName"`    // 前端统一字段名，如 reference_images
	RequestKey   string `json:"requestKey"`   // 映射到请求体的字段名，如 images
	DataType     string `json:"dataType"`     // 数据类型: string, integer, boolean, number, array, object
}

// ModelClassification 定义模型的能力分类和参数配置
// capability: "text" | "image" | "video" | "audio"
type ModelClassification struct {
	ID         string `json:"id" gorm:"primaryKey"`
	ModelName  string `json:"modelName" gorm:"uniqueIndex"`
	Capability string `json:"capability"` // text, image, video, audio

	// 视频模型参数 (JSON)
	// 模级级自定义请求字段，优先于渠道级 FieldMapping
	RequestFields []RequestField `json:"requestFields" gorm:"type:text"`

	VideoConfig *VideoModelConfig `json:"videoConfig" gorm:"type:text"`

	// 图片模型参数 (JSON)
	ImageConfig *ImageModelConfig `json:"imageConfig" gorm:"type:text"`

	// 音频模型参数 (JSON)
	AudioConfig *AudioModelConfig `json:"audioConfig" gorm:"type:text"`

	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// VideoModelConfig 视频模型参数配置
type VideoModelConfig struct {
	Resolutions          []string   `json:"resolutions"`
	Ratios               []string   `json:"ratios"`
	Durations            []string   `json:"durations"` // 支持 "adaptive" 和数字字符串如 "15"
	MaxDuration          int        `json:"maxDuration"`
	SupportGenerateAudio bool       `json:"supportGenerateAudio"`
	SupportWatermark     bool       `json:"supportWatermark"`
}

// UnmarshalJSON 兼容数据库中旧的数字格式 durations: [15] 和新的字符串格式 durations: ["15"]
func (c *VideoModelConfig) UnmarshalJSON(data []byte) error {
	type Alias VideoModelConfig
	aux := &struct {
		Durations json.RawMessage `json:"durations"`
		*Alias
	}{
		Alias: (*Alias)(c),
	}
	if err := json.Unmarshal(data, aux); err != nil {
		return err
	}
	if len(aux.Durations) > 0 && aux.Durations[0] == '[' {
		// 尝试解析为字符串数组
		var strs []string
		if err := json.Unmarshal(aux.Durations, &strs); err == nil {
			c.Durations = strs
			return nil
		}
		// 尝试解析为数字数组并转换为字符串
		var nums []json.Number
		if err := json.Unmarshal(aux.Durations, &nums); err == nil {
			c.Durations = make([]string, len(nums))
			for i, n := range nums {
				c.Durations[i] = n.String()
			}
			return nil
		}
		// 尝试解析为 float64 数组
		var floats []float64
		if err := json.Unmarshal(aux.Durations, &floats); err == nil {
			c.Durations = make([]string, len(floats))
			for i, f := range floats {
				c.Durations[i] = strconv.FormatFloat(f, 'f', -1, 64)
			}
			return nil
		}
	}
	return nil
}

func (c VideoModelConfig) Value() (driver.Value, error) {
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (c *VideoModelConfig) Scan(src interface{}) error {
	if src == nil {
		return nil
	}
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, c)
	case string:
		return json.Unmarshal([]byte(v), c)
	default:
		return fmt.Errorf("cannot scan %T into VideoModelConfig", src)
	}
}

// ImageModelConfig 图片模型参数配置
type ImageModelConfig struct {
	Qualities        []string `json:"qualities"`
	AspectRatios     []string `json:"aspectRatios"`
	MaxCount         int      `json:"maxCount"`
	SupportCustomSize bool   `json:"supportCustomSize"`
}

func (c ImageModelConfig) Value() (driver.Value, error) {
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (c *ImageModelConfig) Scan(src interface{}) error {
	if src == nil {
		return nil
	}
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, c)
	case string:
		return json.Unmarshal([]byte(v), c)
	default:
		return fmt.Errorf("cannot scan %T into ImageModelConfig", src)
	}
}

// AudioModelConfig 音频模型参数配置
type AudioModelConfig struct {
	Voices     []string   `json:"voices"`
	Formats    []string   `json:"formats"`
	SpeedRange *SpeedRange `json:"speedRange"`
}

func (c AudioModelConfig) Value() (driver.Value, error) {
	b, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (c *AudioModelConfig) Scan(src interface{}) error {
	if src == nil {
		return nil
	}
	switch v := src.(type) {
	case []byte:
		return json.Unmarshal(v, c)
	case string:
		return json.Unmarshal([]byte(v), c)
	default:
		return fmt.Errorf("cannot scan %T into AudioModelConfig", src)
	}
}

type SpeedRange struct {
	Min float64 `json:"min"`
	Max float64 `json:"max"`
}

type ModelClassificationList struct {
	Items []ModelClassification `json:"items"`
	Total int                   `json:"total"`
}
