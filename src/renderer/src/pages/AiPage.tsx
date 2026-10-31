import { Lightbulb } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import AiSettings from '../components/AiSettings'

const STEPS = [
  '选择服务商，填写你自己在服务商那里申请的 API Key 和模型，点「测试连接」确认可以使用',
  '游戏崩溃或启动失败时，主页的崩溃提示里会自动开始分析，回答会逐字显示，可以随时停止或重新分析',
  '不想自动分析时关闭「崩溃后自动分析」，之后在崩溃提示里手动点「分析原因」'
]

/** AI 助手页：设置服务商、API Key 和模型，以及使用说明 */
function AiPage(): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="AI 助手" subtitle="用 AI 分析游戏崩溃和启动失败的原因，并给出解决方法" />

      <div className="page-scroll flex min-h-0 flex-1 flex-col gap-6 pb-4">
        <AiSettings />

        <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-5 w-5 text-amber-300" />
            <h2 className="text-lg font-semibold">怎么用</h2>
          </div>
          <ol className="mt-4 space-y-2.5">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm text-white/75">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-200">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

export default AiPage
