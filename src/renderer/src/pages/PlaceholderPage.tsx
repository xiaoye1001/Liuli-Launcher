import type { LucideIcon } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  icon: LucideIcon
}

function PlaceholderPage({ title, icon: Icon }: PlaceholderPageProps): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-[360px] flex-col items-center rounded-2xl border border-white/10 bg-white/10 p-10 text-center shadow-2xl backdrop-blur-xl">
        <Icon className="h-12 w-12 text-white/70" />
        <h2 className="mt-4 text-2xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-white/50">该功能将在后续阶段实现</p>
      </div>
    </div>
  )
}

export default PlaceholderPage
