# 琉璃启动器插件

插件是一个 `.zip` 文件，在「更多 → 插件 → 插件管理」里安装，也可以直接把 zip 拖进启动器窗口。安装时会列出插件申请的权限，同意后才装上；装好的插件在「插件」分类里各有一张卡片。

插件运行在隔离的沙箱里：它的页面在一个独立来源的 iframe 中，碰不到启动器的页面、账号、登录令牌、密钥和电脑上的文件，不能直接联网，只能通过下面列出的接口做事。

完整的例子见 [plugin-example](plugin-example/)（版本便签：列出版本、记便签、一键启动）。[plugin-selftest](plugin-selftest/)（插件自检）把所有接口和沙箱限制挨个试一遍，装上它可以确认插件系统是不是正常。把整个文件夹里的文件压缩成 zip 就能安装。

## manifest.json

```json
{
  "id": "version-notes",
  "name": "版本便签",
  "version": "1.0.0",
  "description": "给每个游戏版本记一句便签，一键启动",
  "author": "你的名字",
  "entry": "index.html",
  "permissions": ["versions", "launch"],
  "hosts": [],
  "widget": { "entry": "widget.html", "height": 120 }
}
```

| 字段 | 说明 |
|---|---|
| `id` | 小写字母、数字和 `-`，3～40 个字符；同一个 id 再装一次就是更新（插件的数据保留） |
| `name` | 显示的名字，最多 40 个字 |
| `version` | 版本号，例如 `1.0.0` |
| `description`、`author` | 可选 |
| `entry` | 入口页面，默认 `index.html` |
| `permissions` | 需要的权限，见下表 |
| `hosts` | 申请了 `network` 时可以访问的网站（只写域名，例如 `api.example.com`，最多 20 个） |
| `widget` | 可选，主页小组件：`entry` 是插件里的另一个 .html 页面，`height` 是一开始的高度（48～320 像素） |

zip 里只能有网页、脚本、样式、图片、字体、音频和文字文件，最多 500 个文件、解压后 30 MB。

## 权限

| 权限 | 能做什么 |
|---|---|
| `versions` | 读取已安装的游戏版本列表 |
| `launch` | 启动某个游戏版本 |
| `game` | 读取游戏是否在运行；游戏状态变化时收到通知 |
| `notifications` | 弹系统通知 |
| `network` | 访问 `hosts` 里写明的 https 网站 |
| `clipboard` | 把文字复制到剪贴板 |
| `open-url` | 用系统浏览器打开 https 网页 |
| `mods` | 读取某个版本的模组列表 |
| `worlds` | 读取某个版本的存档列表 |
| `screenshots` | 读取某个版本的截图列表和缩略图 |
| `servers` | 读取收藏的服务器 |

不申请任何权限也能用：显示自己的页面、保存自己的数据。读取类的接口都不会返回电脑上的文件路径；`versionId` 必须是已经安装的版本。

## 调用接口

插件页面用 `postMessage` 和启动器通信。例子里的 `liuli.js` 把它包装成了 Promise：

```js
const versions = await liuli.call('versions.list')
await liuli.call('storage.set', { key: 'notes', value: { a: 1 } })
liuli.on('game.status', (status) => console.log(status.state))
```

也可以自己发消息：`window.parent.postMessage({ liuli: 1, id, method, params }, '*')`，回复是 `{ liuli: 1, id, result }` 或 `{ liuli: 1, id, error }`。

| 接口 | 权限 | 参数 | 返回 |
|---|---|---|---|
| `launcher.info` | 无 | 无 | `{ version, language, plugin: { id, version } }` |
| `storage.get` / `storage.set` / `storage.delete` / `storage.keys` | 无 | `{ key, value }` | 插件自己的数据，最多 1 MB |
| `ui.resize` | 无 | `{ height }` | 设置插件页面的高度（120～4000） |
| `ui.toast` | 无 | `{ text }` | 在插件页面下方显示一句提示 |
| `versions.list` | `versions` | 无 | `[{ id, minecraftVersion, loader }]` |
| `game.status` | `game` | 无 | `{ state, versionId }` |
| `game.launch` | `launch` | `{ versionId }` | 启动游戏 |
| `notify` | `notifications` | `{ title, body }` | 弹系统通知（标题前面会加插件名） |
| `net.fetch` | `network` | `{ url, method, headers, body }` | `{ status, ok, contentType, text }`；只能访问 `hosts` 里的 https 网站，不跟随跳转，回复最多 2 MB |
| `clipboard.writeText` | `clipboard` | `{ text }` | 复制文字 |
| `open.url` | `open-url` | `{ url }` | 用浏览器打开 https 网页 |
| `mods.list` | `mods` | `{ versionId }` | `{ minecraftVersion, loader, mods: [{ fileName, name, zhName, modId, version, enabled, kind }] }` |
| `worlds.list` | `worlds` | `{ versionId }` | `[{ folder, name, gameMode, hardcore, version, lastPlayed }]` |
| `screenshots.list` | `screenshots` | `{ versionId, limit }` | `[{ fileName, time, size }]`，最新的在前，默认 100 张、最多 500 张 |
| `screenshots.thumbnail` | `screenshots` | `{ versionId, fileName, width }` | JPEG 缩略图的 data URL（宽 32～1024，默认 320），可以直接放进 `<img src>` |
| `servers.list` | `servers` | 无 | `[{ name, address, versionId }]` |

有 `game` 权限时，游戏状态变化会收到事件 `{ liuli: 1, event: 'game.status', data: { state, versionId } }`。

## 主页小组件

在 manifest 里写了 `widget`，插件装好后会在主页上显示一张小卡片（`widget.entry` 那个页面）。小组件和插件页面一样运行在沙箱里，能用同样的接口和权限，也会收到游戏状态事件。

- 用 `ui.resize` 调整高度，范围是 48～320 像素。按内容高度设置时用 `document.body.getBoundingClientRect().height`（`document.documentElement.scrollHeight` 至少是当前高度，只会变高不会变矮）
- 卡片右上角可以打开插件的完整页面，或者不在主页显示；在插件管理里勾选「主页小组件」可以再显示出来
- 小组件在主页上的位置可以在「设置 → 个性化 → 导航栏、主页与布局」里和最近游玩、新闻、欢迎卡片一起排

例子里的 `widget.html` 显示写了便签的版本和「启动」按钮。

## 深色和浅色主题

启动器切换深色 / 浅色主题时，插件页面里的 `prefers-color-scheme` 会跟着变。用 CSS 变量写两套颜色，插件就能和启动器的主题保持一致（例子里的 `style.css` 就是这样写的）：

```css
:root {
  color-scheme: light dark;
  --text: #e5e7eb;
}
@media (prefers-color-scheme: light) {
  :root {
    --text: #1f2937;
  }
}
body {
  color: var(--text);
  background: transparent;
}
```

## 限制

- 页面只能加载插件自己的文件（可以用内联脚本和样式），不能直接联网、不能嵌入别的网页、不能提交表单，也不能跳转到别的网站
- 不能弹 `alert` / `confirm`，不能打开新窗口；需要提示时用 `ui.toast`
- 不能使用浏览器的剪贴板、摄像头等权限，需要时用对应的接口
- 拖进插件页面的文件不会交给插件（拖放由启动器处理：安装插件、导入整合包）
