<template>
  <div
    v-for="[serviceId, translateService] in translateServiceMap"
    v-show="!selectedServiceId || selectedServiceId === serviceId"
    :key="serviceId"
  >
    <input-result-content-channel
      :ref="(channel) => setChannelRef(serviceId, channel)"
      :translate-service="translateService"
    />
  </div>
</template>

<script setup lang="ts">
import InputResultContentChannel from './channel/InputResultContentChannel.vue'

import { ref } from 'vue'
import { getTranslateServiceMapByUse } from '../../utils/translateServiceUtil'

// 翻译结果框
const channelRefs = new Map()
const selectedServiceId = ref<string>()
// 获取缓存中的翻译服务list
const translateServiceMap = ref()

/**
 * 加载翻译服务
 */
const initTranslateServiceMap = (): void => {
  // 获取缓存中的翻译服务list
  translateServiceMap.value = getTranslateServiceMapByUse()
}
// 加载翻译服务
initTranslateServiceMap()

/**
 * 更新翻译服务事件
 */
window.api.updateTranslateServiceEvent(() => {
  // 加载翻译服务
  initTranslateServiceMap()
})

/**
 * 设置通道ref
 *
 * @param id 翻译服务ID
 * @param channel 结果组件
 */
const setChannelRef = (id, channel): void => {
  if (channel) channelRefs.set(id, channel)
  else channelRefs.delete(id)
}

/**
 * 重置结果并开始当前翻译请求
 */
const startRequest = (requestId: string, serviceId?: string): void => {
  selectedServiceId.value = serviceId
  channelRefs.forEach((channel, id) => {
    channel.startRequest(!serviceId || serviceId === id ? requestId : undefined)
  })
}

/**
 * 清空翻译结果内容事件
 */
const clearTranslatedResultContentEvent = (): void => {
  selectedServiceId.value = undefined
  channelRefs.forEach((channel) => {
    channel.clearTranslatedResultContentEvent()
  })
}

defineExpose({
  startRequest,
  clearTranslatedResultContentEvent
})
</script>

<style lang="scss" scoped></style>
