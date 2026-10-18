# 官网部署（宝塔面板）

官网是纯静态网页（`website/` 文件夹），不需要 PHP、数据库。
服务器上的脚本 `update_site.py` 会定时检查 GitHub 上的新版本：

- 把 5 个安装包下载到网站的 `downloads/` 文件夹（用 GitHub 提供的 SHA-256 校验，校验不通过不会替换）
- 用新版本附带的网页（`LiuliLauncher-website.zip`）更新网站
- 写入 `downloads/latest.json`，网页据此显示版本号和下载按钮；旧版本的安装包会被删除

所以以后发布新版本，网站会自动跟着更新，不需要手动上传任何东西。
服务器只需要能访问 GitHub，不需要把服务器密码或密钥交给 GitHub。

服务器空间：每个版本的安装包合计约 550 MB（只保留最新版本）。

---

## 1. 添加站点

宝塔面板 →「网站」→「添加站点」：

- **域名**：填你的域名（例如 `mc.example.com`）
- **根目录**：保持默认，例如 `/www/wwwroot/mc.example.com`
- **PHP 版本**：选「纯静态」
- 不需要数据库、FTP

> 一定要用新建的空站点。脚本只会在空的新站点（或之前由它管理的目录）里工作，
> 目录里有别的网站文件时会拒绝运行，避免误删。

## 2. 开启 HTTPS

站点「设置」→「SSL」→「Let's Encrypt」→ 勾选域名 →「申请」，然后打开「强制 HTTPS」。

域名需要先解析到服务器 IP（在域名服务商那里添加 A 记录）。

## 3. 上传更新脚本

把 `update_site.py`（每个 Release 里都附带，也就是仓库里的 `deploy/update_site.py`）上传到服务器，例如放在 `/www/liuli/update_site.py`：

- 宝塔「文件」→ 新建文件夹 `/www/liuli` → 上传 `update_site.py`
- 或者在终端运行：

  ```bash
  mkdir -p /www/liuli
  curl -L -o /www/liuli/update_site.py https://github.com/xiaoye1001/Liuli-Launcher/releases/latest/download/update_site.py
  ```

  连不上 GitHub 时在地址前面加上加速前缀，例如 `https://ghfast.top/https://github.com/...`。

## 4. 第一次运行

> v0.2.7 及更早的版本还没有附带网页。在下一个版本发布之前，先手动放一次网页：
> 把 `LiuliLauncher-website.zip` 上传到站点根目录，在宝塔「文件」里右键「解压」（覆盖同名文件），
> 之后脚本会接管这个目录，以后的版本自动更新网页。


宝塔「终端」（或 SSH）里运行，把路径换成你的站点根目录：

```bash
python3 /www/liuli/update_site.py --site /www/wwwroot/mc.example.com
```

看到「更新完成：v0.x.x」就好了，打开你的域名就能看到官网。

**服务器在国内、连 GitHub 很慢或失败时**，加上下载加速前缀：

```bash
python3 /www/liuli/update_site.py --site /www/wwwroot/mc.example.com --proxy https://ghfast.top/
```

（加速服务是第三方提供的，可能失效，换一个可用的即可。下载的文件都会校验 SHA-256，加速服务无法篡改。）

## 5. 定时自动更新

宝塔「计划任务」→「添加任务」：

- **任务类型**：Shell 脚本
- **任务名称**：琉璃启动器官网更新
- **执行周期**：N 分钟，10 分钟
- **脚本内容**：

  ```bash
  python3 /www/liuli/update_site.py --site /www/wwwroot/mc.example.com
  ```

  （需要加速时同样在后面加 `--proxy https://ghfast.top/`）

没有新版本时脚本几秒就结束，不会重复下载。点任务右边的「日志」可以看每次的运行结果。

## 6. 推荐的 Nginx 设置（可选）

站点「设置」→「配置文件」，在 `server { ... }` 里加上：

```nginx
# 版本信息不缓存，发布新版本后立刻能看到
location = /downloads/latest.json {
    add_header Cache-Control "no-cache";
}

# 安装包按附件下载
location /downloads/ {
    add_header Content-Disposition "attachment";
    add_header X-Content-Type-Options "nosniff";
}

# 网页图片缓存一天（样式和脚本的地址带内容指纹，更新后会自动重新下载）
location ~* \.(webp|png|svg)$ {
    expires 1d;
}
```

保存后宝塔会自动重载 Nginx。

---

## 常见问题

**网页显示「暂时无法获取最新版本」**
`downloads/latest.json` 还没有生成：确认第 4 步运行成功。脚本没跑成功时，网页会自动改为显示 GitHub 的下载链接。

**提示「网站目录里已经有其他文件」**
`--site` 填的目录不是新建的空站点。换成新站点的根目录（宝塔新建站点时自动生成的 `index.html`、`404.html`、`.user.ini` 不影响）。

**网页更新后，有的地方没有样式、或者一直显示「正在获取」**
浏览器还在用旧的样式和脚本。用更新脚本更新网页时会自动处理（给样式和脚本加内容指纹）；
手动上传网页后，运行一次更新脚本（加 `--force`），或者在浏览器里按 Ctrl + F5 强制刷新。

**想重新下载一遍**
加 `--force` 参数运行一次。

**换域名 / 换目录**
新建站点后，把计划任务里的 `--site` 改成新目录，再手动运行一次。
