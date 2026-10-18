/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // font-sans 也跟随设置里选择的界面字体
      fontFamily: {
        sans: [
          'var(--app-font, "Segoe UI")',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'system-ui',
          'sans-serif'
        ]
      },
      colors: {
        // 主题色变量：深色模式下 white = 白色、black = 黑色；
        // 浅色模式下 white = 深色文字、black = 白色，现有的 text-white / bg-black/20 等类名会自动适配
        white: 'rgb(var(--c-ink) / <alpha-value>)',
        black: 'rgb(var(--c-shade) / <alpha-value>)',
        // 主题色：界面中的 emerald（主色）与 cyan（渐变副色）都指向 CSS 变量，
        // 在设置里切换主题色时只需修改 <html data-accent> 即可全局生效
        emerald: {
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)'
        },
        cyan: {
          400: 'rgb(var(--accent2-400) / <alpha-value>)',
          500: 'rgb(var(--accent2-500) / <alpha-value>)'
        }
      }
    }
  },
  plugins: []
}
