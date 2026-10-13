const fs = require('fs')
const path = require('path')

/**
 * 打包后将 VC++ 运行库 DLL 复制到每个原生模块所在目录（应用本地部署）
 *
 * 原生模块(.node)由 Node 通过 LoadLibraryEx(LOAD_WITH_ALTERED_SEARCH_PATH) 加载，
 * 其依赖的 DLL 会优先从 .node 文件所在目录查找，因此放在同目录即可优先使用自带的运行库，
 * 不再依赖、也不会修改用户系统中已安装的 VC++ 运行库版本
 *
 * DLL 来源：build/vcredist/*.dll（由 CI 从 Visual Studio 的 Microsoft.VC143.CRT 目录复制）
 */
module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return

  const dllDir = path.join(__dirname, 'vcredist')
  const dllList = fs.existsSync(dllDir)
    ? fs.readdirSync(dllDir).filter((name) => name.toLowerCase().endsWith('.dll'))
    : []
  if (dllList.length === 0) {
    console.warn('  • afterPack: build/vcredist 下没有 DLL，跳过 VC++ 运行库内置')
    return
  }

  const unpackedDir = path.join(context.appOutDir, 'resources', 'app.asar.unpacked')
  // 需要运行库的目录：包含 .node 原生模块 或 .exe 插件的目录
  const targetDirSet = new Set()
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (/\.(node|exe)$/i.test(entry.name)) {
        targetDirSet.add(dir)
      }
    }
  }
  walk(unpackedDir)

  for (const targetDir of targetDirSet) {
    for (const dll of dllList) {
      const target = path.join(targetDir, dll)
      // 模块自身已带有同名 DLL 时不覆盖
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(dllDir, dll), target)
      }
    }
    console.log(`  • afterPack: 内置 VC++ 运行库 -> ${path.relative(context.appOutDir, targetDir)}`)
  }
}
