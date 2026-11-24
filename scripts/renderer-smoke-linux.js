const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises')
const { createServer, get } = require('node:http')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const electron = require('electron')
const WebSocket = require('ws')

const project = resolve(__dirname, '..')
const { name: appName } = require('../package.json')
const requests = []
let cancelled = 0

const mock = createServer(async (request, response) => {
  if (request.method !== 'POST') {
    response.writeHead(405).end()
    return
  }
  let raw = ''
  for await (const chunk of request) raw += chunk
  const { messages, model } = JSON.parse(raw)
  const prompt = messages.map(({ content }) => content).join(' ')
  requests.push({ model, prompt })

  if (prompt.includes('full response')) {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        choices: [{ message: { content: '<think>hidden</think>完整結果' } }]
      })
    )
    return
  }

  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const send = (delta) =>
    response.write('data: ' + JSON.stringify({ choices: [{ delta }] }) + '\n\n')
  const finish = () => response.end('data: [DONE]\n\n')
  if (prompt.includes('first submission')) {
    send({ content: '舊翻譯開頭' })
    const timer = setTimeout(() => {
      send({ content: '舊翻譯尾巴' })
      finish()
    }, 8000)
    response.on('close', () => {
      clearTimeout(timer)
      if (!response.writableEnded) cancelled++
    })
    return
  }

  const custom = prompt.includes('Extract facts')
  send({ reasoning_content: 'hidden metadata', content: '<thi' })
  await delay(20)
  send({ content: 'nk>hidden inline</thi' })
  await delay(20)
  send({ content: 'nk>' + (custom ? '自訂輸出 data: 保留' : '新翻譯 ' + model) })
  finish()
})

async function waitFor(label, check, timeout = 18000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value) return value
    await delay(50)
  }
  throw new Error('Timed out waiting for ' + label)
}

function listPages(port) {
  return new Promise((resolve, reject) => {
    get({ hostname: '127.0.0.1', port, path: '/json/list', timeout: 3000 }, (response) => {
      let json = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        json += chunk
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(json))
        } catch (error) {
          reject(error)
        }
      })
      response.on('error', reject)
    })
      .on('timeout', function () {
        this.destroy(new Error('DevTools HTTP request timed out'))
      })
      .on('error', reject)
  })
}

async function connectPage(port, path, sockets) {
  const target = await waitFor(path, async () => {
    try {
      const pages = await listPages(port)
      return pages.find(({ url }) => url.endsWith('/' + path))
    } catch {
      // DevTools can take a few seconds to respond while Electron initializes.
      return undefined
    }
  })
  const socket = new WebSocket(target.webSocketDebuggerUrl, { handshakeTimeout: 5000 })
  sockets.push(socket)
  await once(socket, 'open')
  const pending = new Map()
  let nextId = 0
  const rejectPending = (error) => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    pending.clear()
  }
  socket.on('error', rejectPending)
  socket.on('close', () => rejectPending(new Error('DevTools session disconnected')))
  socket.on('message', (raw) => {
    const { id, result, error } = JSON.parse(raw)
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    clearTimeout(request.timer)
    if (error) request.reject(new Error(error.message))
    else request.resolve(result)
  })

  return async (expression) => {
    const { result, exceptionDetails } = await new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error('DevTools session is closed'))
        return
      }
      const id = ++nextId
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('DevTools evaluation timed out'))
      }, 8000)
      pending.set(id, { resolve, reject, timer })
      socket.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true }
        })
      )
    })
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }
}

function clickText(selector, text) {
  return `[...document.querySelectorAll(${JSON.stringify(selector)})]
    .find((node) => node.textContent.trim() === ${JSON.stringify(text)})?.click()`
}

function edit(selector, text) {
  return `(() => {
    const field = document.querySelector(${JSON.stringify(selector)})
    field.value = ${JSON.stringify(text)}
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })()`
}

async function verify(port, config, sockets) {
  const main = await connectPage(port, 'index.html', sockets)
  await waitFor('translation UI', () =>
    main('document.querySelectorAll(".content-translate-name").length === 2')
  )
  const input = '.content textarea[placeholder="请输入单词或文字"]'
  const enter = async (text) => {
    await main(edit(input, text))
    await main(`document.querySelector(${JSON.stringify(input)}).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    )`)
  }
  const output = () =>
    main(
      '[...document.querySelectorAll(".content textarea[readonly]")].map((field) => field.value).join("|")'
    )

  await enter('first submission')
  await waitFor('two initial streams', async () => (await output()) === '舊翻譯開頭|舊翻譯開頭')
  await enter('second submission')
  await waitFor(
    'two new translations',
    async () => (await output()) === '新翻譯 first|新翻譯 second'
  )
  await waitFor('cancellation of the older streams', () => cancelled === 2)
  await delay(550)
  assert.equal(requests.length, 4, 'Enter should cancel the pending automatic submission')
  console.log('PASS  Enter replacement, concurrent sources and split <think> filtering')

  await main('window.api.openSetPageEvent()')
  const settings = await connectPage(port, 'set.html', sockets)
  await waitFor('settings UI', () => settings('Boolean(document.querySelector(".el-menu-item"))'))
  await settings(clickText('.el-menu-item', '翻译源设置'))
  await waitFor('custom action controls', () =>
    settings(
      '[...document.querySelectorAll("button")].some((node) => node.textContent.trim() === "新增功能")'
    )
  )
  const name = 'input[placeholder^="功能名称"]'
  const resultMenu = 'document.querySelector(".language-block-right")'
  const resultTitle = () => main(resultMenu + '.textContent.trim()')
  await settings(clickText('button', '新增功能'))
  await settings(edit(name, '提取事實'))
  await settings(
    edit('textarea[placeholder="输入提示词"]', 'Extract facts from {{from}} text: {{text}}')
  )
  await settings(clickText('button', '保存功能'))
  await waitFor('custom action saved', async () => {
    const saved = JSON.parse(await readFile(config, 'utf8'))
    return saved.translateServiceMap[0][1].customActions?.[0]?.name === '提取事實'
  })
  await main(resultMenu + '.click()')
  await waitFor('custom action in the result menu', () =>
    main(
      '[...document.querySelectorAll(".language-name")].some((node) => node.textContent === "提取事實")'
    )
  )
  await main(clickText('a.language-block.function-tools', '提取事實'))
  await enter('example source text')
  await waitFor('custom output', async () => (await output()) === '自訂輸出 data: 保留')
  assert.equal(requests.length, 5, 'The custom action should run on its own provider')
  assert.equal(requests[4].model, 'first')
  assert.match(requests[4].prompt, /Extract facts from .+ text: example source text/)
  await enter('full response')
  await waitFor('non-stream response', async () => (await output()) === '完整結果')
  await settings(clickText('button', '编辑'))
  await settings(edit(name, '提取重點'))
  await settings(clickText('button', '保存功能'))
  await waitFor('renamed selection', async () => (await resultTitle()) === '提取重點')
  await settings(clickText('button', '删除'))
  await waitFor(
    'selection after deleting the action',
    async () => (await resultTitle()) === '自动识别'
  )
  console.log(
    'PASS  Custom action creation, selection, execution, rename and deletion, plus JSON response filtering'
  )
}

async function run() {
  const profile = await mkdtemp(join(tmpdir(), 'ttime-renderer-'))
  const sockets = []
  const mockConnections = new Set()
  let app = null
  let logs = ''
  let appError
  try {
    mock.on('connection', (socket) => {
      mockConnections.add(socket)
      socket.on('close', () => mockConnections.delete(socket))
    })
    mock.listen(0, '127.0.0.1')
    await once(mock, 'listening')
    const requestUrl = 'http://127.0.0.1:' + mock.address().port
    const source = (model, index) => ({
      id: model,
      index,
      serviceName: model,
      type: 'OpenAI',
      isBuiltIn: false,
      useStatus: true,
      checkStatus: true,
      appKey: 'local-test-key',
      requestUrl,
      model
    })
    const settingsDir = join(profile, appName, 'userDataConfig')
    const config = join(settingsDir, 'config.json')
    await mkdir(settingsDir, { recursive: true })
    await writeFile(
      config,
      JSON.stringify({
        servicePort: 0,
        translateServiceMap: [
          ['first', source('first', 0)],
          ['second', source('second', 1)]
        ],
        inputTranslationAutoStatus: 'Y',
        showTranslateNotEmptyStatus: 'Y',
        translateHistoryStatus: 'Y'
      })
    )
    const env = { ...process.env, XDG_CONFIG_HOME: profile, XDG_DATA_HOME: join(profile, 'data') }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    const args = ['--remote-debugging-port=0', '--disable-dev-shm-usage']
    if (process.getuid?.() === 0) args.push('--no-sandbox')
    app = spawn(electron, [...args, '.'], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] })
    app.on('error', (error) => {
      appError = error
    })
    for (const stream of [app.stdout, app.stderr]) {
      stream.setEncoding('utf8')
      stream.on('data', (chunk) => {
        logs = (logs + chunk).slice(-12000)
      })
    }
    const port = await waitFor(
      'Electron DevTools',
      () => {
        if (appError) throw appError
        if (app.exitCode !== null) throw new Error('Electron exited with code ' + app.exitCode)
        return logs.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1]
      },
      35000
    )
    await verify(port, config, sockets)
  } catch (error) {
    console.error(logs.trim())
    throw error
  } finally {
    for (const socket of sockets) socket.terminate()
    if (app && app.exitCode === null && app.signalCode === null) {
      const exit = new Promise((resolve) => app.once('close', resolve))
      app.kill()
      const timer = setTimeout(() => app.kill('SIGKILL'), 3000)
      await exit
      clearTimeout(timer)
    }
    for (const socket of mockConnections) socket.destroy()
    mock.close()
    await rm(profile, { recursive: true, force: true, maxRetries: 3 })
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
