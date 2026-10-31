/**
 * AI 助手支持的服务商。
 * - Claude（Anthropic）使用官方 SDK 调用 Messages API
 * - 其他服务商都使用通用的 OpenAI 兼容接口（POST {接口地址}/chat/completions，流式返回）
 * 接口地址和模型都可以在设置里修改；「自定义」可以填写任何 OpenAI 兼容的接口（例如中转服务、本机部署的模型）
 */
export type AiProviderId =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'kimi'
  | 'glm'
  | 'siliconflow'
  | 'gemini'
  | 'ollama'
  | 'custom'

/** 接口格式：Anthropic Messages API / OpenAI 兼容的 Chat Completions */
export type AiApiKind = 'anthropic' | 'openai'

export interface AiProviderPreset {
  id: AiProviderId
  /** 显示的名字 */
  name: string
  kind: AiApiKind
  /** 默认的接口地址（OpenAI 兼容接口填到 /v1 这一级，不含 /chat/completions） */
  baseUrl: string
  /** 默认模型；空字符串表示需要玩家自己选择（可以点「获取模型列表」） */
  model: string
  /** 是否需要 API Key（本机运行的 Ollama 不需要） */
  needsKey: boolean
  /** 模型输入框的提示 */
  modelHint: string
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  {
    id: 'anthropic',
    name: 'Claude（Anthropic）',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-5-5',
    needsKey: true,
    modelHint: '例如 claude-opus-5-5'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    needsKey: true,
    modelHint: '点「获取模型列表」选择'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek（深度求索）',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    needsKey: true,
    modelHint: '例如 deepseek-chat'
  },
  {
    id: 'qwen',
    name: '通义千问（阿里云百炼）',
    kind: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    needsKey: true,
    modelHint: '例如 qwen-plus'
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: '',
    needsKey: true,
    modelHint: '点「获取模型列表」选择'
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    kind: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: '',
    needsKey: true,
    modelHint: '点「获取模型列表」选择'
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    kind: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: '',
    needsKey: true,
    modelHint: '点「获取模型列表」选择'
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: '',
    needsKey: true,
    modelHint: '点「获取模型列表」选择'
  },
  {
    id: 'ollama',
    name: 'Ollama（本机运行）',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: '',
    needsKey: false,
    modelHint: '本机已下载的模型，例如 qwen2.5'
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容接口）',
    kind: 'openai',
    baseUrl: '',
    model: '',
    needsKey: true,
    modelHint: '填写服务商提供的模型名'
  }
]

export const AI_PROVIDER_IDS = AI_PROVIDERS.map((p) => p.id)

export function aiProvider(id: string): AiProviderPreset {
  return AI_PROVIDERS.find((p) => p.id === id) ?? AI_PROVIDERS[0]
}
