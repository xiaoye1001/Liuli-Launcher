#!/usr/bin/env python3
"""
琉璃启动器官网更新脚本：在服务器上定时运行（例如宝塔「计划任务」每 10 分钟一次）。

做的事情：
  1. 查询 GitHub 上的最新版本
  2. 有新版本时，下载 5 个安装包到网站的 downloads/ 文件夹，并用 GitHub 提供的 SHA-256 校验
  3. 下载新版本附带的网页（LiuliLauncher-website.zip），更新网站文件
  4. 写入 downloads/latest.json（网页据此显示版本号和下载按钮），删除旧版本的安装包
     发布时附带了更新签名（LiuliLauncher-<版本>-signature.json）的话一起写入，启动器用它确认安装包没被替换

用法：
  python3 update_site.py --site /www/wwwroot/你的域名
  python3 update_site.py --site /www/wwwroot/你的域名 --proxy https://ghfast.top/   # 服务器连 GitHub 很慢时使用加速前缀
  python3 update_site.py --site /www/wwwroot/你的域名 --force                      # 不管版本号，重新下载一遍

只依赖 Python 3.6+ 标准库。
"""

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile

REPO = 'xiaoye1001/Liuli-Launcher'
# 测试时可以用环境变量 LIULI_RELEASE_API 指向别的地址
API = os.environ.get('LIULI_RELEASE_API') or 'https://api.github.com/repos/%s/releases/latest' % REPO
WEBSITE_ASSET = 'LiuliLauncher-website.zip'
# 只下载这些安装包（与网页上的下载按钮对应）
INSTALLER = re.compile(r'^LiuliLauncher-(Setup-[\d.]+\.exe|Portable-[\d.]+\.exe|[\d.]+-(arm64|x64)\.dmg|[\d.]+\.AppImage)$')
SAFE_NAME = re.compile(r'^[\w.+-]+$')
# 一个版本必须齐全的 5 个安装包：没有全部上传完成（例如发布还在进行中）时不切换版本
EXPECTED = [
    re.compile(r'^LiuliLauncher-Setup-[\d.]+\.exe$'),
    re.compile(r'^LiuliLauncher-Portable-[\d.]+\.exe$'),
    re.compile(r'^LiuliLauncher-[\d.]+-arm64\.dmg$'),
    re.compile(r'^LiuliLauncher-[\d.]+-x64\.dmg$'),
    re.compile(r'^LiuliLauncher-[\d.]+\.AppImage$'),
]
SHA256 = re.compile(r'^[0-9a-f]{64}$')
# 更新签名文件（GitHub Actions 用私钥生成，见 scripts/update-signing.mjs）
SIGNATURE_ASSET = 'LiuliLauncher-%s-signature.json'
# 清理时认作旧安装包或临时文件的名字（包括浏览器重复下载产生的「(1)」、下载中断留下的 .part）
OLD_FILE = re.compile(r'^LiuliLauncher-.*\.(exe|dmg|AppImage|blockmap)(\.part)?$|\.part$|^\.website\.zip$', re.I)
USER_AGENT = 'LiuliLauncher-site-updater'
# 网站文件夹里不能被网页覆盖或删除的东西（宝塔的配置文件、证书验证目录、安装包）
KEEP = {'downloads', '.user.ini', '.well-known', '.htaccess', '404.html', '.liuli-site'}
# 宝塔新建站点时自动生成的文件：目录里只有这些时，可以放心地放入网页
PANEL_DEFAULTS = KEEP | {'index.html', 'index.htm', 'index.php', 'default.html'}
# 标记文件：表示这个目录由本脚本管理，之后更新时可以替换里面的文件
MARKER = '.liuli-site'


def log(message):
    print('[%s] %s' % (time.strftime('%Y-%m-%d %H:%M:%S'), message), flush=True)


def request(url, proxy='', timeout=30):
    full = proxy + url if proxy and url.startswith('https://github.com/') else url
    req = urllib.request.Request(full, headers={'User-Agent': USER_AGENT, 'Accept': 'application/vnd.github+json'})
    return urllib.request.urlopen(req, timeout=timeout)


def asset_sha256(asset):
    """GitHub 为文件提供的 SHA-256（digest 字段，形如 sha256:xxxx），没有或格式不对时返回空字符串"""
    value = str(asset.get('digest') or '').lower()
    value = value[len('sha256:'):] if value.startswith('sha256:') else ''
    return value if SHA256.match(value) else ''


def download(url, dest, sha256, proxy, retries=3):
    """下载到临时文件，校验通过后再移动到目标位置；校验失败或中断都不会留下坏文件"""
    if not SHA256.match(sha256 or ''):
        # 没有校验值就无法确认文件没被加速镜像或中间人替换，不下载
        raise ValueError('%s 没有 SHA-256 校验值，拒绝下载' % os.path.basename(dest))
    last_error = None
    for attempt in range(1, retries + 1):
        tmp = dest + '.part'
        try:
            digest = hashlib.sha256()
            with request(url, proxy, timeout=60) as res, open(tmp, 'wb') as out:
                while True:
                    chunk = res.read(1024 * 256)
                    if not chunk:
                        break
                    digest.update(chunk)
                    out.write(chunk)
            if digest.hexdigest() != sha256:
                raise ValueError('SHA-256 不一致（下载的文件不完整或被篡改）')
            os.replace(tmp, dest)
            return
        except Exception as e:  # noqa: BLE001
            last_error = e
            log('  第 %d 次下载失败：%s' % (attempt, e))
            if os.path.exists(tmp):
                os.remove(tmp)
            time.sleep(3 * attempt)
    raise RuntimeError('下载失败：%s（%s）' % (os.path.basename(dest), last_error))


def load_signature(asset, version, files, downloads, proxy):
    """下载更新签名，确认签名内容与刚下载的安装包一致，返回写进 latest.json 的内容；有问题时抛出异常

    服务器上没有公钥也不需要验证签名本身（启动器会验证），这里只防止发布出错时把对不上的签名放到网站上
    """
    tmp = os.path.join(downloads, '.signature.json')
    try:
        download(asset['browser_download_url'], tmp, asset_sha256(asset), proxy)
        if os.path.getsize(tmp) > 256 * 1024:
            raise ValueError('签名文件太大')
        with open(tmp, encoding='utf-8') as f:
            data = json.load(f)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    payload, signature = data.get('payload'), data.get('signature')
    if not isinstance(payload, str) or not isinstance(signature, str):
        raise ValueError('签名文件格式不对')
    signed = json.loads(payload)
    if signed.get('product') != 'liuli-launcher' or signed.get('version') != version:
        raise ValueError('签名文件的版本号与 v%s 不一致' % version)
    expect = sorted((f['name'], f['size'], f['sha256']) for f in files)
    actual = sorted((f.get('name'), f.get('size'), f.get('sha256')) for f in signed.get('files', []))
    if expect != actual:
        raise ValueError('签名文件里的安装包与下载的安装包对不上')
    return {'payload': payload, 'signature': signature}


def safe_extract(zip_path, target):
    """解压网页，拒绝 ../ 等指向文件夹外面的路径"""
    root = os.path.realpath(target)
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            path = os.path.realpath(os.path.join(root, info.filename))
            if path != root and not path.startswith(root + os.sep):
                raise ValueError('网页压缩包里有不安全的路径：%s' % info.filename)
        z.extractall(root)


def add_cache_busting(site_dir):
    """给网页引用的样式和脚本加上内容指纹（style.css?v=xxxx）。
    宝塔默认让浏览器缓存 js / css 12 小时，不加指纹的话网页更新后浏览器还在用旧文件"""
    index = os.path.join(site_dir, 'index.html')
    with open(index, encoding='utf-8') as f:
        html = f.read()

    def fingerprint(match):
        path = os.path.join(site_dir, match.group(1))
        if not os.path.isfile(path):
            return match.group(0)
        with open(path, 'rb') as f:
            digest = hashlib.sha256(f.read()).hexdigest()[:10]
        return '%s?v=%s' % (match.group(1), digest)

    html = re.sub(r'(assets/[\w.-]+\.(?:css|js))(?:\?v=[\w-]*)?', fingerprint, html)
    with open(index, 'w', encoding='utf-8') as f:
        f.write(html)


def update_website(zip_path, site):
    """用新网页替换网站文件（保留 downloads/ 和宝塔的配置文件）"""
    tmp = tempfile.mkdtemp(prefix='liuli-site-')
    try:
        safe_extract(zip_path, tmp)
        if not os.path.isfile(os.path.join(tmp, 'index.html')):
            raise ValueError('网页压缩包里没有 index.html')
        add_cache_busting(tmp)
        # 删掉旧网页里新版本已经没有的文件
        for name in os.listdir(site):
            if name in KEEP or os.path.exists(os.path.join(tmp, name)):
                continue
            path = os.path.join(site, name)
            if os.path.isdir(path) and not os.path.islink(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
        for name in os.listdir(tmp):
            if name in KEEP:
                continue
            src = os.path.join(tmp, name)
            dst = os.path.join(site, name)
            if os.path.isdir(dst) and not os.path.islink(dst):
                shutil.rmtree(dst)
            elif os.path.exists(dst):
                os.remove(dst)
            shutil.move(src, dst)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def is_our_site(site):
    """目录里是不是手动上传的官网文件（有官网的首页和脚本）"""
    try:
        with open(os.path.join(site, 'index.html'), encoding='utf-8') as f:
            return 'Liuli Launcher' in f.read() and os.path.isfile(os.path.join(site, 'assets', 'main.js'))
    except (OSError, UnicodeDecodeError):
        return False


def clean_downloads(downloads, keep_names):
    """删除 downloads/ 里不属于当前版本的安装包和临时文件，返回删除的数量"""
    keep = set(keep_names) | {'latest.json', '.update.lock'}
    removed = 0
    for name in sorted(os.listdir(downloads)):
        path = os.path.join(downloads, name)
        if name in keep or not os.path.isfile(path) or not OLD_FILE.search(name):
            continue
        try:
            os.remove(path)
            removed += 1
            log('  删除旧文件 %s' % name)
        except OSError as e:
            log('  无法删除 %s：%s' % (name, e))
    return removed


def current_files(latest_path):
    """latest.json 里记录的当前版本文件名"""
    try:
        with open(latest_path, encoding='utf-8') as f:
            return [x.get('name', '') for x in json.load(f).get('files', [])]
    except (OSError, ValueError, AttributeError):
        return None


def main():
    parser = argparse.ArgumentParser(description='更新琉璃启动器官网与安装包')
    parser.add_argument('--site', required=True, help='网站根目录，例如 /www/wwwroot/example.com')
    parser.add_argument('--proxy', default='', help='GitHub 下载加速前缀，例如 https://ghfast.top/（可选）')
    parser.add_argument('--force', action='store_true', help='忽略已有版本，重新下载')
    args = parser.parse_args()

    site = os.path.realpath(args.site)
    if not os.path.isdir(site):
        log('网站目录不存在：%s' % site)
        return 1
    # 防止填错目录把别的文件删掉：只在新建的空站点，或之前由本脚本管理的目录里工作
    if not os.path.exists(os.path.join(site, MARKER)):
        others = [n for n in os.listdir(site) if n not in PANEL_DEFAULTS]
        if others and is_our_site(site):
            others = []  # 手动上传过官网文件，可以接管
        if others:
            log('网站目录里已经有其他文件（%s 等），为了避免误删，请换一个新建的空站点目录' % '、'.join(others[:3]))
            return 1
        open(os.path.join(site, MARKER), 'w').close()
    downloads = os.path.join(site, 'downloads')
    os.makedirs(downloads, exist_ok=True)
    proxy = args.proxy.strip()
    if proxy and not proxy.endswith('/'):
        proxy += '/'

    # 防止上一次还没下载完时又开始一次
    lock = open(os.path.join(downloads, '.update.lock'), 'w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log('上一次更新还在进行，这次跳过')
        return 0

    with request(API, timeout=20) as res:
        release = json.loads(res.read().decode('utf-8'))
    version = str(release.get('tag_name', '')).lstrip('vV')
    if not re.match(r'^\d+(\.\d+)*$', version):
        log('无法识别的版本号：%r' % version)
        return 1

    latest_path = os.path.join(downloads, 'latest.json')
    current = {}
    if os.path.exists(latest_path):
        try:
            with open(latest_path, encoding='utf-8') as f:
                current = json.load(f)
        except ValueError:
            current = {}

    assets = [a for a in release.get('assets', []) if SAFE_NAME.match(a.get('name', ''))]
    installers = [a for a in assets if INSTALLER.match(a['name'])]
    # 5 个安装包都上传完成、并且都有 SHA-256 才更新；否则保持当前版本，下次再检查
    for pattern in EXPECTED:
        matched = [a for a in installers if pattern.match(a['name'])]
        if len(matched) != 1 or matched[0].get('state', 'uploaded') != 'uploaded' or not asset_sha256(matched[0]):
            log('v%s 的安装包还没有全部上传完成（或缺少 SHA-256 校验值），暂不更新' % version)
            return 0
    website = next((a for a in assets if a['name'] == WEBSITE_ASSET), None)
    signature_asset = next((a for a in assets if a['name'] == SIGNATURE_ASSET % version), None)
    complete = all(os.path.isfile(os.path.join(downloads, a['name'])) for a in installers)
    # 之前的 latest.json 还没有签名（例如刚升级这个脚本）时也要更新一次
    if signature_asset and not current.get('signed'):
        complete = False
    # 手动上传的网页也加上内容指纹（不会重复修改）
    if is_our_site(site):
        add_cache_busting(site)

    if not args.force and current.get('version') == version and complete:
        log('已经是最新版本 v%s，不需要更新' % version)
        # 之前没清理干净的旧版本（例如上次更新中途被中断）在这里补上
        names = current_files(latest_path)
        if names:
            clean_downloads(downloads, names)
        return 0

    log('开始更新到 v%s' % version)
    files = []
    for asset in installers:
        name = asset['name']
        sha256 = asset_sha256(asset)
        dest = os.path.join(downloads, name)
        if os.path.isfile(dest) and not args.force:
            with open(dest, 'rb') as f:
                h = hashlib.sha256()
                for chunk in iter(lambda: f.read(1024 * 1024), b''):
                    h.update(chunk)
            if h.hexdigest() == sha256:
                log('  已有 %s' % name)
                files.append({'name': name, 'size': asset.get('size', 0), 'sha256': sha256})
                continue
        log('  下载 %s（%.1f MB）' % (name, asset.get('size', 0) / 1024 / 1024))
        download(asset['browser_download_url'], dest, sha256, proxy)
        files.append({'name': name, 'size': asset.get('size', 0), 'sha256': sha256})

    signed = None
    if signature_asset:
        signed = load_signature(signature_asset, version, files, downloads, proxy)
        log('  已加入更新签名')
    else:
        log('  这个版本没有更新签名（启动器内置了公钥时会改用 GitHub 更新）')

    if website and not asset_sha256(website):
        log('  附带的网页没有 SHA-256 校验值，跳过网页更新')
    elif website:
        log('  更新网页')
        zip_path = os.path.join(downloads, '.website.zip')
        sha256 = asset_sha256(website)
        download(website['browser_download_url'], zip_path, sha256, proxy)
        try:
            update_website(zip_path, site)
        finally:
            os.remove(zip_path)
    else:
        log('  这个版本没有附带网页，只更新安装包')

    # 先写好新的 latest.json，再删除旧版本的安装包，网页上的链接始终有效
    tmp = latest_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(
            {
                'version': version,
                'publishedAt': release.get('published_at', ''),
                # 更新说明（Markdown），网页的「最新更新」显示这里的内容
                'notes': str(release.get('body') or '')[:20000],
                'files': files,
                # 启动器验证的数字签名：只有签名里的版本号和 SHA-256 会被启动器采用
                **({'signed': signed} if signed else {}),
                'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    os.replace(tmp, latest_path)

    clean_downloads(downloads, [f['name'] for f in files])
    log('更新完成：v%s' % version)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001
        log('更新失败：%s' % e)
        sys.exit(1)
