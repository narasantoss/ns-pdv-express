import clsx from 'clsx'

export default function HeaderLogo({
  className,
  name = 'NS SISTEMAS',
  tagline = 'PDV Express',
  logoUrl = null,
} = {}) {
  return (
    <div className={clsx('flex items-center gap-3', className)}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`Logo ${name}`}
          className="h-10 w-10 shrink-0 rounded-lg object-contain ring-1 ring-inset ring-slate-200"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 via-slate-800 to-slate-950 shadow-lg shadow-slate-950/50 ring-1 ring-inset ring-white/10">
          <span className="font-mono text-base font-bold leading-none text-blue-400">
            {'<>'}
          </span>
        </div>
      )}

      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-bold tracking-tight text-slate-900">
          {name}
        </p>
        <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {tagline}
        </p>
      </div>
    </div>
  )
}
