import { AsyncLocalStorage } from 'async_hooks'

/**
 * 翻译请求上下文
 * 同一次翻译（同一 requestId）的所有翻译源共用一个上下文
 */
interface TranslateRequestContext {
  requestId: string
  controller: AbortController
  pending: Set<Promise<unknown>>
}

const storage = new AsyncLocalStorage<TranslateRequestContext>()
let current: TranslateRequestContext | undefined

/**
 * 在翻译请求上下文中执行翻译
 * 上下文内通过 request 发起的请求会绑定中止信号 并登记为进行中的请求
 *
 * @param requestId 翻译请求ID
 * @param fn        翻译执行方法
 */
export const runTranslateRequest = (requestId: string | undefined, fn: () => void): void => {
  if (!requestId) {
    fn()
    return
  }
  if (current?.requestId !== requestId) {
    current?.controller.abort()
    current = { requestId, controller: new AbortController(), pending: new Set() }
  }
  storage.run(current, fn)
}

/**
 * 中止当前翻译 并等待进行中的请求全部结束
 */
export const stopTranslateRequest = async (): Promise<void> => {
  const context = current
  current = undefined
  if (!context) return
  context.controller.abort()
  await Promise.allSettled([...context.pending])
}

/**
 * 获取当前执行所在的翻译请求上下文
 */
export const getTranslateRequestContext = (): TranslateRequestContext | undefined => {
  return storage.getStore()
}
