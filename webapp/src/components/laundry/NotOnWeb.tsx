import { Link } from 'react-router-dom'

/** Shown on the website build for desktop-only screens that have no equivalent on the LNDRY backend. */
export default function NotOnWeb({ title, reason }: { title: string; reason: string }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-[#263f44]/10 bg-white p-8 text-center shadow-[0_8px_28px_rgba(32,23,60,.04)]">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#664cf0]">Not part of the website</p>
      <h1 className="mt-2 font-serif text-2xl text-[#241a45]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[#617178]">{reason}</p>
      <Link to="/laundry/dashboard" className="mt-6 inline-flex min-h-10 items-center rounded-xl bg-[#664cf0] px-5 text-sm font-bold text-white hover:bg-[#5740cb]">Back to dashboard</Link>
    </div>
  )
}
