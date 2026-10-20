const { chromium } = require('playwright')
const fs = require('fs')
const { execSync, spawn } = require('child_process')
const DIR = __dirname
;(async () => {
  const names = process.argv.slice(2)
  const server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1'], { cwd: DIR, stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 800))
  const b = await chromium.launch({
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
  })
  try {
    const p = await b.newPage()
    p.on('console', (m) => console.log('[page]', m.text()))
    p.on('pageerror', (e) => console.log('[error]', e.message))
    await p.goto('http://127.0.0.1:8765/index.html')
    await p.waitForFunction(() => window.ready, null, { timeout: 30000 })
    for (const name of names) {
      const t0 = Date.now()
      const url = await p.evaluate((n) => window.renderScene(n, { pixelRatio: 1.5 }), name)
      fs.writeFileSync(`${DIR}/out-${name}-raw.png`, Buffer.from(url.split(',')[1], 'base64'))
      execSync(`convert ${DIR}/out-${name}-raw.png -filter Lanczos -resize 2560x1440 ${DIR}/out-${name}.png`)
      execSync(`convert ${DIR}/out-${name}.png -resize 1280x720 ${DIR}/prev-${name}.png`)
      console.log(name, 'done in', Date.now() - t0, 'ms')
      await p.reload()
      await p.waitForFunction(() => window.ready)
    }
  } finally {
    await b.close()
    server.kill()
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
