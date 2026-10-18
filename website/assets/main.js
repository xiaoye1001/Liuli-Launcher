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
      shotImage.classList.add('fading')
      setTimeout(function () {
        shotImage.src = 'images/' + key + '.webp'
        shotImage.alt = tab.textContent + '截图'
        shotCaption.textContent = SHOTS[key] || ''
      }, 180)
    })
  })

  shotImage.addEventListener('load', function () {
    shotImage.classList.remove('fading')
  })

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ---------- 滚动出现 ----------
  var revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return
              entry.target.classList.add('visible')
              revealObserver.unobserve(entry.target)
              var counter = entry.target.querySelector('[data-count]')
              if (counter) countUp(counter)
            })
          },
          { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
        )
      : null

  function reveal(node) {
    if (revealObserver) revealObserver.observe(node)
    else node.classList.add('visible')
  }
  Array.prototype.forEach.call(document.querySelectorAll('.reveal'), reveal)

  /** 数字从 0 滚动到目标值 */
  function countUp(node) {
    var target = Number(node.getAttribute('data-count')) || 0
    if (reduceMotion || target <= 0) return
    var start = null
    var duration = 1200
    function step(time) {
      if (start === null) start = time
      var t = Math.min(1, (time - start) / duration)
      var eased = 1 - Math.pow(1 - t, 3)
      node.textContent = String(Math.round(target * eased))
      if (t < 1) requestAnimationFrame(step)
    }
    node.textContent = '0'
    requestAnimationFrame(step)
  }

  // ---------- 支持列表无限滚动：复制一份接在后面 ----------
  var track = document.querySelector('.marquee-track')
  if (track) {
    Array.prototype.slice.call(track.children).forEach(function (item) {
      var copy = item.cloneNode(true)
      copy.setAttribute('aria-hidden', 'true')
      track.appendChild(copy)
    })
  }

  // ---------- 首屏截图随鼠标倾斜 ----------
  var tilt = document.getElementById('hero-tilt')
  if (tilt && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    var area = tilt.parentElement
    area.addEventListener('mousemove', function (e) {
      var rect = area.getBoundingClientRect()
      var x = (e.clientX - rect.left) / rect.width - 0.5
      var y = (e.clientY - rect.top) / rect.height - 0.5
      tilt.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg')
      tilt.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg')
    })
    area.addEventListener('mouseleave', function () {
      tilt.style.setProperty('--ry', '0deg')
      tilt.style.setProperty('--rx', '0deg')
    })
  }

  // ---------- 导航阴影、回到顶部 ----------
  var nav = document.querySelector('.nav')
  var toTop = document.getElementById('to-top')
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop
    nav.classList.toggle('scrolled', y > 8)
    toTop.classList.toggle('show', y > 600)
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  // ---------- GitHub 星标数 ----------
  fetch('https://api.github.com/repos/' + REPO)
    .then(function (res) {
      return res.ok ? res.json() : null
    })
    .then(function (repo) {
      var stars = repo && Number(repo.stargazers_count)
      if (stars > 0) document.querySelector('.nav-github').textContent = 'GitHub ★ ' + stars
    })
    .catch(function () {})

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
        return {
          version: data.version,
          publishedAt: data.publishedAt,
          notes: data.notes || '',
          files: data.files || [],
          local: true
        }
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
              notes: data.body || '',
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
      if (card.querySelector('.file')) {
        card.classList.add('reveal')
        card.style.setProperty('--i', String(box.children.length))
        box.appendChild(card)
        reveal(card)
      }
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

  /** 行内的 `代码` 显示为代码，**加粗** 去掉标记 */
  function appendInline(parent, text) {
    text.split(/(`[^`]+`)/).forEach(function (part) {
      if (/^`[^`]+`$/.test(part)) parent.appendChild(el('code', '', part.slice(1, -1)))
      else if (part) parent.appendChild(document.createTextNode(part.replace(/\*\*/g, '')))
    })
  }

  /** 显示更新说明：只取「下载」之前的部分，支持标题、列表和段落（全部按纯文本处理） */
  function renderNotes(release) {
    var body = document.getElementById('changelog-body')
    var title = document.getElementById('changelog-title')
    var date = formatDate(release.publishedAt)
    title.textContent = 'v' + release.version + (date ? ' · ' + date : '')
    var text = String(release.notes || '').split(/\n##\s*下载/)[0].replace(/^##\s*下载[\s\S]*$/, '')
    var list = null
    text.split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim()
      if (!line) {
        list = null
        return
      }
      var heading = /^#{1,4}\s+(.*)$/.exec(line)
      var item = /^[-*]\s+(.*)$/.exec(line)
      if (heading) {
        list = null
        body.appendChild(el('h3', '', heading[1].replace(/\*\*/g, '')))
      } else if (item) {
        if (!list) list = body.appendChild(el('ul'))
        var li = el('li')
        appendInline(li, item[1])
        list.appendChild(li)
      } else {
        list = null
        var p = el('p')
        appendInline(p, line)
        body.appendChild(p)
      }
    })
    if (!body.childNodes.length) body.appendChild(el('p', '', '这个版本没有填写更新说明。'))
  }

  var os = detectOs()
  loadRelease()
    .then(function (release) {
      if (!release.version) throw new Error('no version')
      render(release, os)
      renderNotes(release)
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
      document.getElementById('changelog-title').textContent = '暂时无法获取更新说明'
    })
})()
