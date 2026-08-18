import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { useStoreSettings } from './StoreSettingsContext'
import { useSession } from './SessionContext'
import { isSupervisorRole } from './OperatorsContext'

// No modo Balcão/Atendimento (Terminal Operacional / Caixa 02), os módulos
// operacionais completos ficam acessíveis pelo Menu Lateral — Vendas (PDV),
// Produtos, Clientes, Delivery, Trocas e Como Usar. Apenas os módulos de
// gestão administrativa (Relatórios Financeiros, Configurações, Funcionários,
// Logs, Orçamentos, Fornecedores e Histórico de Vendas) continuam fora dessa
// lista e exigem o PIN do Gerente/Admin para desbloquear.
export const BALCAO_ALLOWED_TABS = ['vendas', 'produtos', 'clientes', 'delivery', 'trocas', 'ajuda']

// Abas que exigem o PIN do Supervisor para abrir, em qualquer modo de
// operação (Mestre ou Balcão) — diferente da trava acima, que só vale no
// modo Balcão. 'relatorios' é o dashboard financeiro/DRE (faturamento, lucro
// líquido); 'configuracoes' guarda dados sensíveis da loja (PIN do
// Gerente/Admin, backup/restauração do banco etc.); 'operadores' é o
// cadastro de Funcionários (cargos, PINs de acesso); 'logs' é a tela de
// Logs & Diagnóstico, além de já ficar oculta do Menu Lateral para
// operadores comuns (ver Sidebar.jsx). 'historico-vendas' (consulta/reimpressão
// de vendas) fica de fora de propósito — continua livre para consulta direta
// do operador; só o Estorno/Cancelamento dentro dela exige o PIN (ver
// ManagerAuthContext/VendasDoDiaMain).
export const SUPERVISOR_GATED_TABS = ['relatorios', 'configuracoes', 'operadores', 'logs']

// Operador Administrador padrão do sistema — deve existir também em
// src/components/operadores/OperadoresMain.jsx (cadastro de funcionários).
// O PIN aqui é o mesmo `settings.adminPin` (padrão 1234, editável em Configurações),
// usado como a credencial única do Gerente/Admin em todo o app.
export const DEFAULT_ADMIN_OPERATOR = {
  name: 'Gerente Admin',
  role: 'Administrador',
}

const AccessControlContext = createContext(null)

export function AccessControlProvider({ children }) {
  const { settings } = useStoreSettings()
  const { currentOperator } = useSession()
  const isBalcaoMode = settings.operationMode === 'balcao'
  // Gerente/Admin já é a própria aprovação de nível superior — as travas de
  // 'Relatórios'/'Logs & Diagnóstico' (SUPERVISOR_GATED_TABS) só valem de
  // fato para um 'operador' comum (ver App.jsx/Sidebar.jsx, que consultam
  // este valor antes de exibir a tela de bloqueio ou pedir o PIN).
  const hasSupervisorAccess = isSupervisorRole(currentOperator)
  const [unlockedKeys, setUnlockedKeys] = useState(() => new Set())
  const [pinRequest, setPinRequest] = useState(null)
  const [activeOperator, setActiveOperator] = useState(null)

  useEffect(() => {
    setUnlockedKeys(new Set())
    setPinRequest(null)
  }, [isBalcaoMode])

  useEffect(() => {
    if (isBalcaoMode) setActiveOperator(null)
  }, [isBalcaoMode])

  function isTabRestricted(tabId) {
    return isBalcaoMode && !BALCAO_ALLOWED_TABS.includes(tabId)
  }

  function isSupervisorGated(tabId) {
    return SUPERVISOR_GATED_TABS.includes(tabId)
  }

  function isUnlocked(key) {
    return unlockedKeys.has(key)
  }

  function requestUnlock({ key, title, description, onSuccess }) {
    setPinRequest({ key, title, description, onSuccess })
  }

  function activateAdminSession() {
    setActiveOperator(DEFAULT_ADMIN_OPERATOR)
  }

  function confirmPin(pin) {
    if (!pinRequest) return false
    if (pin === settings.adminPin) {
      const unlockedKey = pinRequest.key
      const onSuccess = pinRequest.onSuccess
      setUnlockedKeys((prev) => {
        const next = new Set(prev)
        next.add(unlockedKey)
        return next
      })
      setPinRequest(null)
      onSuccess?.()
      return true
    }
    return false
  }

  function cancelPinRequest() {
    setPinRequest(null)
  }

  const value = useMemo(
    () => ({
      isBalcaoMode,
      isTabRestricted,
      isSupervisorGated,
      hasSupervisorAccess,
      isUnlocked,
      requestUnlock,
      pinRequest,
      confirmPin,
      cancelPinRequest,
      activeOperator,
      activateAdminSession,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBalcaoMode, hasSupervisorAccess, unlockedKeys, pinRequest, settings.adminPin, activeOperator],
  )

  return (
    <AccessControlContext.Provider value={value}>
      {children}
      <PinLockModal />
    </AccessControlContext.Provider>
  )
}

export function useAccessControl() {
  const context = useContext(AccessControlContext)
  if (!context) {
    throw new Error('useAccessControl must be used within an AccessControlProvider')
  }
  return context
}

function PinLockModal() {
  const { pinRequest, confirmPin, cancelPinRequest } = useAccessControl()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    setPin('')
    setError(false)
  }, [pinRequest])

  if (!pinRequest) return null

  function handleSubmit(event) {
    event.preventDefault()
    const ok = confirmPin(pin)
    if (!ok) {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Lock size={22} />
          </span>
          <h2 className="text-base font-bold text-slate-900">{pinRequest.title ?? 'Área Restrita'}</h2>
          <p className="text-sm text-slate-500">
            {pinRequest.description ?? 'Digite o PIN do Gerente/Admin para continuar.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(event) => {
              setError(false)
              setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
            }}
            placeholder="••••"
            className={clsx(
              'w-full rounded-lg border-2 bg-slate-50 px-3 py-3 text-center text-2xl font-black tracking-[0.6em] text-slate-800 outline-none',
              error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-blue-500',
            )}
          />
          {error && (
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle size={13} />
              PIN incorreto
            </p>
          )}

          {import.meta.env.DEV && (
            <p className="text-center text-[11px] text-slate-400">
              PIN Padrão: 1234 <span className="text-slate-300">(ambiente de desenvolvimento)</span>
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelPinRequest}
              className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pin.length !== 4}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Desbloquear
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
