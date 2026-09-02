import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

/**
 * Modal reutilizável de Autorização de Gerente — popup enxuto que pede o PIN
 * do Gerente (4 dígitos) para liberar uma ação restrita (estorno/cancelamento
 * de venda, desconto acima de 10%, sangria de caixa, ajuste manual de
 * estoque). Não é renderizado diretamente pelas telas: elas chamam
 * `useManagerAuth().requestAuthorization(...)` (ver ManagerAuthContext), que
 * controla esta modal, valida o PIN contra `settings.adminPin` e grava a
 * auditoria em `autorizacoes_gerente` antes de liberar a ação — tudo em um
 * único popup, sem deslogar o operador do caixa.
 */
export default function ModalAutorizacaoGerente({
  open,
  title = 'Autorização do Gerente',
  description = 'Digite o PIN do Supervisor (4 dígitos) para autorizar esta ação.',
  detailLabel,
  requireMotivo = false,
  motivoLabel = 'Motivo',
  motivoPlaceholder = 'Descreva o motivo desta autorização…',
  initialMotivo = '',
  confirmLabel = 'Autorizar',
  busy = false,
  onCancel,
  onSubmit,
}) {
  const [pin, setPin] = useState('')
  const [motivo, setMotivo] = useState(initialMotivo)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setPin('')
      setMotivo(initialMotivo)
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const trimmedMotivo = motivo.trim()
  const canSubmit = pin.length === 4 && (!requireMotivo || trimmedMotivo.length > 0) && !busy

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    const ok = await onSubmit?.(pin, trimmedMotivo)
    if (!ok) {
      setError('PIN incorreto')
      setPin('')
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <ShieldCheck size={22} />
          </span>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
          {detailLabel && <p className="text-xs font-semibold text-slate-700">{detailLabel}</p>}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="manager-auth-pin" className="text-xs font-medium uppercase tracking-wide text-slate-500">
              PIN do Supervisor
            </label>
            <input
              id="manager-auth-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(event) => {
                setError('')
                setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
              }}
              placeholder="••••"
              className={clsx(
                'mt-1 w-full rounded-lg border-2 bg-slate-50 px-3 py-3 text-center text-2xl font-black tracking-[0.6em] text-slate-800 outline-none',
                error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-amber-500',
              )}
            />
          </div>

          {requireMotivo && (
            <div>
              <label htmlFor="manager-auth-motivo" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {motivoLabel}
              </label>
              <textarea
                id="manager-auth-motivo"
                rows={2}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder={motivoPlaceholder}
                className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
          )}

          {error && (
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle size={13} />
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? 'Autorizando…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
