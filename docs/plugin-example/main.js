// 版本便签：列出已安装的版本，每个版本可以记一句便签（保存在插件自己的存储里），点「启动」启动游戏
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
  for (const v of versions) {
    const li = document.createElement('li')
    const name = document.createElement('b')
    name.textContent = v.id
    name.title = `Minecraft ${v.minecraftVersion}${v.loader ? ' · ' + v.loader : ''}`
    const input = document.createElement('input')
    input.placeholder = '写一句便签'
    input.value = saved[v.id] || ''
    input.addEventListener('change', async () => {
      saved[v.id] = input.value
      await liuli.call('storage.set', { key: 'notes', value: saved })
      liuli.call('ui.toast', { text: '已保存' })
    })
    const launch = document.createElement('button')
    launch.textContent = '启动'
    launch.addEventListener('click', () =>
      liuli.call('game.launch', { versionId: v.id }).catch((e) => liuli.call('ui.toast', { text: e.message }))
    )
    li.append(name, input, launch)
    list.append(li)
  }
  liuli.call('ui.resize', { height: document.body.scrollHeight + 16 })
}

function showStatus(s) {
  document.getElementById('status').textContent =
    s.state === 'running'
      ? `正在玩 ${s.versionId}`
      : s.state === 'launching'
        ? `正在启动 ${s.versionId}`
        : '游戏没有运行'
}

liuli.on('game.status', (s) => {
  showStatus(s)
  if (s.state === 'exited') liuli.call('notify', { title: '游戏结束了', body: `${s.versionId} 已退出` })
})

render().catch((e) => {
  document.getElementById('status').textContent = '出错了：' + e.message
})
