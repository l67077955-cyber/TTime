import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import GlobalWin from '../service/GlobalWin'
import { injectAgent } from './RequestUtil'
import StoreService from '../service/StoreService'
import { isNotNull, isNull } from '../../common/utils/validate'
import { getTranslateRequestContext } from '../service/channel/TranslateRequestControl'

const BASE_API = 'https://ink.timerecord.cn/apis/'

// 创建 axios
const service = axios.create({
  // 请求地址
  baseURL: BASE_API,
  // 请求超时时间(毫秒)
  timeout: 15000
})

/**
 * 请求拦截器
 * 发送请求前对请求体进行处理
 */
service.interceptors.request.use(
  async (config) => {
    // 因为在主进程中执行 获取到的 User-Agent 信息为空
    // 所以这里调用主窗口页面手动执行js脚本获取 User-Agent 信息
    // 由于 executeJavaScript 是异步执行的 所以这里进行等待执行
    await GlobalWin.mainWin.webContents
      .executeJavaScript('window.navigator.userAgent')
      .then((result) => {
        config.headers['User-Agent'] = result
      })
    await injectAgent(config)
    const token = StoreService.configGet('token')
    if (isNull(config.headers['token']) && isNotNull(token)) {
      // 设置用户token
      config.headers['token'] = token
    }
    return config
  },
  (error) => {
    // 处理请求错误
    return Promise.reject(error)
  }
)

/**
 * 响应拦截器
 * 得到请求响应体后对其进行处理
 */
service.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  }
)

/**
 * 发起请求
 * 在翻译请求上下文中发起时 绑定中止信号并登记为进行中的请求 以便中止翻译时取消并等待其结束
 *
 * @param config 请求配置
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function request<T = any, R = AxiosResponse<T>, D = any>(config: AxiosRequestConfig<D>): Promise<R> {
  const context = getTranslateRequestContext()
  if (!context) return service<T, R, D>(config)
  const promise = service<T, R, D>({ ...config, signal: config.signal ?? context.controller.signal })
  context.pending.add(promise)
  const remove = (): void => {
    context.pending.delete(promise)
  }
  promise.then(remove, remove)
  return promise
}

export default request
