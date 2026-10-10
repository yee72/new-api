package setting

import (
	"encoding/json"

	"github.com/QuantumNous/new-api/common"
)

// Chats 外部聊天客户端快捷入口已停用，保留空列表以兼容旧配置读写。
var Chats = []map[string]string{}

func UpdateChatsByJsonString(jsonString string) error {
	Chats = make([]map[string]string, 0)
	return json.Unmarshal([]byte(jsonString), &Chats)
}

func Chats2JsonString() string {
	jsonBytes, err := json.Marshal(Chats)
	if err != nil {
		common.SysLog("error marshalling chats: " + err.Error())
		return "[]"
	}
	return string(jsonBytes)
}
