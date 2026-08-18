import { useEffect, useState } from 'react'
import { ShieldCheck, Copy, Check, AlertTriangle, Mail, KeyRound, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import HeaderLogo from '../common/HeaderLogo'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { obterHwidMaquina, ativarLicenca } from '../../services/licensing'

const SUPPORT_EMAIL = 'nssistemastech@gmail.com'

/**
 * Tela de Ativação de Licença (Etapa 5) — bloqueia o boot do app enquanto a
 * licença local não estiver ativa (ver `onActivated`, chamado por App.jsx).
 * O operador copia o HWID exibido aqui e envia ao suporte da NS Sistemas;
 * o suporte devolve a Chave de Ativação (RSA), assinada offline para este
 * HWID específico (ver src-tauri/src/licensing.rs).
 */
export default function TelaAtivacaoLicenca({ onActivated }) {
  const { settings } = useStoreSettings()
  const [hwid, setHwid] = useState(null)
  const [hwidError, setHwidError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [chave, setChave] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
    if (!hwid || busy || !chave.trim()) return
    setBusy(true)
    setError('')
    try {
      await ativarLicenca(chave, hwid)
      onActivated?.()
    } catch (err) {
      setError(err?.message || 'Não foi possível ativar a licença. Confira a chave e tente novamente.')
    } finally {
      setBusy(false)
    }
  }

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
              Este computador ainda não está licenciado. Ative para continuar usando o sistema.
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Identificador desta máquina (HWID)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-center font-mono text-sm font-semibold tracking-wide text-slate-800">
                {hwid ?? (hwidError ? 'Falha ao gerar o HWID' : 'Gerando…')}
              </div>
              <button
                type="button"
                onClick={copyHwid}
                disabled={!hwid}
                title="Copiar HWID"
                aria-label="Copiar HWID"
                className={clsx(
                  'flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-colors',
                  copied
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                    : 'border-slate-300 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Envie este código ao suporte para receber sua Chave de Ativação.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="license-key"
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Chave de Ativação (RSA)
              </label>
              <textarea
                id="license-key"
                rows={3}
                value={chave}
                onChange={(event) => {
                  setError('')
                  setChave(event.target.value)
                }}
                placeholder="Cole aqui a chave recebida do suporte…"
                className={clsx(
                  'mt-1 w-full resize-none rounded-lg border bg-slate-50 px-3 py-2.5 text-sm font-mono outline-none focus:ring-2',
                  error
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/30',
                )}
              />
              {error && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                  <AlertTriangle size={13} className="shrink-0" />
                  {error}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!hwid || busy || !chave.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {busy ? 'Ativando…' : 'Ativar Licença Agora'}
            </button>
          </form>
        </div>

        <div className="mt-6 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <Mail size={13} />
          Suporte NS Sistemas:
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:text-blue-700">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </div>
  )
}
