import { useEffect, useState } from 'react'
import { Lock, ShieldAlert, ShoppingCart } from 'lucide-react'
import Sidebar from './components/layout/Sidebar'
import PDVMain from './components/pdv/PDVMain'
import EstoqueMain from './components/estoque/EstoqueMain'
import ClientesMain from './components/clientes/ClientesMain'
import TrocasMain from './components/trocas/TrocasMain'
import DeliveryMain from './components/delivery/DeliveryMain'
import OperadoresMain from './components/operadores/OperadoresMain'
import FinanceiroMain from './components/financeiro/FinanceiroMain'
import VendasDoDiaMain from './components/vendas/VendasDoDiaMain'
import ConfiguracoesMain from './components/configuracoes/ConfiguracoesMain'
import OrcamentosMain from './components/orcamentos/OrcamentosMain'
import FornecedoresMain from './components/fornecedores/FornecedoresMain'
import ComoUsarMain from './components/ajuda/ComoUsarMain'
import LogsMain from './components/logs/LogsMain'
import LoginScreen from './components/auth/LoginScreen'
import SetupAdminScreen from './components/auth/SetupAdminScreen'
import CashOpeningModal from './components/auth/CashOpeningModal'
import TelaAtivacaoLicenca from './components/auth/TelaAtivacaoLicenca'
import OnboardingTour from './components/common/OnboardingTour'
import LoadingScreen from './components/common/LoadingScreen'
import TelaBoasVindas from './components/common/TelaBoasVindas'
import { useAccessControl } from './context/AccessControlContext'
import { useSession } from './context/SessionContext'
import { useOperators } from './context/OperatorsContext'
import { useCashRegister } from './context/CashRegisterContext'
import { useBrandIdentity } from './hooks/useBrandIdentity'
import { verificarStatusLicenca } from './services/licensing'

const SCREEN_LABELS = {
  orcamentos: 'Orçamentos',
  clientes: 'Clientes',
  trocas: 'Trocas',
  delivery: 'Delivery',
  fornecedores: 'Fornecedores',
  operadores: 'Funcionários',
  'historico-vendas': 'Histórico de Vendas',
  relatorios: 'Relatórios',
  configuracoes: 'Configurações',
  logs: 'Logs & Diagnóstico',
}

// Telas válidas para restaurar do localStorage no F5/refresh — mesma lista
// de ids usada pelo Sidebar (ver components/layout/Sidebar.jsx) + 'vendas'/'ajuda',
// que não passam por PIN restrito.
const KNOWN_SCREENS = [
  'vendas',
  'produtos',
  'orcamentos',
  'clientes',
  'trocas',
  'delivery',
  'fornecedores',
  'operadores',
  'historico-vendas',
  'relatorios',
  'configuracoes',
  'logs',
  'ajuda',
]

const ACTIVE_SCREEN_STORAGE_KEY = 'ns-pdv-express:active-screen'
const SKIP_WELCOME_STORAGE_KEY = 'pular_boas_vindas'

function readStoredActiveScreen() {
  try {
    const stored = window.localStorage.getItem(ACTIVE_SCREEN_STORAGE_KEY)
    return KNOWN_SCREENS.includes(stored) ? stored : 'vendas'
  } catch {
    return 'vendas'
  }
}

function readSkipWelcome() {
  try {
    return window.localStorage.getItem(SKIP_WELCOME_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

// 'supervisor': módulos sempre travados (Relatórios/DRE, Logs & Diagnóstico),
// independente do modo de operação. 'balcao': telas liberadas só no modo
// Mestre, travadas automaticamente quando o terminal está em Balcão/Atendimento.
const RESTRICTED_COPY = {
  supervisor: {
    icon: ShieldAlert,
    title: 'Módulo do Supervisor',
    buttonLabel: 'Desbloquear com PIN do Supervisor',
    description: (label) => {
      const reason =
        {
          Relatórios: 'contém o DRE, faturamento e lucro líquido da loja.',
          Configurações: 'contém dados sensíveis da loja, como o PIN do Gerente/Admin.',
          Funcionários: 'contém o cadastro de funcionários e seus PINs de acesso.',
        }[label] ?? 'contém dados sensíveis de diagnóstico do sistema.'
      return `A tela "${label}" exige autorização do Supervisor — ${reason}`
    },
  },
  balcao: {
    icon: Lock,
    title: 'Área Restrita',
    buttonLabel: 'Desbloquear com PIN',
    description: (label) =>
      `A tela "${label}" está bloqueada no modo Balcão/Atendimento. Peça ao gerente para desbloquear com o PIN de Admin.`,
  },
}

function RestrictedScreen({ tabId, reason, onUnlock, onBackToVendas }) {
  const copy = RESTRICTED_COPY[reason] ?? RESTRICTED_COPY.balcao
  const Icon = copy.icon
  const label = SCREEN_LABELS[tabId] ?? tabId
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
        <Icon size={26} />
      </span>
      <div>
        <h2 className="text-lg font-bold text-slate-900">{copy.title}</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{copy.description(label)}</p>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onBackToVendas}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ShoppingCart size={15} />
          Voltar para Vendas
        </button>
        <button
          type="button"
          onClick={onUnlock}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Lock size={15} />
          {copy.buttonLabel}
        </button>
      </div>
    </div>
  )
}

function App() {
  // Restaura a última tela aberta no F5/refresh (ver `readStoredActiveScreen`)
  // — a sessão do operador (SessionContext, via localStorage) e o caixa aberto
  // (CashRegisterContext, via `configuracoes`) já sobrevivem ao refresh por
  // conta própria, então só falta lembrar em qual aba do menu lateral o
  // operador estava. Resultado: um F5 nunca deve cair na Tela de Login nem
  // encerrar o caixa — o app volta exatamente de onde parou.
  const [active, setActiveState] = useState(readStoredActiveScreen)
  const { isTabRestricted, isSupervisorGated, hasSupervisorAccess, isUnlocked, requestUnlock, isBalcaoMode } =
    useAccessControl()
  const { currentOperator, logout } = useSession()
  const { isLoaded: areOperatorsLoaded, needsSetup } = useOperators()
  const { isOpen: isCashOpen, isLoaded: isCashLoaded } = useCashRegister()
  const [licenseActive, setLicenseActive] = useState(null)
  const [welcomeDismissed, setWelcomeDismissed] = useState(readSkipWelcome)
  const [autoOpenNewProduct, setAutoOpenNewProduct] = useState(false)

  useBrandIdentity()

  // Checagem rápida de licença no boot (Etapa 5) — roda antes de qualquer
  // outra coisa (mesmo antes da Tela de Login): enquanto `licenseActive` for
  // `null` ainda não sabemos o resultado, então nada é renderizado além do
  // LoadingScreen abaixo, evitando um "flash" da tela normal do app antes do
  // bloqueio de licença aparecer.
  useEffect(() => {
    let cancelled = false
    verificarStatusLicenca()
      .then((active) => {
        if (!cancelled) setLicenseActive(active)
      })
      .catch((error) => {
        console.error('[licenca] Falha ao verificar o status da licença:', error)
        if (!cancelled) setLicenseActive(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function setActive(next) {
    setActiveState(next)
    try {
      window.localStorage.setItem(ACTIVE_SCREEN_STORAGE_KEY, next)
    } catch {
      // localStorage indisponível (modo privado etc.) — a navegação
      // continua funcionando normalmente, só não persiste entre refreshes.
    }
  }

  // 'logs' fica oculta do Menu Lateral para operadores comuns (ver Sidebar.jsx)
  // — se a última tela restaurada do F5 for 'logs' e o papel do operador
  // logado mudou (ou o localStorage guardava um estado antigo), volta para
  // Vendas em vez de deixar a tela "vazar" para quem não deveria vê-la.
  useEffect(() => {
    if (active === 'logs' && currentOperator && currentOperator.role === 'operador') {
      setActive('vendas')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentOperator])

  // Módulos do Supervisor (Relatórios/DRE, Logs & Diagnóstico) ficam travados
  // sempre, em qualquer modo de operação, para um operador comum; o restante
  // das telas só trava no modo Balcão/Atendimento (ver BALCAO_ALLOWED_TABS).
  // Quando os dois poderiam se aplicar, a trava do Supervisor prevalece — é a
  // mais forte e usa sua própria chave de desbloqueio, independente do modo
  // Balcão. Gerente/Admin (`hasSupervisorAccess`) nunca vê essa trava: já é a
  // própria aprovação que o PIN existiria para pedir.
  const supervisorGated = isSupervisorGated(active) && !hasSupervisorAccess
  const unlockKey = supervisorGated ? `supervisor:${active}` : `tab:${active}`
  const restricted = supervisorGated
    ? !isUnlocked(unlockKey)
    : isTabRestricted(active) && !isUnlocked(unlockKey)
  const restrictedReason = supervisorGated ? 'supervisor' : 'balcao'

  function promptUnlock() {
    if (supervisorGated) {
      requestUnlock({
        key: unlockKey,
        title: 'Módulo do Supervisor',
        description: `Digite o PIN do Supervisor para acessar "${SCREEN_LABELS[active] ?? active}".`,
      })
      return
    }
    requestUnlock({
      key: unlockKey,
      title: 'Área Restrita',
      description: `Digite o PIN do Gerente/Admin para acessar "${SCREEN_LABELS[active] ?? active}".`,
    })
  }

  useEffect(() => {
    if (restricted) promptUnlock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted, active])

  // Bloqueia o boot inteiro do app (mesmo antes do Login do Operador)
  // enquanto a licença local não estiver ativa.
  if (licenseActive === null) {
    return <LoadingScreen label="Verificando licença..." />
  }
  if (!licenseActive) {
    return <TelaAtivacaoLicenca onActivated={() => setLicenseActive(true)} />
  }

  // Controle de Acesso e Perfis: aguarda o cadastro de usuários carregar do
  // SQLite local antes de decidir entre a tela de Primeiro Acesso (cadastro
  // vazio) e a Tela de Login normal — evita um "flash" da Tela de Login para
  // quem ainda nem tem um Administrador cadastrado.
  if (!areOperatorsLoaded) {
    return <LoadingScreen label="Carregando usuários do sistema..." />
  }
  if (needsSetup) {
    return <SetupAdminScreen />
  }

  if (!currentOperator) {
    return <LoginScreen />
  }

  // Tela de Boas-Vindas: exibida uma vez por sessão logo após autenticar,
  // a não ser que o operador tenha marcado "abrir a Frente de Caixa
  // automaticamente" numa sessão anterior (`pular_boas_vindas` no
  // localStorage, ver TelaBoasVindas.jsx) — nesse caso o boot segue direto
  // para a Abertura de Caixa/PDV abaixo.
  if (!welcomeDismissed) {
    return (
      <>
        <OnboardingTour />
        <TelaBoasVindas
          onAbrirPDV={() => {
            setActive('vendas')
            setWelcomeDismissed(true)
          }}
          onCadastrarProduto={() => {
            setActive('produtos')
            setAutoOpenNewProduct(true)
            setWelcomeDismissed(true)
          }}
        />
      </>
    )
  }

  // Evita mostrar a Abertura de Caixa por engano enquanto a sessão salva no
  // banco de dados local ainda está carregando. Um `return null` aqui
  // colapsaria a árvore renderizada pra nada — como `body` não tem cor de
  // fundo própria (ver index.css), o resultado visual seria uma tela preta
  // até `isCashLoaded` resolver (e, se a leitura falhasse sem cair no
  // `.catch` de CashRegisterContext, ficaria preta pra sempre). Mostrar um
  // <LoadingScreen /> explícito garante que sempre há algo pintado na tela.
  if (!isBalcaoMode && !isCashLoaded) {
    return <LoadingScreen label="Carregando dados do caixa..." />
  }

  // Terminais em modo Balcão/Atendimento não operam caixa/dinheiro, então
  // pulam direto para o app sem exigir Abertura de Caixa.
  if (!isBalcaoMode && !isCashOpen) {
    return (
      <>
        <CashOpeningModal />
        <OnboardingTour />
      </>
    )
  }

  return (
    <div className="flex h-svh gap-3 bg-slate-100 p-3 text-slate-900 print:h-auto print:gap-0 print:bg-white print:p-0">
      <OnboardingTour />
      <Sidebar active={active} onSelect={setActive} />

      <main className="min-w-0 flex-1 overflow-hidden print:h-auto print:overflow-visible">
        {restricted ? (
          <RestrictedScreen
            tabId={active}
            reason={restrictedReason}
            onBackToVendas={() => setActive('vendas')}
            onUnlock={promptUnlock}
          />
        ) : (
          <>
            {active === 'vendas' && (
              <PDVMain onExit={logout} onGoToDelivery={() => setActive('delivery')} />
            )}
            {active === 'produtos' && (
              <EstoqueMain
                autoOpenNew={autoOpenNewProduct}
                onAutoOpenNewHandled={() => setAutoOpenNewProduct(false)}
              />
            )}
            {active === 'orcamentos' && <OrcamentosMain onGoToVendas={() => setActive('vendas')} />}
            {active === 'clientes' && <ClientesMain />}
            {active === 'trocas' && <TrocasMain />}
            {active === 'delivery' && <DeliveryMain />}
            {active === 'fornecedores' && <FornecedoresMain />}
            {active === 'operadores' && <OperadoresMain />}
            {active === 'historico-vendas' && <VendasDoDiaMain />}
            {active === 'relatorios' && <FinanceiroMain />}
            {active === 'configuracoes' && <ConfiguracoesMain />}
            {active === 'logs' && <LogsMain />}
            {active === 'ajuda' && <ComoUsarMain />}
          </>
        )}
      </main>
    </div>
  )
}

export default App
