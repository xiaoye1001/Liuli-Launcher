#!/usr/bin/env node
/**
 * 更新签名：用 Ed25519 私钥给每个版本的安装包清单（文件名、大小、SHA-256）签名。
 * 启动器内置公钥，从官网检查更新时验证签名，官网服务器被入侵也无法让启动器安装被替换的安装包。
 *
 *   node scripts/update-signing.mjs keygen
 *     生成一对密钥：私钥填到仓库 Secret UPDATE_SIGNING_KEY，公钥填到仓库变量 UPDATE_PUBLIC_KEY
 *
 *   node scripts/update-signing.mjs sign <安装包文件夹> <版本号>
 *     （GitHub Actions 中运行）读取环境变量 UPDATE_SIGNING_KEY / UPDATE_PUBLIC_KEY，
 *     生成 <安装包文件夹>/LiuliLauncher-<版本号>-signature.json
 *
 *   node scripts/update-signing.mjs verify <签名文件> <公钥>
 *     检查签名文件（测试用）
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/** 需要签名的 5 个安装包 */
const installerNames = (v) => [
  `LiuliLauncher-Setup-${v}.exe`,
  `LiuliLauncher-Portable-${v}.exe`,
  `LiuliLauncher-${v}-arm64.dmg`,
  `LiuliLauncher-${v}-x64.dmg`,
  `LiuliLauncher-${v}.AppImage`
]

function fail(message) {
  console.error(`错误：${message}`)
  process.exit(1)
}

function privateKeyOf(base64) {
  const key = createPrivateKey({ key: Buffer.from(base64.trim(), 'base64'), format: 'der', type: 'pkcs8' })
  if (key.asymmetricKeyType !== 'ed25519') fail('UPDATE_SIGNING_KEY 不是 Ed25519 私钥')
  return key
}

function publicKeyOf(base64) {
  const key = createPublicKey({ key: Buffer.from(base64.trim(), 'base64'), format: 'der', type: 'spki' })
  if (key.asymmetricKeyType !== 'ed25519') fail('UPDATE_PUBLIC_KEY 不是 Ed25519 公钥')
  return key
}

async function sha256Of(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function keygen() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const priv = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')
  const pub = publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  console.log('私钥（只填到仓库 Secret：UPDATE_SIGNING_KEY，不要发给任何人、不要提交到代码里）：')
  console.log(priv)
  console.log('')
  console.log('公钥（填到仓库变量：UPDATE_PUBLIC_KEY）：')
  console.log(pub)
}

async function signRelease(dir, version) {
  if (!/^\d+(\.\d+)*$/.test(version ?? '')) fail(`版本号格式不对：${version}`)
  const secret = process.env.UPDATE_SIGNING_KEY?.trim() ?? ''
  const pub = process.env.UPDATE_PUBLIC_KEY?.trim() ?? ''
  if (!secret) {
    // 打包时内置了公钥，启动器就会要求官网的版本信息必须有签名：这时不能发布没有签名的版本
    if (pub) fail('设置了 UPDATE_PUBLIC_KEY 但没有设置 UPDATE_SIGNING_KEY，无法签名')
    console.log('没有设置 UPDATE_SIGNING_KEY，跳过更新签名')
    return
  }
  if (!pub) fail('设置了 UPDATE_SIGNING_KEY 但没有设置 UPDATE_PUBLIC_KEY，启动器无法验证签名')
  const privateKey = privateKeyOf(secret)
  const publicKey = publicKeyOf(pub)
  // 私钥和公钥必须是一对，否则发布出去的版本所有人都无法更新
  if (
    createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64') !==
    publicKey.export({ format: 'der', type: 'spki' }).toString('base64')
  ) {
    fail('UPDATE_SIGNING_KEY 和 UPDATE_PUBLIC_KEY 不是同一对密钥')
  }

  const names = await readdir(dir)
  const files = []
  for (const name of installerNames(version)) {
    if (!names.includes(name)) fail(`找不到安装包 ${name}`)
    const path = join(dir, name)
    files.push({ name, size: (await stat(path)).size, sha256: await sha256Of(path) })
  }
  files.sort((a, b) => (a.name < b.name ? -1 : 1))

  const payload = JSON.stringify({ product: 'liuli-launcher', version, files })
  const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64')
  if (!verify(null, Buffer.from(payload, 'utf8'), publicKey, Buffer.from(signature, 'base64'))) fail('签名自检失败')
  const out = join(dir, `LiuliLauncher-${version}-signature.json`)
  await writeFile(out, JSON.stringify({ payload, signature }, null, 2) + '\n')
  console.log(`已生成 ${out}`)
  for (const f of files) console.log(`  ${f.name}  ${f.size}  ${f.sha256}`)
}

async function verifyFile(file, pub) {
  const { payload, signature } = JSON.parse(await readFile(file, 'utf8'))
  const ok = verify(null, Buffer.from(payload, 'utf8'), publicKeyOf(pub), Buffer.from(signature, 'base64'))
  if (!ok) fail('签名无效')
  console.log('签名有效')
  console.log(JSON.stringify(JSON.parse(payload), null, 2))
}

const [command, ...args] = process.argv.slice(2)
if (command === 'keygen') keygen()
else if (command === 'sign') await signRelease(args[0], args[1])
else if (command === 'verify') await verifyFile(args[0], args[1])
else fail('用法：keygen | sign <文件夹> <版本号> | verify <签名文件> <公钥>')
