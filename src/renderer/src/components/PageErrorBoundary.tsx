import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 切换页面时清除错误 */
  resetKey: string
}

interface State {
  error: Error | null
}

/** 单个页面出错时只在页面里显示错误，侧边栏等其他部分照常可用（否则整个窗口会变成空白） */
class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('页面出错：', error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="text-lg font-semibold">这个页面出错了</div>
        <div className="max-w-lg break-all text-sm text-white/50">{error.message}</div>
        <button
          onClick={() => this.setState({ error: null })}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm transition-colors hover:bg-white/20"
        >
          重试
        </button>
      </div>
    )
  }
}

export default PageErrorBoundary
