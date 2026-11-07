// 琉璃启动器插件的小工具：把 postMessage 包装成 Promise
//   const versions = await liuli.call('versions.list')
//   liuli.on('game.status', (status) => { ... })
window.liuli = (() => {
  let next = 0
  const waiting = new Map()
  const listeners = {}
  window.addEventListener('message', (e) => {
    const d = e.data
    if (e.source !== window.parent || !d || d.liuli !== 1) return
    if (d.event) {
      for (const f of listeners[d.event] || []) f(d.data)
      return
    }
    const w = waiting.get(d.id)
    if (!w) return
    waiting.delete(d.id)
    if (d.error) w.reject(new Error(d.error))
    else w.resolve(d.result)
  })
  return {
    call(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++next
        waiting.set(id, { resolve, reject })
        window.parent.postMessage({ liuli: 1, id, method, params }, '*')
      })
    },
    on(event, listener) {
      ;(listeners[event] = listeners[event] || []).push(listener)
    }
  }
})()
