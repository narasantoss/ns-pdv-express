import { useEffect, useState } from 'react'
import {
  ScrollText,
  RefreshCw,
  FolderDown,
  Mail,
  ShieldCheck,
  MonitorSmartphone,
  AlertTriangle,
  AlertCircle,
  Info,
  Store,
  Lock,
} from 'lucide-react'
import clsx from 'clsx'
import { useSession } from '../../context/SessionContext'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useCashRegister } from '../../context/CashRegisterContext'
import { MANAGER_ACTION_LABELS } from '../../context/ManagerAuthContext'
import { autorizacoesGerenteRepo, isTauriRuntime } from '../../services/db'
import { getLogEntries, getPersistedLogEntries } from '../../utils/appLog'
import { downloadTextFile } from '../../utils/csv'

const SUPPORT_EMAIL = 'nssistemastech@gmail.com'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const LEVEL_META = {
  error: { label: 'Erro', icon: AlertCircle, tone: 'bg-red-50 text-red-600' },
  warn: { label: 'Aviso', icon: AlertTriangle, tone: 'bg-amber-50 text-amber-600' },
  info: { label: 'Info', icon: Info, tone: 'bg-slate-100 text-slate-500' },
}

function formatDiagnosticTimestamp(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : dateTimeFormatter.format(parsed)
}

/** Monta o conteúdo do log de suporte exportável — texto simples, pronto para anexar num e-mail. */
function buildSupportLogText({ diagnostics, authEntries, logEntries }) {
  const lines = []
  lines.push('=== NS PDV Express — Log de Suporte ===')
  lines.push(`Gerado em: ${formatDiagnosticTimestamp(new Date())}`)
  for (const [label, value] of diagnostics) lines.push(`${label}: ${value}`)
  lines.push('')
  lines.push(`--- Últimas Autorizações do Supervisor (${authEntries.length}) ---`)
  if (authEntries.length === 0) lines.push('(nenhuma autorização registrada)')
  authEntries.forEach((entry) => {
    const tipo = MANAGER_ACTION_LABELS[entry.tipoAcao] ?? entry.tipoAcao
    lines.push(
      `[${formatDiagnosticTimestamp(entry.criadoEm)}] ${tipo} · Operador: ${entry.operador || '—'} · Motivo: ${entry.motivo || '—'}`,
    )
  })
  lines.push('')
  lines.push(`--- Eventos e Erros Recentes (${logEntries.length}) ---`)
  if (logEntries.length === 0) lines.push('(nenhum evento registrado nesta sessão)')
  logEntries.forEach((entry) => {
    lines.push(
      `[${formatDiagnosticTimestamp(entry.timestamp)}] [${entry.level.toUpperCase()}] ${entry.message}${entry.detail ? ` — ${entry.detail}` : ''}`,
    )
  })
  return lines.join('\n')
}

export default function LogsMain() {
  const { currentOperator } = useSession()
  const { settings } = useStoreSettings()
  const { isOpen: isCashOpen, openedAt } = useCashRegister()
  const [logEntries, setLogEntries] = useState(() => getLogEntries())
  const [authEntries, setAuthEntries] = useState([])
  const [loadingAuth, setLoadingAuth] = useState(true)

  function refresh() {
    const sessionEntries = getLogEntries()
    setLogEntries(sessionEntries)
    getPersistedLogEntries()
      .then((persisted) => {
        if (persisted.length === 0) return
        const seen = new Set(sessionEntries.map((entry) => `${entry.timestamp}|${entry.message}`))
        const merged = [...sessionEntries]
        for (const entry of persisted) {
          const key = `${entry.timestamp}|${entry.message}`
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(entry)
        }
        merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setLogEntries(merged)
      })
      .catch(() => {})

    setLoadingAuth(true)
    autorizacoesGerenteRepo
      .list()
      .then(setAuthEntries)
      .catch((error) => console.error('[logs] Falha ao carregar autorizações do Supervisor:', error))
      .finally(() => setLoadingAuth(false))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const diagnostics = [
    ['Loja', settings.fantasyName.trim() || '—'],
    ['Ambiente', isTauriRuntime() ? 'Aplicativo Desktop (Tauri)' : 'Navegador'],
    ['Modo de Operação', settings.operationMode === 'balcao' ? 'Balcão/Atendimento' : 'Mestre'],
    ['Operador Logado', `${currentOperator?.name ?? '—'} (${currentOperator?.role ?? '—'})`],
    ['Caixa', isCashOpen ? `Aberto desde ${formatDiagnosticTimestamp(openedAt)}` : 'Fechado'],
    ['Navegador', typeof navigator !== 'undefined' ? navigator.userAgent : '—'],
  ]

  function exportSupportLog() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    downloadTextFile(
      `log-suporte-ns-pdv-${stamp}.txt`,
      buildSupportLogText({ diagnostics, authEntries, logEntries }),
      'text/plain;charset=utf-8',
    )
  }

  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    'Suporte NS PDV Express',
  )}&body=${encodeURIComponent('Descreva o problema encontrado e anexe o arquivo .txt exportado em Logs & Diagnóstico.')}`

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ScrollText size={18} className="text-slate-500" />
            Logs & Diagnóstico
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <Lock size={12} className="text-amber-500" />
            Área exclusiva do Supervisor — dados técnicos para suporte
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          <a
            href={mailtoHref}
            className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
          >
            <Mail size={16} />
            Abrir E-mail de Suporte
          </a>
          <button
            type="button"
            onClick={exportSupportLog}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            <FolderDown size={16} />
            📁 Exportar Log de Suporte (.txt)
          </button>
        </div>
      </header>

      <p className="shrink-0 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
        Em caso de problema técnico, exporte o log acima e envie o arquivo .txt para{' '}
        <span className="font-semibold">{SUPPORT_EMAIL}</span> — ele reúne o diagnóstico do sistema, as últimas
        autorizações do Supervisor e os eventos/erros mais recentes desta sessão.
      </p>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <MonitorSmartphone size={16} />
              Diagnóstico do Sistema
            </h2>
            <dl className="space-y-2 text-sm">
              {diagnostics.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-50 pb-2">
                  <dt className="flex shrink-0 items-center gap-1.5 text-slate-500">
                    {label === 'Loja' && <Store size={13} className="text-slate-400" />}
                    {label}
                  </dt>
                  <dd className="break-all text-right font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <ShieldCheck size={16} />
              Últimas Autorizações do Supervisor
            </h2>
            {loadingAuth ? (
              <p className="text-sm text-slate-400">Carregando…</p>
            ) : authEntries.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhuma autorização registrada ainda.</p>
            ) : (
              <ul className="custom-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1 text-sm">
                {authEntries.slice(0, 30).map((entry) => (
                  <li key={entry.id} className="rounded-lg border border-slate-100 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800">
                        {MANAGER_ACTION_LABELS[entry.tipoAcao] ?? entry.tipoAcao}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-slate-400">
                        {formatDiagnosticTimestamp(entry.criadoEm)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Operador: {entry.operador || '—'}
                      {entry.motivo && <> · Motivo: {entry.motivo}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
            <ScrollText size={16} />
            Eventos e Erros Recentes desta Sessão
          </h2>
          {logEntries.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum evento registrado nesta sessão.</p>
          ) : (
            <ul className="custom-scrollbar max-h-96 space-y-1.5 overflow-y-auto pr-1 text-sm">
              {logEntries.map((entry, index) => {
                const meta = LEVEL_META[entry.level] ?? LEVEL_META.info
                const Icon = meta.icon
                return (
                  <li key={index} className="flex items-start gap-2.5 rounded-lg border border-slate-100 p-2.5">
                    <span className={clsx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md', meta.tone)}>
                      <Icon size={12} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-slate-700">{entry.message}</p>
                      {entry.detail && <p className="break-words text-xs text-slate-400">{entry.detail}</p>}
                    </div>
                    <span className="shrink-0 tabular-nums text-xs text-slate-400">
                      {formatDiagnosticTimestamp(entry.timestamp)}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
