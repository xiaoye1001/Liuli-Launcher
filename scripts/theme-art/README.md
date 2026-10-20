# 精选主题素材的生成脚本

`resources/themes` 里的壁纸和背景音乐都是用这里的脚本生成的原创作品，不使用任何游戏或他人的素材。

## 壁纸（2560×1440）

用 three.js 渲染程序生成的方块风景：地形、像素纹理、天空、光影和后期效果都在代码里。

```bash
cd scripts/theme-art
npm pack three@0.169.0 && tar xzf three-0.169.0.tgz && mv package three
node run.cjs plains cherry aurora_night nether the_end   # 输出 out-<名字>.png
```

需要能运行 WebGL 的 Chromium（Playwright 自带的即可）。

## 背景音乐

用 Python + NumPy 合成的钢琴氛围曲：旋律、和声按音阶规则生成，音色、混响也是代码合成的，首尾可以无缝循环。

```bash
python3 music.py <输出目录>   # 输出 <名字>.wav，再用 ffmpeg 转成 Opus：
ffmpeg -i plains.wav -c:a libopus -b:a 96k plains.ogg
```

## 放进启动器

- 壁纸：`convert out-plains.png -quality 90 resources/themes/plains.webp`，缩略图（480×270）放在 `src/renderer/src/assets/themes`
- 音乐：`resources/themes/<名字>.ogg`
- 主题的名称、配色等在 `src/shared/builtinThemes.ts`
