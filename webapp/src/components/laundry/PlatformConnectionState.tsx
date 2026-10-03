import type { ReactNode } from 'react'
import VisualEmptyState from '@/components/laundry/VisualEmptyState'

type PlatformConnectionStateProps = {
  pageTitle: string
  pageDescription: string
  stateTitle: string
  stateDetail: string
  action?: ReactNode
}

export default function PlatformConnectionState({ pageTitle, pageDescription, stateTitle, stateDetail, action }: PlatformConnectionStateProps) {
  return <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
    <header className="max-w-3xl">
      <p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-[#664cf0]">Business controls · platform</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em] text-[#21183d]">{pageTitle}</h1>
      <p className="mt-2 text-sm leading-6 text-[#6d6680]">{pageDescription}</p>
    </header>
    <section className="mt-5 rounded-[22px] border border-[#272043]/10 bg-white px-5 shadow-[0_8px_28px_rgba(37,48,43,.04)]" aria-label={pageTitle}>
      <VisualEmptyState kind="orders" title={stateTitle} detail={stateDetail} action={action} />
    </section>
  </div>
}
