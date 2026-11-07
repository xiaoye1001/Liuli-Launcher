// 版本便签的主页小组件：显示写了便签的版本（最多 4 个），点「启动」直接玩
async function render() {
  const [versions, notes, status] = await Promise.all([
    liuli.call('versions.list'),
    liuli.call('storage.get', { key: 'notes' }),
    liuli.call('game.status')
  ])
  const saved = notes || {}
  showStatus(status)
  const list = document.getElementById('list')
  list.textContent = ''
  const noted = versions.filter((v) => saved[v.id]).slice(0, 4)
  if (noted.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = '还没有便签：点右上角打开插件，给版本写一句'
    list.append(li)
  }
  for (const v of noted) {
    const li = document.createElement('li')
    const name = document.createElement('b')
    name.textContent = v.id
    const note = document.createElement('span')
    note.className = 'note'
    note.textContent = saved[v.id]
    const launch = document.createElement('button')
    launch.textContent = '启动'
    launch.addEventListener('click', () =>
      liuli.call('game.launch', { versionId: v.id }).catch((e) => liuli.call('ui.toast', { text: e.message }))
    )
    li.append(name, note, launch)
    list.append(li)
  }
  resize()
}

// 用 body 的高度（documentElement.scrollHeight 至少是当前窗口的高度，只会变高不会变矮）
function resize() {
  liuli.call('ui.resize', { height: Math.ceil(document.body.getBoundingClientRect().height) })
}

// 游戏没在运行时不显示状态（标题栏已经有插件名）
function showStatus(s) {
  const el = document.getElementById('status')
  el.textContent =
    s.state === 'running' ? `正在玩 ${s.versionId}` : s.state === 'launching' ? `正在启动 ${s.versionId}` : ''
  el.hidden = !el.textContent
  resize()
}

liuli.on('game.status', showStatus)
render().catch((e) => {
  document.getElementById('status').textContent = '出错了：' + e.message
})
