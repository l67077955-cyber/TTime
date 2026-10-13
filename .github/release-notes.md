- OpenAI 翻译支持自定义模型名称（如 deepseek-chat、gpt-4o-mini 等任意模型）
- OpenAI 翻译新增「思考强度」设置（reasoning_effort）
- OpenAI 翻译新增「额外参数」(JSON)，可设置 DeepSeek / 智谱 / 豆包 / Qwen 等服务商的思考开关等特有参数，并提供常用参数一键插入
- OpenAI 翻译支持自定义系统提示词、用户提示词，支持 {{from}} {{to}} {{text}} 变量，修改后自动保存

- 修复 OpenAI 自定义接口（如 DeepSeek）翻译经常没有输出的问题
- 请求失败时显示具体错误信息，不再静默返回空结果
- 请求地址支持 .../v1、.../api/v3 及完整的 .../chat/completions 写法

- 移除会员(VIP)功能、登录及云同步
- 移除官方服务器自动更新检测，托盘「检查更新」改为打开本仓库 Releases 页面

