/**
 * OpenAI模型枚举
 */
class OpenAIModelEnum {
  /**
   * gpt-3.5-turbo
   */
  static GPT_TURBO_35 = 'gpt-3.5-turbo'

  /**
   * gpt-3.5-turbo-0301
   */
  static GPT_TURBO_35_0301 = 'gpt-3.5-turbo-0301'

  /**
   * gpt-3.5-turbo-0613
   */
  static GPT_TURBO_35_0613 = 'gpt-3.5-turbo-0613'

  /**
   * gpt-3.5-turbo-16K
   */
  static GPT_TURBO_35_16K = 'gpt-3.5-turbo-16k'

  /**
   * gpt-3.5-turbo-0301
   */
  static GPT_TURBO_35_16K_0613 = 'gpt-3.5-turbo-16k-0613'

  /**
   * 默认请求URL
   */
  static REQUEST_URL = 'https://api.openai.com'

  /**
   * 默认系统提示词
   */
  static DEFAULT_SYSTEM_PROMPT =
    'You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.'

  /**
   * 默认用户提示词模板 - 自定义时作为参考
   */
  static DEFAULT_USER_PROMPT =
    'Translate the following text from {{from}} to {{to}}. Return the translated text only, without any explanation.\n\n{{text}}'

  /**
   * 功能类语言类型 - 这些功能使用内置提示词 不受自定义提示词影响
   */
  static FUNCTION_LANGUAGE_TYPE_LIST = ['文字润色', '总结', '分析', '解释代码']

  /**
   * 模型列表 - 仅作为输入提示 可自行输入任意模型名称
   */
  static MODEL_LIST = [
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
    { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
    { value: 'gpt-4.1', label: 'gpt-4.1' },
    { value: 'gpt-5-mini', label: 'gpt-5-mini' },
    { value: 'gpt-5', label: 'gpt-5' },
    { value: 'deepseek-chat', label: 'deepseek-chat' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner' },
    {
      value: OpenAIModelEnum.GPT_TURBO_35,
      label: OpenAIModelEnum.GPT_TURBO_35
    },
    {
      value: OpenAIModelEnum.GPT_TURBO_35_0301,
      label: OpenAIModelEnum.GPT_TURBO_35_0301
    },
    {
      value: OpenAIModelEnum.GPT_TURBO_35_0613,
      label: OpenAIModelEnum.GPT_TURBO_35_0613
    },
    {
      value: OpenAIModelEnum.GPT_TURBO_35_16K,
      label: OpenAIModelEnum.GPT_TURBO_35_16K
    },
    {
      value: OpenAIModelEnum.GPT_TURBO_35_16K_0613,
      label: OpenAIModelEnum.GPT_TURBO_35_16K_0613
    }
  ]
}

/**
 * 思考强度列表 - 对应请求参数 reasoning_effort
 */
export const OpenAIReasoningEffortList = [
  { value: '', label: '默认（不传递）' },
  { value: 'none', label: 'none（关闭思考）' },
  { value: 'minimal', label: 'minimal' },
  { value: 'low', label: 'low' },
  { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' }
]

/**
 * 额外请求参数常用模板 - 各服务商控制思考等功能的参数并不统一
 */
export const OpenAIExtraParamsPresetList = [
  {
    label: 'DeepSeek / 智谱GLM / 豆包 - 关闭思考',
    value: { thinking: { type: 'disabled' } }
  },
  {
    label: 'DeepSeek / 智谱GLM / 豆包 - 开启思考',
    value: { thinking: { type: 'enabled' } }
  },
  {
    label: '通义千问(Qwen) - 关闭思考',
    value: { enable_thinking: false }
  },
  {
    label: '通义千问(Qwen) - 开启思考',
    value: { enable_thinking: true, thinking_budget: 1024 }
  },
  {
    label: 'Gemini(OpenAI兼容) - 关闭思考',
    value: { reasoning_effort: 'none' }
  },
  {
    label: '限制最大输出 token',
    value: { max_tokens: 4096 }
  },
  {
    label: '设置随机性 temperature',
    value: { temperature: 0.3 }
  }
]

export { OpenAIModelEnum }
