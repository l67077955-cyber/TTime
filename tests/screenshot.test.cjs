const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/preload/screenshot.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true
  }
}).outputText

// A small canvas double keeps coordinates in the pixel data so the test checks
// the selected content as well as the size handed to both IPC consumers.
function setup({
  imageWidth = 800,
  imageHeight = 600,
  viewportWidth = 400,
  viewportHeight = 300,
  loaded = true
} = {}) {
  const handlers = new Map()
  const mouse = new Map()
  const invocations = []
  let image
  const pixel = (x, y) => [x % 256, y % 256, (x + y) % 256, 255]

  class Canvas {
    constructor() {
      this.width = 0
      this.height = 0
      this.style = {}
      this.context = {
        drawImage: (source) => {
          if (source instanceof Image) this.original = source
        },
        getImageData: (x, y, width, height) => {
          assert.ok(this.original, 'original screenshot must be drawn before cropping')
          const data = new Uint8ClampedArray(width * height * 4)
          for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++)
              data.set(pixel(x + col, y + row), (row * width + col) * 4)
          }
          return { width, height, data }
        },
        createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
        putImageData: (imageData) => {
          this.output = imageData.data
        },
        fillRect() {},
        strokeRect() {}
      }
    }
    getContext() {
      return this.context
    }
    toDataURL() {
      return JSON.stringify({
        width: this.width,
        height: this.height,
        pixels: Array.from(this.output)
      })
    }
  }
  class Image {
    constructor() {
      this.naturalWidth = imageWidth
      this.naturalHeight = imageHeight
      this.complete = loaded
      image = this
    }
  }
  const rect = new Canvas()
  const elements = { '.bg': {}, '.rect': rect, '.size-info': { style: {} } }
  const document = {
    getElementById: () => ({}),
    querySelector: (selector) => elements[selector],
    createElement: () => new Canvas(),
    addEventListener: (type, handler) => mouse.set(type, handler)
  }
  const ipcRenderer = {
    on: (name, handler) => handlers.set(name, handler),
    invoke: (...args) => invocations.push(args)
  }
  const requireMock = (id) => {
    if (id === 'electron') return { contextBridge: { exposeInMainWorld() {} }, nativeImage: {} }
    if (id === '@electron-toolkit/preload') return { electronAPI: { ipcRenderer } }
    return { default: {} }
  }
  vm.runInNewContext(compiled, {
    require: requireMock,
    exports: {},
    document,
    window: { innerWidth: viewportWidth, innerHeight: viewportHeight },
    Image,
    Uint8ClampedArray,
    process: { contextIsolated: true }
  })
  handlers.get('win-draw-screenshot-style')(
    {},
    { screenId: 'test', screenImgUrl: 'image', width: viewportWidth, height: viewportHeight }
  )
  return {
    invocations,
    pixel,
    finishLoading: () => image.onload(),
    move: (type, x, y) => mouse.get(type)({ pageX: x, pageY: y }),
    drag: (x1, y1, x2, y2) => {
      mouse.get('mousedown')({ pageX: x1, pageY: y1 })
      mouse.get('mousemove')({ pageX: x2, pageY: y2 })
      mouse.get('mouseup')()
    }
  }
}

for (const scenario of [
  {
    name: '100% scale',
    options: { imageWidth: 400, imageHeight: 300 },
    drag: [50, 40, 150, 100],
    crop: [50, 40, 100, 60]
  },
  { name: '200% scale', options: {}, drag: [50, 40, 150, 100], crop: [100, 80, 200, 120] },
  {
    name: 'fractional and unequal scales',
    options: { imageWidth: 500, imageHeight: 450 },
    drag: [11, 13, 51, 33],
    crop: [14, 20, 50, 30]
  },
  { name: 'reverse drag', options: {}, drag: [150, 100, 50, 40], crop: [100, 80, 200, 120] },
  {
    name: 'selection clipped at image edge',
    options: {},
    drag: [390, 290, 410, 310],
    crop: [780, 580, 20, 20]
  }
]) {
  test(`preserves screenshot pixels: ${scenario.name}`, async () => {
    const app = setup(scenario.options)
    await Promise.resolve()
    app.drag(...scenario.drag)
    const ocr = app.invocations.find(([name]) => name === 'handle-image-text-recognition-event')
    const output = app.invocations.find(([name]) => name === 'screenshot-end-event')
    assert.ok(ocr)
    assert.ok(output)
    assert.equal(ocr[1], output[1])
    const image = JSON.parse(output[1])
    const [x, y, width, height] = scenario.crop
    assert.equal(image.width, width)
    assert.equal(image.height, height)
    assert.deepEqual(image.pixels.slice(0, 4), app.pixel(x, y))
    assert.deepEqual(image.pixels.slice(-4), app.pixel(x + width - 1, y + height - 1))
  })
}

test('does not submit an empty selection or a selection before the image loads', async () => {
  const app = setup({ loaded: false })
  app.drag(10, 10, 20, 20)
  app.finishLoading()
  await Promise.resolve()
  app.drag(10, 10, 10, 10)
  assert.equal(app.invocations.filter(([name]) => name === 'screenshot-end-event').length, 0)
  app.drag(10, 10, 20, 20)
  assert.equal(app.invocations.filter(([name]) => name === 'screenshot-end-event').length, 1)
})

test('does not reuse a previous crop when a drag returns to zero width', async () => {
  const app = setup()
  await Promise.resolve()
  app.move('mousedown', 10, 10)
  app.move('mousemove', 20, 20)
  app.move('mousemove', 10, 20)
  app.move('mouseup', 10, 20)
  assert.equal(app.invocations.filter(([name]) => name === 'screenshot-end-event').length, 0)
})
