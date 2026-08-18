import { useEffect, useState } from 'react'
import { ShieldCheck, CheckCircle2, AlertTriangle, Mail, KeyRound, Loader2, LifeBuoy, Copy, Check } from 'lucide-react'
import clsx from 'clsx'
import HeaderLogo from '../common/HeaderLogo'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { obterHwidMaquina, ativarSerial } from '../../services/licensing'

const SUPPORT_EMAIL = 'nssistemastech@gmail.com'

/**
 * Tela de Ativação de Licença (Etapa 5) — bloqueia o boot do app enquanto a
 * licença local não estiver ativa (ver `onActivated`, chamado por App.jsx).
 * O operador cola a Chave de Licença Serial recebida do suporte da NS
 * Sistemas num único campo; o HWID desta máquina (necessário só quando o
 * suporte ainda não gerou a chave) fica atrás do link discreto no rodapé,
 * fora da visão primária. A validação em si (assinatura RSA offline contra
 * o HWID) roda no comando Rust `ativar_serial` — ver src-tauri/src/licensing.rs.
 */
export default function TelaAtivacaoLicenca({ onActivated }) {
  const { settings } = useStoreSettings()
  const [serial, setSerial] = useState('')
  const [status, setStatus] = useState('idle') // idle | busy | success | error
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [showHwid, setShowHwid] = useState(false)
  const [hwid, setHwid] = useState(null)
  const [hwidError, setHwidError] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    obterHwidMaquina()
      .then((value) => {
        if (!cancelled) setHwid(value)
      })
      .catch((err) => {
        console.error('[licenca] Falha ao obter o HWID desta máquina:', err)
        if (!cancelled) setHwidError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function copyHwid() {
    if (!hwid) return
    navigator.clipboard
      .writeText(hwid)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      })
      .catch((err) => console.error('[licenca] Falha ao copiar o HWID:', err))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (status === 'busy' || !serial.trim()) return
    setStatus('busy')
    setError('')
    try {
      await ativarSerial(serial)
      setStatus('success')
      window.setTimeout(() => onActivated?.(), 900)
    } catch (err) {
      setStatus('error')
      setError(err?.message || 'Chave inválida. Verifique o código recebido na confirmação do seu pedido.')
      setShake(true)
    }
  }

  const busy = status === 'busy'
  const success = status === 'success'

  return (
    <div className="flex h-svh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <HeaderLogo
            name={settings.fantasyName.trim() || undefined}
            logoUrl={settings.logoDataUrl}
          />
          <div>
            <h1 className="flex items-center justify-center gap-2 text-base font-bold text-slate-900">
              <ShieldCheck size={17} className="text-blue-600" />
              Ativação de Licença
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Ative com sua Chave de Licença Serial para começar a usar o sistema.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <label
              htmlFor="license-key"
              className="text-xs font-medium uppercase tracking-wide text-slate-500"
            >
              Chave de Licença Serial
            </label>
            <input
              id="license-key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              disabled={busy || success}
              value={serial}
              onChange={(event) => {
                setStatus('idle')
                setError('')
                setSerial(event.target.value)
              }}
              onAnimationEnd={() => setShake(false)}
              placeholder="NSPDV-2026-PRO-BR99"
              className={clsx(
                'mt-1 w-full rounded-lg border bg-slate-50 px-3 py-3 text-center text-base font-mono font-semibold tracking-wide outline-none focus:ring-2 disabled:opacity-60',
                status === 'error'
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
                  : status === 'success'
                    ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/30'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/30',
                shake && 'shake-field',
              )}
            />
            {status === 'error' && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle size={13} className="shrink-0" />
                {error}
              </p>
            )}
            {status === 'success' && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 size={13} className="shrink-0" />
                Licença ativada!
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={busy || success || !serial.trim()}
            className={clsx(
              'flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300',
              success ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700',
            )}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {success && <CheckCircle2 size={16} />}
            {!busy && !success && <KeyRound size={16} />}
            {busy ? 'Ativando…' : success ? 'Licença ativada!' : 'Ativar Licença Vitalícia'}
          </button>
        </form>

        <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <div className="flex items-center justify-center gap-1.5">
            <Mail size={13} />
            Suporte NS Sistemas:
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:text-blue-700">
              {SUPPORT_EMAIL}
            </a>
          </div>

          {!showHwid ? (
            <button
              type="button"
              onClick={() => setShowHwid(true)}
              className="flex w-full items-center justify-center gap-1.5 text-slate-400 hover:text-slate-600"
            >
              <LifeBuoy size={12} />
              Informações do Sistema
            </button>
          ) : (
            <div className="mx-auto max-w-xs">
              <p className="text-center text-[11px] text-slate-400">
                Identificador técnico desta instalação. Envie este código ao suporte apenas se solicitado.
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-center font-mono text-xs font-semibold tracking-wide text-slate-700">
                  {hwid ?? (hwidError ? 'Falha ao gerar o HWID' : 'Gerando…')}
                </div>
                <button
                  type="button"
                  onClick={copyHwid}
                  disabled={!hwid}
                  title="Copiar HWID"
                  aria-label="Copiar HWID"
                  className={clsx(
                    'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border transition-colors',
                    copied
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
