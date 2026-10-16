/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主题色变量：深色模式下 white = 白色、black = 黑色；
        // 浅色模式下 white = 深色文字、black = 白色，现有的 text-white / bg-black/20 等类名会自动适配
        white: 'rgb(var(--c-ink) / <alpha-value>)',
        black: 'rgb(var(--c-shade) / <alpha-value>)'
      }
    }
  },
  plugins: []
}
