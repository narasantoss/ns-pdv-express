import { useEffect, useState } from 'react'
import {
  ShoppingCart,
  Package,
  Users,
  Repeat,
  Bike,
  UserCheck,
  BarChart3,
  History,
  Settings,
  MonitorSmartphone,
  KeyRound,
  FileText,
  Truck,
  HelpCircle,
  Lock,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import clsx from 'clsx'
import HeaderLogo from '../common/HeaderLogo'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useSession } from '../../context/SessionContext'
import { useAccessControl, BALCAO_ALLOWED_TABS } from '../../context/AccessControlContext'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ns-pdv:sidebar-collapsed'

function getInitialCollapsedState() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const NAV_ITEMS = [
  { id: 'vendas', label: 'Vendas', icon: ShoppingCart },
  { id: 'produtos', label: 'Produtos', icon: Package },
  { id: 'orcamentos', label: 'Orçamentos', icon: FileText },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'trocas', label: 'Trocas', icon: Repeat },
  { id: 'delivery', label: 'Delivery', icon: Bike },
  { id: 'fornecedores', label: 'Fornecedores', icon: Truck },
  { id: 'operadores', label: 'Funcionários', icon: UserCheck, supervisor: true },
  // Tela dedicada de controle/edição/estorno de vendas — não confundir com
  // 'relatorios' (dashboard financeiro/DRE gerencial, mantido intacto).
  // Fica sempre livre para consulta direta do operador (nunca some do menu
  // nem exige PIN do Supervisor, diferente de 'relatorios'/'logs' abaixo).
  { id: 'historico-vendas', label: 'Histórico de Vendas', icon: History },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3, supervisor: true },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, supervisor: true },
  // Some do menu para operadores comuns (role 'operador') — só gerente/admin
  // enxergam o item, e mesmo assim ainda precisam do PIN do Supervisor para
  // abrir a tela (ver App.jsx/SUPERVISOR_GATED_TABS).
  { id: 'logs', label: 'Logs & Diagnóstico', icon: ScrollText, supervisor: true, hiddenForOperador: true },
  { id: 'ajuda', label: 'Como Usar', icon: HelpCircle },
]

export default function Sidebar({ active, onSelect }) {
  const { settings, updateSettings } = useStoreSettings()
  const { currentOperator } = useSession()
  const {
    isBalcaoMode,
    isSupervisorGated,
    hasSupervisorAccess,
    isUnlocked,
    requestUnlock,
    activateAdminSession,
    activeOperator,
  } = useAccessControl()

  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsedState)

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? '1' : '0')
    } catch {
      // localStorage indisponível (modo privado/sandbox) — preferência não persiste, sem quebrar a UI.
    }
  }, [isCollapsed])

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (isBalcaoMode && !BALCAO_ALLOWED_TABS.includes(item.id)) return false
    if (item.hiddenForOperador && currentOperator?.role === 'operador') return false
    return true
  })

  function handleRequestMasterSwitch() {
    requestUnlock({
      key: 'switch-to-mestre',
      title: 'Acesso Restrito - Alternar para Modo Mestre',
      description: 'Digite o PIN do Gerente/Admin para liberar o Modo Mestre e todas as abas do menu.',
      onSuccess: () => {
        updateSettings({ operationMode: 'mestre' })
        activateAdminSession()
      },
    })
  }

  return (
    <aside
      className={clsx(
        'flex shrink-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 ease-in-out print:hidden',
        isCollapsed ? 'w-20' : 'w-64',
      )}
    >
      <div
        className={clsx(
          'flex items-center border-b border-slate-100 py-5 transition-all duration-300 ease-in-out',
          isCollapsed ? 'justify-center px-2' : 'justify-between gap-2 px-5',
        )}
      >
        {!isCollapsed && (
          <HeaderLogo
            className="min-w-0"
            name={settings.fantasyName.trim() || undefined}
            logoUrl={settings.logoDataUrl}
          />
        )}
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'Expandir menu' : 'Recolher menu'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
        <ul className="flex flex-col gap-1">
          {visibleItems.map(({ id, label, icon: Icon, supervisor }) => {
            const locked =
              supervisor && isSupervisorGated(id) && !hasSupervisorAccess && !isUnlocked(`supervisor:${id}`)
            return (
              <li key={id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  title={isCollapsed ? undefined : locked ? `${label} — requer PIN do Supervisor` : undefined}
                  className={clsx(
                    'flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition-colors',
                    isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
                    active === id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  {!isCollapsed && <span className="flex-1 text-left">{label}</span>}
                  {!isCollapsed && locked && (
                    <Lock
                      size={13}
                      className={active === id ? 'shrink-0 text-white/70' : 'shrink-0 text-slate-400'}
                    />
                  )}
                </button>

                {isCollapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                    {label}
                    {locked && ' — requer PIN do Supervisor'}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <div
        className={clsx(
          'border-t border-slate-100 py-4 transition-all duration-300 ease-in-out',
          isCollapsed ? 'px-2' : 'px-5',
        )}
      >
        {isBalcaoMode ? (
          <button
            type="button"
            onClick={handleRequestMasterSwitch}
            title="Alternar para Modo Mestre"
            className={clsx(
              'group/switch relative flex w-full items-center rounded-lg py-1 text-xs font-medium text-sky-600 transition-colors hover:text-sky-700',
              isCollapsed ? 'justify-center' : 'gap-1.5',
            )}
          >
            <MonitorSmartphone size={13} className="shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 text-left">Modo Balcão / Atendimento</span>
                <KeyRound
                  size={13}
                  className="shrink-0 text-sky-400 opacity-70 transition-opacity group-hover/switch:opacity-100"
                />
              </>
            )}
            {isCollapsed && (
              <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/switch:opacity-100">
                Modo Balcão / Atendimento
              </span>
            )}
          </button>
        ) : (
          <div className={clsx('space-y-1', isCollapsed && 'flex flex-col items-center')}>
            <p
              className={clsx(
                'flex items-center text-xs font-medium text-slate-500',
                isCollapsed ? 'justify-center' : 'gap-1.5',
              )}
              title={isCollapsed ? 'Sistema online' : undefined}
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              {!isCollapsed && 'Sistema online'}
            </p>
            {!isCollapsed && activeOperator && (
              <p className="truncate text-[11px] text-slate-400">
                {activeOperator.name} · {activeOperator.role}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
