// 插件自检：把插件接口和沙箱限制挨个试一遍
// 每一项检查是一个 async 函数：正常返回一句说明就算通过，抛出错误就算没通过

/** 这个调用应该被启动器拒绝；拒绝了就通过，返回拒绝的原因 */
async function refused(method, params, words) {
  try {
    await liuli.call(method, params)
  } catch (e) {
    if (words && !e.message.includes(words)) throw new Error(`被拒绝了，但原因不对：${e.message}`)
    return `已拒绝：${e.message}`
  }
  throw new Error('居然成功了，应该被拒绝')
}

/** 这个操作应该做不到（抛错）；做不到就通过 */
function blocked(action) {
  try {
    const result = action()
    if (result === undefined || result === null || result === '') return '读不到（空的）'
  } catch (e) {
    return `做不到：${e.name || e.message}`
  }
  throw new Error('居然做到了')
}

// 读取版本列表时记下来，后面的检查用第一个版本
const state = { versions: [] }
function firstVersion() {
  if (!state.versions.length) throw new Error('还没有安装版本，没法检查')
  return state.versions[0].id
}
function showThumbnail(url) {
  const img = document.getElementById('thumb')
  img.src = url
  img.hidden = false
}

const CHECKS = [
  {
    name: '启动器信息',
    run: async () => {
      const info = await liuli.call('launcher.info')
      if (info.plugin.id !== 'plugin-selftest') throw new Error('插件 id 不对')
      return `启动器 v${info.version}，插件 v${info.plugin.version}`
    }
  },
  {
    name: '保存和读取自己的数据',
    run: async () => {
      const value = { n: Math.random(), text: '中文也行' }
      await liuli.call('storage.set', { key: 'selftest', value })
      const back = await liuli.call('storage.get', { key: 'selftest' })
      if (JSON.stringify(back) !== JSON.stringify(value)) throw new Error('读回来的内容不一样')
      const keys = await liuli.call('storage.keys')
      if (!keys.includes('selftest')) throw new Error('列表里没有刚存的数据')
      await liuli.call('storage.delete', { key: 'selftest' })
      if ((await liuli.call('storage.get', { key: 'selftest' })) !== null) throw new Error('删除后还在')
      return '存、读、列出、删除都正常'
    }
  },
  {
    name: '数据超过 1 MB 会被拒绝',
    run: () => refused('storage.set', { key: 'big', value: 'x'.repeat(1100 * 1024) }, '1 MB')
  },
  {
    name: '读取版本列表',
    run: async () => {
      const versions = await liuli.call('versions.list')
      if (!Array.isArray(versions)) throw new Error('返回的不是列表')
      state.versions = versions
      fillVersions(versions)
      return versions.length ? `${versions.length} 个版本：${versions.map((v) => v.id).join('、')}` : '还没有安装版本'
    }
  },
  {
    name: '读取模组列表',
    run: async () => {
      const v = firstVersion()
      const list = await liuli.call('mods.list', { versionId: v })
      const on = list.mods.filter((m) => m.enabled).length
      return `${v}：${list.mods.length} 个模组（${on} 个启用）${list.loader ? '，' + list.loader : ''}`
    }
  },
  {
    name: '读取存档列表',
    run: async () => {
      const v = firstVersion()
      const worlds = await liuli.call('worlds.list', { versionId: v })
      return `${v}：${worlds.length} 个存档${worlds.length ? '：' + worlds.map((w) => w.name).join('、') : ''}`
    }
  },
  {
    name: '查看截图和缩略图',
    run: async () => {
      for (const v of state.versions) {
        const shots = await liuli.call('screenshots.list', { versionId: v.id, limit: 5 })
        if (!shots.length) continue
        const url = await liuli.call('screenshots.thumbnail', {
          versionId: v.id,
          fileName: shots[0].fileName,
          width: 160
        })
        if (!url.startsWith('data:image/jpeg;base64,')) throw new Error('缩略图格式不对')
        showThumbnail(url)
        return `${v.id}：最新一张 ${shots[0].fileName}，缩略图 ${Math.round((url.length * 3) / 4 / 1024)} KB`
      }
      return '所有版本都还没有截图'
    }
  },
  {
    name: '读取收藏的服务器',
    run: async () => {
      const servers = await liuli.call('servers.list')
      return servers.length ? `${servers.length} 个：${servers.map((s) => s.name).join('、')}` : '还没有收藏服务器'
    }
  },
  {
    name: '不能读不存在的版本',
    run: () => refused('mods.list', { versionId: '../../' }, '没有这个版本')
  },
  {
    name: '不能读截图文件夹外的文件',
    run: () => refused('screenshots.thumbnail', { versionId: firstVersion(), fileName: '../options.txt' })
  },
  {
    name: '读取游戏状态',
    run: async () => {
      const s = await liuli.call('game.status')
      return s.versionId ? `${s.state}（${s.versionId}）` : s.state
    }
  },
  {
    name: '联网（声明过的 api.github.com）',
    run: async () => {
      const r = await liuli.call('net.fetch', {
        url: 'https://api.github.com/repos/xiaoye1001/Liuli-Launcher/releases/latest',
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!r.ok) throw new Error(`GitHub 回复了 ${r.status}`)
      return `启动器最新发布：${JSON.parse(r.text).tag_name}`
    }
  },
  {
    name: '不能访问没声明的网站',
    run: () => refused('net.fetch', { url: 'https://example.com/' }, '没有声明')
  },
  {
    name: '不能用 http 联网',
    run: () => refused('net.fetch', { url: 'http://api.github.com/' }, 'https')
  },
  {
    name: '不能打开非 https 链接',
    run: () => refused('open.url', { url: 'file:///C:/Windows/System32/' }, 'https')
  },
  {
    name: '不能启动不存在的版本',
    run: () => refused('game.launch', { versionId: '__no_such_version__' }, '没有这个版本')
  },
  {
    name: '没有的接口会被拒绝',
    run: () => refused('fs.readFile', { path: 'C:/' }, '没有这个接口')
  },
  {
    name: '沙箱：碰不到启动器页面',
    run: async () => blocked(() => window.parent.document.title)
  },
  {
    name: '沙箱：拿不到启动器内部接口',
    run: async () => blocked(() => window.parent.api)
  },
  {
    name: '沙箱：读不到浏览器存储',
    run: async () => blocked(() => window.localStorage.length)
  },
  {
    name: '沙箱：读不到 Cookie',
    run: async () => blocked(() => document.cookie)
  },
  {
    name: '沙箱：不能直接联网',
    run: async () => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))
      const result = await Promise.race([
        fetch('https://api.github.com/').then(
          () => 'ok',
          () => 'blocked'
        ),
        timeout
      ])
      if (result === 'ok') throw new Error('居然连上了')
      return result === 'blocked' ? '被拦住了' : '没有连上（超时）'
    }
  },
  {
    name: '沙箱：不能弹出新窗口',
    run: async () => {
      const w = window.open('https://example.com/')
      if (w) {
        w.close()
        throw new Error('居然打开了')
      }
      return '打不开'
    }
  }
]

const list = document.getElementById('checks')
const summary = document.getElementById('summary')
const runButton = document.getElementById('run')

async function runAll() {
  runButton.disabled = true
  summary.className = ''
  summary.textContent = '检查中…'
  list.textContent = ''
  let passed = 0
  for (const check of CHECKS) {
    const li = document.createElement('li')
    li.className = 'wait'
    const mark = document.createElement('span')
    mark.className = 'mark'
    mark.textContent = '…'
    const name = document.createElement('span')
    name.textContent = check.name
    const detail = document.createElement('span')
    detail.className = 'detail'
    li.append(mark, name, detail)
    list.append(li)
    try {
      detail.textContent = await check.run()
      li.className = 'pass'
      mark.textContent = '✓'
      passed++
    } catch (e) {
      detail.textContent = e.message
      li.className = 'fail'
      mark.textContent = '✗'
    }
    detail.title = detail.textContent
  }
  const all = passed === CHECKS.length
  summary.className = all ? 'ok' : 'bad'
  summary.textContent = all ? `全部通过（${passed} 项）` : `通过 ${passed} / ${CHECKS.length} 项`
  runButton.disabled = false
}

function fillVersions(versions) {
  const select = document.getElementById('version')
  const current = select.value
  select.textContent = ''
  for (const v of versions) {
    const option = document.createElement('option')
    option.value = v.id
    option.textContent = v.id
    select.append(option)
  }
  if (versions.some((v) => v.id === current)) select.value = current
  document.querySelector('[data-action="launch"]').disabled = versions.length === 0
}

// 手动操作：会真的产生效果，所以要点了才做
const manual = document.getElementById('manual')
const ACTIONS = {
  notify: () => liuli.call('notify', { title: '自检', body: '系统通知正常' }).then(() => '已发送通知'),
  clipboard: () =>
    liuli
      .call('clipboard.writeText', { text: `琉璃启动器插件自检：剪贴板正常 ${new Date().toLocaleString()}` })
      .then(() => '已复制，可以粘贴到别处看看'),
  open: () =>
    liuli.call('open.url', { url: 'https://github.com/xiaoye1001/Liuli-Launcher' }).then(() => '已在浏览器打开'),
  launch: () => {
    const versionId = document.getElementById('version').value
    return liuli.call('game.launch', { versionId }).then(() => `已开始启动 ${versionId}`)
  }
}
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      manual.textContent = await ACTIONS[button.dataset.action]()
    } catch (e) {
      manual.textContent = '出错了：' + e.message
    } finally {
      button.disabled = false
    }
    liuli.call('ui.toast', { text: manual.textContent })
  })
}

// 游戏状态事件：启动、运行、退出时启动器会推送过来
const events = document.getElementById('events')
liuli.on('game.status', (s) => {
  if (events.firstElementChild && events.firstElementChild.classList.contains('hint')) events.textContent = ''
  const li = document.createElement('li')
  li.textContent = `${new Date().toLocaleTimeString()}  ${s.state}${s.versionId ? '  ' + s.versionId : ''}`
  events.prepend(li)
  while (events.children.length > 8) events.lastElementChild.remove()
})

// 页面高度变化时告诉启动器，插件区域跟着变高变矮
new ResizeObserver(() => liuli.call('ui.resize', { height: document.documentElement.scrollHeight + 4 })).observe(
  document.body
)

runButton.addEventListener('click', () => void runAll())
void runAll()
