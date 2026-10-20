// 打包前把 electron-builder 自带的免安装版外壳脚本换成 build/portable.nsi（electron-builder.cjs 加载时调用）。
//
// electron-builder 没有提供自定义免安装版脚本的选项，只能替换它的模板文件。
// 为了不在 electron-builder 升级后悄悄用上不匹配的脚本：只替换内容与已检查过的原版完全一致的模板，
// 原版模板变了就报错，需要对照新模板检查 build/portable.nsi 后更新下面的 SHA-256。

const { createHash } = require('crypto')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

/** 已检查过的 electron-builder 原版 portable.nsi（app-builder-lib 26.x）的 SHA-256 */
const ORIGINAL_SHA256 = '80fa75cf8cb68f4999eb92afc9f37f8e5b605cb1c3a077821bbc350a9b907a48'

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function installPortableTemplate() {
  const target = join(require.resolve('app-builder-lib/package.json'), '..', 'templates', 'nsis', 'portable.nsi')
  const custom = readFileSync(join(__dirname, '..', 'build', 'portable.nsi'), 'utf8')
  const current = readFileSync(target, 'utf8')
  if (current === custom) return
  // 已经替换过、但 build/portable.nsi 之后又改过：直接换成最新的（自己的模板第一行是固定的说明）
  const ownHeader = custom.split('\n', 1)[0]
  const replacedBefore = current.split('\n', 1)[0] === ownHeader
  if (!replacedBefore && sha256(current) !== ORIGINAL_SHA256) {
    throw new Error(
      `electron-builder 的免安装版模板（${target}）和检查过的版本不同，请对照它检查 build/portable.nsi，` +
        '然后更新 scripts/portable-template.cjs 里的 ORIGINAL_SHA256'
    )
  }
  writeFileSync(target, custom, 'utf8')
}

module.exports = { installPortableTemplate }
