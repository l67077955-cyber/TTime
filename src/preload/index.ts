import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import common from './common'
import TranslateServiceEnum from '../common/enums/TranslateServiceEnum'

// 窗口最大高度 以主进程按当前显示器工作区计算的结果为准 收到之前按屏幕可用高度估算
let maxWinHeight = Math.min(722, Math.max(240, (window?.screen?.availHeight || 722) - 20))
// 最近一次请求（或主进程实际生效）的窗口高度
let requestedHeight = 0
// 内容变少时延迟缩小窗口 避免翻译过程中窗口反复缩小导致结果被截断
const SHRINK_DELAY = 1000
let shrinkTimer: ReturnType<typeof setTimeout> | null = null

// 滚动容器(.block-layer)最大高度跟随窗口最大高度 内容超出时在容器内滚动
const syncMaxHeightCssVar = (): void => {
  document.documentElement?.style.setProperty(
    '--ttime-translate-max-height',
    `${Math.max(180, maxWinHeight - 51)}px`
  )
}

const getContentWindowHeight = (): number => {
  const el = (document.querySelector('.block') as HTMLElement | null) || document.documentElement
  const contentHeight = el ? el.offsetHeight : 334
  return Math.min(maxWinHeight, Math.max(100, Math.ceil(contentHeight + 5)))
}

const sendWindowHeight = (height: number, force = false): void => {
  if (!force && height === requestedHeight) {
    return
  }
  requestedHeight = height
  ipcRenderer.invoke('window-height-change-event', height)
}

const clearShrinkTimer = (): void => {
  if (shrinkTimer) {
    clearTimeout(shrinkTimer)
    shrinkTimer = null
  }
}

const scheduleShrink = (): void => {
  clearShrinkTimer()
  shrinkTimer = setTimeout(() => {
    shrinkTimer = null
    sendWindowHeight(getContentWindowHeight())
  }, SHRINK_DELAY)
}

/**
 * 按内容高度同步窗口高度 内容变多时立即放大 变少时延迟缩小
 */
const syncWindowHeight = (): void => {
  const height = getContentWindowHeight()
  if (height >= requestedHeight) {
    clearShrinkTimer()
    sendWindowHeight(height)
  } else {
    scheduleShrink()
  }
}

// 主进程应用窗口高度后回传实际高度与当前显示器下的最大高度
ipcRenderer.on('win-height-limit-update', (_event, { height, maxHeight }) => {
  requestedHeight = height
  if (maxHeight !== maxWinHeight) {
    maxWinHeight = maxHeight
    syncMaxHeightCssVar()
    syncWindowHeight()
  }
})

// 监听页面高度变化
const pageHeightChangeEvent = (): void => {
  syncMaxHeightCssVar()
  if (typeof ResizeObserver === 'undefined' || !document.body) {
    return
  }
  const resizeObserver = new ResizeObserver(() => syncWindowHeight())
  resizeObserver.observe(document.body)
  // .block 由 Vue 渲染 挂载或被替换时重新观察
  let observedBlock: Element | null = null
  const observeBlock = (): void => {
    const blockEl = document.querySelector('.block')
    if (blockEl === observedBlock) {
      return
    }
    if (observedBlock) {
      resizeObserver.unobserve(observedBlock)
    }
    if (blockEl) {
      resizeObserver.observe(blockEl)
    }
    observedBlock = blockEl
  }
  observeBlock()
  new MutationObserver(observeBlock).observe(document.body, { childList: true, subtree: true })
}

/**
 * 窗口高度更新为最大 翻译结果返回期间保持最大 内容稳定后再按实际高度缩小
 */
const windowHeightChangeMaxEvent = (): void => {
  sendWindowHeight(maxWinHeight)
  scheduleShrink()
}

/**
 * 监听页面高度更新窗口大小
 */
const windowHeightChangeEvent = (): void => {
  // 延迟执行 防止获取页面高度还未更新就执行了更新窗口大小
  setTimeout(() => {
    clearShrinkTimer()
    sendWindowHeight(getContentWindowHeight(), true)
  }, 120)
}

/**
 * 监听更新翻译输入内容事件
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const updateTranslateContentEvent = (callback): void => {
  ipcRenderer.on('update-translated-content', (_event, content) => {
    callback(content)
  })
}

/**
 * 截图翻译结束通知事件
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const screenshotEndNotifyEvent = (callback): void => {
  ipcRenderer.on('screenshot-end-notify-event', (_event) => {
    callback()
  })
}

/**
 * 清空翻译输入、结果内容事件
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const clearAllTranslateContentEvent = (callback): void => {
  ipcRenderer.on('clear-all-translated-content', (_event, _content) => {
    callback()
  })
}

const winShowEvent = (callback): void => {
  ipcRenderer.on('win-show-event', () => {
    callback()
  })
}

const winShowByInputEvent = (callback): void => {
  ipcRenderer.on('win-show-input-event', () => {
    callback()
  })
}

/**
 * 始终在最前面
 */
const alwaysOnTopEvent = (status): void => {
  ipcRenderer.invoke('always-on-top-event', status)
}

/**
 * 更新消息事件
 *
 * @param callback 回调方法
 */
const updateMessageEvent = (callback): void => {
  ipcRenderer.on('update-message-event', (_event, { type, text }) => {
    callback(type, text)
  })
}

/**
 * api翻译回调
 */
const apiTranslateCallbackEventList = {}
/**
 * 根据枚举类型进行创建回调方法
 */
Object.keys(TranslateServiceEnum)
  .filter((key) => typeof TranslateServiceEnum[key] === 'string')
  .map((key) => TranslateServiceEnum[key].toLowerCase())
  .forEach((code) => {
    apiTranslateCallbackEventList[code + 'ApiTranslateCallbackEvent'] = (callback): void => {
      ipcRenderer.on(code + '-api-translate-callback-event', (_event, obj) => {
        callback(obj)
      })
    }
  })

/**
 * 翻译结果消息回调
 * 如果校验无法翻译时，但也不能触发翻译事件时候，此处模拟翻译结果消息回调
 * 目前主要用于手动设置了翻译语言后的校验逻辑
 *
 * @param type 翻译渠道类型
 * @param msg  回调消息内容
 */
const apiTranslateResultMsgCallbackEvent = (type, msg): void => {
  ipcRenderer.invoke('api-translate-result-msg-callback-event', type, msg)
}

/**
 * 翻译
 *
 * @param type 翻译渠道类型
 * @param info 翻译信息
 */
const apiUniteTranslate = (type, info): void => {
  ipcRenderer.invoke('api-unite-translate', type, info)
}

/**
 * 应用启动
 */
const ttimeApiAppStart = (): void => {
  ipcRenderer.invoke('ttime-api-app-start')
}

/**
 * 应用翻译使用
 */
const ttimeApiTranslateUse = (): void => {
  ipcRenderer.invoke('ttime-api-translate-use')
}

/**
 * 更新翻译源通知
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const updateTranslateServiceEvent = (callback): void => {
  ipcRenderer.on('update-translate-service-event', (_event) => {
    callback()
  })
}

/**
 * 更新翻译源通知
 */
const updateTranslateServiceNotify = (): void => {
  ipcRenderer.invoke('update-translate-service-notify')
}

/**
 * 窗口字体大小更新通知
 *
 * @param callback 回调方法 用于主进程内部触发时推送到Vue页面执行
 */
const winFontSizeNotify = (callback): void => {
  ipcRenderer.on('win-font-size-notify', (_event) => {
    callback()
  })
}

/**
 * 代理模式 - api翻译
 *
 * @param callback 回调
 */
const agentApiTranslate = (callback): void => {
  ipcRenderer.on('agent-api-translate', (_event, info) => {
    callback(info)
  })
}

/**
 * 代理翻译 - 调用翻译结果回调
 *
 * @param res 信息
 */
const agentApiTranslateCallback = (res): void => {
  ipcRenderer.invoke('agent-api-translate-callback', res)
}

/**
 * 代理模式 - api OCR
 *
 * @param callback 回调
 */
const agentApiOcr = (callback): void => {
  ipcRenderer.on('agent-api-ocr', (_event, info) => {
    callback(info)
  })
}

/**
 * 代理OCR - 调用OCR回调
 *
 * @param res 信息
 */
const agentApiOcrCallback = (res): void => {
  ipcRenderer.invoke('agent-api-ocr-callback', res)
}

/**
 * 窗口大小更新
 */
const winSizeUpdate = (callback): void => {
  ipcRenderer.on('win-size-update', (_event, newBounds) => {
    callback(newBounds)
  })
}

// Custom APIs for renderer
const api = {
  ...common,
  ...apiTranslateCallbackEventList,
  windowHeightChangeEvent,
  updateTranslateContentEvent,
  clearAllTranslateContentEvent,
  pageHeightChangeEvent,
  alwaysOnTopEvent,
  updateMessageEvent,
  windowHeightChangeMaxEvent,
  screenshotEndNotifyEvent,
  winShowEvent,
  winShowByInputEvent,
  apiUniteTranslate,
  ttimeApiAppStart,
  updateTranslateServiceEvent,
  updateTranslateServiceNotify,
  ttimeApiTranslateUse,
  apiTranslateResultMsgCallbackEvent,
  agentApiTranslate,
  agentApiTranslateCallback,
  agentApiOcr,
  agentApiOcrCallback,
  winFontSizeNotify,
  winSizeUpdate
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
