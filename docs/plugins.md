# 琉璃启动器插件

插件是一个 `.zip` 文件，在「更多 → 插件 → 插件管理」里安装。安装时会列出插件申请的权限，同意后才装上；装好的插件在「插件」分类里各有一张卡片。

插件运行在隔离的沙箱里：它的页面在一个独立来源的 iframe 中，碰不到启动器的页面、账号、登录令牌、密钥和电脑上的文件，不能直接联网，只能通过下面列出的接口做事。

完整的例子见 [plugin-example](plugin-example/)（版本便签：列出版本、记便签、一键启动）。把整个文件夹压缩成 zip 就能安装。

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
  "hosts": []
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

不申请任何权限也能用：显示自己的页面、保存自己的数据。

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

有 `game` 权限时，游戏状态变化会收到事件 `{ liuli: 1, event: 'game.status', data: { state, versionId } }`。

## 限制

- 页面只能加载插件自己的文件（可以用内联脚本和样式），不能直接联网、不能嵌入别的网页、不能提交表单，也不能跳转到别的网站
- 不能弹 `alert` / `confirm`，不能打开新窗口；需要提示时用 `ui.toast`
- 不能使用浏览器的剪贴板、摄像头等权限，需要时用对应的接口
