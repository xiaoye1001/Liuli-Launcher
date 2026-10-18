// 琉璃启动器官网：截图切换、读取最新版本并生成下载按钮
;(function () {
  'use strict'

  var REPO = 'xiaoye1001/Liuli-Launcher'

  // ---------- 截图 ----------
  var SHOTS = {
    home: '主页：选择版本一键启动，最近游玩一目了然，还能换上自己喜欢的背景',
    download: '下载资源：同时搜索 Modrinth 和 CurseForge，自动安装前置模组',
    versions: '版本管理：收藏常玩的版本、换上喜欢的图标，多个游戏目录随时切换',
    mods: '模组管理：启用禁用、检查更新，自动发现缺少的前置和重复模组',
    worlds: '存档详情：种子、难度、游戏规则，备份与还原'
  }
  var tabs = document.querySelectorAll('.shot-tabs button')
  var shotImage = document.getElementById('shot-image')
  var shotCaption = document.getElementById('shot-caption')
  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-shot')
      Array.prototype.forEach.call(tabs, function (t) {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false')
      })
      shotImage.src = 'images/' + key + '.webp'
      shotImage.alt = tab.textContent + '截图'
      shotCaption.textContent = SHOTS[key] || ''
    })
  })

  // ---------- 提示 ----------
  var toastTimer
  function toast(text) {
    var el = document.querySelector('.toast')
    if (!el) {
      el = document.createElement('div')
      el.className = 'toast'
      document.body.appendChild(el)
    }
    el.textContent = text
    el.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () {
      el.classList.remove('show')
    }, 1600)
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () {
          toast('已复制 SHA-256')
        },
        function () {
          toast('复制失败，请手动选择')
        }
      )
      return
    }
    var area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    try {
      document.execCommand('copy')
      toast('已复制 SHA-256')
    } catch (e) {
      toast('复制失败，请手动选择')
    }
    document.body.removeChild(area)
  }

  // ---------- 下载 ----------
  /** 各平台的安装包：按文件名识别 */
  var PLATFORMS = [
    {
      key: 'windows',
      name: 'Windows',
      files: [
        { match: /Setup.*\.exe$/i, title: '安装版', desc: '安装到电脑，创建桌面与开始菜单快捷方式（推荐）' },
        { match: /Portable.*\.exe$/i, title: '免安装版', desc: '单个 exe，双击直接运行，数据放在 exe 旁边' }
      ]
    },
    {
      key: 'mac',
      name: 'macOS',
      files: [
        { match: /-arm64\.dmg$/i, title: 'Apple 芯片', desc: 'M1、M2、M3、M4 等' },
        { match: /-x64\.dmg$/i, title: 'Intel 芯片', desc: '较早的 Mac' }
      ]
    },
    {
      key: 'linux',
      name: 'Linux',
      files: [{ match: /\.AppImage$/i, title: 'AppImage', desc: '添加执行权限后直接运行' }]
    }
  ]

  var SAFE_NAME = /^[\w.+-]+$/

  function formatSize(bytes) {
    if (!bytes) return ''
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  function formatDate(value) {
    var d = new Date(value)
    if (isNaN(d.getTime())) return ''
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  function detectOs() {
    var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase()
    var ua = navigator.userAgent.toLowerCase()
    if (/android|iphone|ipad/.test(ua)) return 'mobile'
    if (p.indexOf('win') >= 0 || ua.indexOf('windows') >= 0) return 'windows'
    if (p.indexOf('mac') >= 0 || ua.indexOf('mac os') >= 0) return 'mac'
    if (p.indexOf('linux') >= 0 || ua.indexOf('linux') >= 0) return 'linux'
    return ''
  }

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  /** 先读本站的 downloads/latest.json（服务器上的安装包），读不到再查 GitHub */
  function loadRelease() {
    return fetch('downloads/latest.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('no local')
        return res.json()
      })
      .then(function (data) {
        return { version: data.version, publishedAt: data.publishedAt, files: data.files || [], local: true }
      })
      .catch(function () {
        return fetch('https://api.github.com/repos/' + REPO + '/releases/latest')
          .then(function (res) {
            if (!res.ok) throw new Error('github')
            return res.json()
          })
          .then(function (data) {
            return {
              version: String(data.tag_name || '').replace(/^v/i, ''),
              publishedAt: data.published_at,
              files: (data.assets || []).map(function (a) {
                return { name: a.name, size: a.size, sha256: String(a.digest || '').replace(/^sha256:/, '') }
              }),
              local: false
            }
          })
      })
  }

  function render(release, os) {
    var box = document.getElementById('downloads')
    box.textContent = ''
    var version = release.version
    var githubBase = 'https://github.com/' + REPO + '/releases/download/v' + encodeURIComponent(version) + '/'
    var primary = null

    PLATFORMS.forEach(function (platform) {
      var card = el('div', 'platform' + (platform.key === os ? ' recommended' : ''))
      var head = el('div', 'platform-head')
      head.appendChild(el('h3', '', platform.name))
      if (platform.key === os) head.appendChild(el('span', 'badge', '你的系统'))
      card.appendChild(head)

      platform.files.forEach(function (spec) {
        var file = release.files.filter(function (f) {
          return f && SAFE_NAME.test(f.name || '') && spec.match.test(f.name)
        })[0]
        if (!file) return
        var item = el('div', 'file')
        var title = el('div', 'file-title', spec.title)
        item.appendChild(title)
        item.appendChild(el('div', 'file-desc', spec.desc + (file.size ? ' · ' + formatSize(file.size) : '')))
        var actions = el('div', 'file-actions')
        var github = githubBase + encodeURIComponent(file.name)
        var main = el('a', 'btn btn-primary btn-small', release.local ? '下载' : '从 GitHub 下载')
        main.href = release.local ? 'downloads/' + encodeURIComponent(file.name) : github
        main.setAttribute('download', '')
        actions.appendChild(main)
        if (release.local) {
          var mirror = el('a', 'btn btn-ghost btn-small', 'GitHub 下载')
          mirror.href = github
          mirror.target = '_blank'
          mirror.rel = 'noopener'
          actions.appendChild(mirror)
        }
        item.appendChild(actions)
        if (/^[0-9a-f]{64}$/i.test(file.sha256 || '')) {
          var hash = el('button', 'hash', 'SHA-256：' + file.sha256)
          hash.type = 'button'
          hash.title = '点击复制'
          hash.addEventListener('click', function () {
            copy(file.sha256)
          })
          item.appendChild(hash)
        }
        card.appendChild(item)
        if (!primary && platform.key === os) primary = { href: main.href, label: '下载 ' + platform.name + ' 版' }
      })
      if (card.querySelector('.file')) box.appendChild(card)
    })

    var date = formatDate(release.publishedAt)
    document.getElementById('download-version').textContent =
      '最新版本 v' + version + (date ? ' · ' + date + ' 发布' : '')
    document.getElementById('hero-meta').textContent =
      'v' + version + (date ? ' · ' + date : '') + ' · 支持 Windows · macOS · Linux · 免费开源'

    // macOS 分不清芯片，首屏按钮只跳到下载区
    if (primary && os !== 'mac') {
      var button = document.getElementById('primary-download')
      button.href = primary.href
      button.setAttribute('download', '')
      document.getElementById('primary-label').textContent = primary.label + ' v' + version
    }
  }

  var os = detectOs()
  loadRelease()
    .then(function (release) {
      if (!release.version) throw new Error('no version')
      render(release, os)
    })
    .catch(function () {
      var box = document.getElementById('downloads')
      box.textContent = ''
      var msg = el('p', 'download-error', '暂时无法获取最新版本，请到 ')
      var link = el('a', '', 'GitHub Releases')
      link.href = 'https://github.com/' + REPO + '/releases/latest'
      link.target = '_blank'
      link.rel = 'noopener'
      msg.appendChild(link)
      msg.appendChild(document.createTextNode(' 下载。'))
      box.appendChild(msg)
      document.getElementById('download-version').textContent = ''
    })
})()
