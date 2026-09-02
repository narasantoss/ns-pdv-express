import { useState } from 'react'
import {
  Store,
  ShoppingCart,
  PackagePlus,
  ListChecks,
  ScanBarcode,
  Keyboard,
  Printer,
  PlayCircle,
  ExternalLink,
} from 'lucide-react'

const YOUTUBE_TRAINING_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLS71r6kwmQI4'
const SKIP_WELCOME_STORAGE_KEY = 'pular_boas_vindas'

const FIRST_STEPS = [
  {
    icon: ScanBarcode,
    text: 'Cadastre seus produtos com código de barras em Produtos → Novo Produto.',
  },
  {
    icon: Keyboard,
    text: 'Use F2 para fechar a venda e F9 para lançar frações/peso na Frente de Caixa.',
  },
  {
    icon: Printer,
    text: 'Configure o formato do cupom (58mm, 80mm ou A4) em Configurações → Impressão.',
  },
]

/**
 * Tela inicial exibida após o Login/Ativação de Licença (ver App.jsx), a não
 * ser que o operador tenha marcado o checkbox abaixo numa sessão anterior
 * (chave `pular_boas_vindas` no localStorage) — nesse caso o app pula direto
 * para a Frente de Caixa.
 */
export default function TelaBoasVindas({ onAbrirPDV, onCadastrarProduto }) {
  const [skipWelcome, setSkipWelcome] = useState(() => {
    try {
      return window.localStorage.getItem(SKIP_WELCOME_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  function handleToggleSkip(event) {
    const checked = event.target.checked
    setSkipWelcome(checked)
    try {
      window.localStorage.setItem(SKIP_WELCOME_STORAGE_KEY, checked ? 'true' : 'false')
    } catch {
      // localStorage indisponível (modo privado etc.) — a preferência só não
      // persiste entre reinícios, mas a navegação continua funcionando.
    }
  }

  return (
    <div className="flex h-svh flex-col items-center overflow-y-auto bg-slate-100 p-4 py-10">
      <div className="w-full max-w-3xl">
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Store size={22} />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">NS PDV Express</h1>
          <p className="text-sm text-slate-500">Frente de Caixa e Controle de Estoque</p>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onAbrirPDV}
            className="flex flex-col items-start gap-3 rounded-2xl bg-blue-600 p-6 text-left shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white">
              <ShoppingCart size={22} />
            </span>
            <div>
              <p className="text-base font-bold text-white">Abrir Frente de Caixa</p>
              <p className="mt-1 text-sm text-blue-100">
                Ir direto para a tela de Vendas e começar a atender.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onCadastrarProduto}
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-colors hover:bg-slate-50"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <PackagePlus size={22} />
            </span>
            <div>
              <p className="text-base font-bold text-slate-900">Cadastrar Produto</p>
              <p className="mt-1 text-sm text-slate-500">
                Abrir o formulário de novo produto no Estoque.
              </p>
            </div>
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ListChecks size={17} className="text-slate-400" />
            Primeiros Passos
          </h2>
          <ol className="mt-4 space-y-3">
            {FIRST_STEPS.map((step, index) => {
              const StepIcon = step.icon
              return (
                <li key={index} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <p className="flex-1 text-sm leading-relaxed text-slate-600">{step.text}</p>
                  <StepIcon size={16} className="mt-0.5 shrink-0 text-slate-300" />
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <a
            href={YOUTUBE_TRAINING_PLAYLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white"
          >
            <PlayCircle size={16} className="text-slate-500" />
            Assistir Playlist de Treinamento
            <ExternalLink size={13} className="text-slate-400" />
          </a>

          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={skipWelcome}
              onChange={handleToggleSkip}
              className="h-4 w-4 rounded border-slate-300 accent-slate-700"
            />
            Abrir o Frente de Caixa automaticamente ao iniciar o sistema
          </label>
        </div>
      </div>
    </div>
  )
}
