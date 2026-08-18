import { Component } from 'react'
import { AlertOctagon, Eraser, RotateCcw } from 'lucide-react'
import { logEvent } from '../../utils/appLog'

// Chaves de localStorage que guardam só estado de navegação/sessão da UI
// (aba ativa, id do operador logado, sidebar recolhida) — nunca dados de
// negócio (produtos, vendas, clientes ficam em `pdv-express-db:*`/
// `pdv-sistema-2026:*`, ver src/services/db.js e os Contexts de domínio).
// "Limpar Cache/Recuperar" existe pra desempacar um estado de boot
// corrompido (ex.: uma tela salva que não existe mais, um id de operador
// que não bate com nada) sem apagar nenhuma venda, produto ou cliente salvo.
const RECOVERABLE_STORAGE_KEYS = [
  'ns-pdv-express:active-screen',
  'ns-pdv-express:session-operator-id',
  'ns-pdv:sidebar-collapsed',
]

/**
 * Rede de segurança global de renderização. Sem isso, qualquer exceção
 * lançada durante o render de qualquer componente da árvore (ex.: acessar
 * uma propriedade de um objeto que ainda não carregou) derruba a árvore
 * inteira do React — e como `index.css` declara `color-scheme: light dark`
 * sem um `background-color` explícito em `body`, o que sobra na tela é a
 * cor de fundo nativa do WebView: preto, em qualquer PC com o Windows no
 * tema escuro. Esse componente intercepta o erro antes disso acontecer e
 * mostra uma tela de recuperação de verdade, em vez de uma tela preta.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Erro não tratado na árvore de componentes:', error, info)
    try {
      logEvent('error', `Falha de renderização: ${error?.message ?? error}`, info?.componentStack ?? null)
    } catch {
      // O log é best-effort — nunca deixa a própria tentativa de registrar o
      // erro impedir a tela de recuperação de aparecer.
    }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleClearAndRecover = () => {
    try {
      for (const key of RECOVERABLE_STORAGE_KEYS) {
        window.localStorage.removeItem(key)
      }
    } catch {
      // localStorage indisponível — segue para o reload de qualquer forma.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-svh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertOctagon size={26} />
          </span>

          <h1 className="mt-4 text-lg font-bold text-slate-900">O sistema encontrou um erro</h1>
          <p className="mt-2 text-sm text-slate-500">
            Algo travou a tela antes que ela terminasse de carregar. Nenhuma venda, produto ou cliente
            salvo foi perdido — só esta janela precisa ser reiniciada.
          </p>

          {this.state.error?.message && (
            <p className="mt-3 break-words rounded-lg bg-slate-50 p-2.5 text-left font-mono text-[11px] text-slate-500">
              {this.state.error.message}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              <RotateCcw size={16} />
              Recarregar Sistema
            </button>
            <button
              type="button"
              onClick={this.handleClearAndRecover}
              className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <Eraser size={16} />
              Limpar Cache / Recuperar
            </button>
          </div>

          <p className="mt-4 text-[11px] text-slate-400">
            Se o problema continuar depois de recarregar, veja o histórico em Logs &amp; Diagnóstico ou
            fale com o suporte.
          </p>
        </div>
      </div>
    )
  }
}
