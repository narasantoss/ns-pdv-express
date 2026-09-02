import { useState } from 'react'
import {
  Sparkles,
  Keyboard,
  ScanBarcode,
  Package,
  FileSpreadsheet,
  Settings,
  ImageIcon,
  DatabaseBackup,
  KeyRound,
  Mail,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  SquarePlay,
  ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import { useOnboarding } from '../../context/OnboardingContext'
import { buildProductImportTemplate, downloadTextFile } from '../../utils/csv'

const SUPPORT_EMAIL = 'nssistemastech@gmail.com'
const YOUTUBE_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLS71r6kwmQI4'

const STEPS = [
  {
    id: 'boas-vindas',
    icon: Sparkles,
    title: 'Bem-vindo ao NS PDV Express',
    body: BemVindoStep,
  },
  {
    id: 'frente-caixa',
    icon: Keyboard,
    title: 'Frente de Caixa',
    body: FrenteCaixaStep,
  },
  {
    id: 'estoque-csv',
    icon: Package,
    title: 'Cadastro de Estoque & Importação em CSV',
    body: EstoqueCsvStep,
  },
  {
    id: 'configuracoes-backup',
    icon: Settings,
    title: 'Configurações, Logo & Backup de Segurança',
    body: ConfiguracoesBackupStep,
  },
  {
    id: 'licenca-suporte',
    icon: KeyRound,
    title: 'Licença Vitalícia & Suporte de Emergência',
    body: LicencaSuporteStep,
  },
]

function BemVindoStep() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-600">
      <p>
        O <span className="font-semibold text-slate-800">NS PDV Express</span> reúne, num único
        sistema, Frente de Caixa, Estoque, Comandas, Delivery, Orçamentos e Financeiro — pensado para
        funcionar rápido no dia a dia do seu negócio, mesmo sem internet.
      </p>
      <p>
        Este tutorial rápido apresenta as 5 áreas mais importantes para você começar a operar com
        segurança hoje mesmo. Leva menos de 2 minutos.
      </p>
    </div>
  )
}

const SHORTCUT_ITEMS = [
  { key: 'F2', description: 'Finaliza a venda atual no Caixa' },
  { key: 'F3', description: 'Abre o painel de Comandas/Mesas' },
  { key: 'F8', description: 'Vincula um Cliente / CPF na Nota à venda' },
  { key: 'F9', description: 'Venda por Peso — produtos pesáveis (Sacolão/Açougue/Feira)' },
  { key: 'F11', description: 'Consulta de Preços em tela cheia' },
]

function FrenteCaixaStep() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-600">
      <p>
        A tela de Vendas foi feita para ser operada pelo teclado, sem precisar tirar a mão do mouse
        toda hora. Estes são os atalhos essenciais:
      </p>
      <div className="grid grid-cols-2 gap-2">
        {SHORTCUT_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <kbd className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700">
              {item.key}
            </kbd>
            <span className="text-xs text-slate-600">{item.description}</span>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3">
        <ScanBarcode size={18} className="mt-0.5 shrink-0 text-blue-600" />
        <p className="text-xs text-blue-800">
          O Leitor de Código de Barras funciona plugado como teclado: basta bipar o produto com o
          cursor no campo de busca da tela de Vendas que ele entra direto no carrinho.
        </p>
      </div>
    </div>
  )
}

function EstoqueCsvStep() {
  function handleDownloadTemplate() {
    downloadTextFile('modelo-importacao-produtos.csv', buildProductImportTemplate())
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-600">
      <p>
        Cadastre produtos manualmente em <span className="font-semibold text-slate-800">Produtos → Novo Produto</span>,
        ou importe uma planilha inteira de uma vez em{' '}
        <span className="font-semibold text-slate-800">Produtos → Importar Planilha</span>.
      </p>
      <p>
        Baixe o modelo de teste abaixo para ver exatamente o formato esperado (nome, código de
        barras, categoria, preços, estoque) antes de montar sua própria planilha.
      </p>
      <button
        type="button"
        onClick={handleDownloadTemplate}
        className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <FileSpreadsheet size={16} className="text-blue-600" />
        Baixar Modelo de Teste (CSV)
        <Download size={14} className="ml-auto text-slate-400" />
      </button>
    </div>
  )
}

function ConfiguracoesBackupStep() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-600">
      <p>
        Em <span className="font-semibold text-slate-800">Configurações</span>, cadastre os dados da
        sua loja e envie a logomarca — ela aparece no cabeçalho do sistema e no recibo impresso.
      </p>
      <div className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <ImageIcon size={18} className="mt-0.5 shrink-0 text-slate-500" />
        <p className="text-xs text-slate-600">
          Logomarca (PNG ou JPG, até 2MB) em Configurações → Logomarca.
        </p>
      </div>
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <DatabaseBackup size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          Faça backup com frequência: Configurações → Segurança de Dados → Gerar Backup do Sistema
          baixa uma cópia do banco de dados local (.db) com data e hora no nome — guarde-a num
          pendrive ou na nuvem.
        </p>
      </div>
    </div>
  )
}

function LicencaSuporteStep() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-600">
      <p>
        Sua chave de ativação é uma{' '}
        <span className="font-semibold text-slate-800">Licença Vitalícia</span>: ativa uma única vez
        neste computador e não expira — sem mensalidades.
      </p>
      <p>
        Em caso de dúvida ou urgência, a Central de Ajuda (menu lateral) tem atalhos, manuais de cada
        módulo, perguntas frequentes e vídeo aulas práticas. Assista à playlist oficial ou fale
        diretamente com o suporte pelos canais abaixo.
      </p>
      <a
        href={YOUTUBE_PLAYLIST_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
      >
        <SquarePlay size={17} className="text-red-600" />
        🔴 Assistir Playlist de Tutoriais no YouTube
        <ExternalLink size={14} className="ml-auto shrink-0 text-red-400" />
      </a>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
      >
        <Mail size={17} className="text-blue-600" />
        {SUPPORT_EMAIL}
      </a>
    </div>
  )
}

export default function OnboardingTour() {
  const { isTourOpen, markOnboardingDone } = useOnboarding()
  const [stepIndex, setStepIndex] = useState(0)

  if (!isTourOpen) return null

  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === STEPS.length - 1
  const step = STEPS[stepIndex]
  const StepIcon = step.icon
  const StepBody = step.body

  function handleFinish() {
    setStepIndex(0)
    markOnboardingDone()
  }

  function handleNext() {
    if (isLastStep) {
      handleFinish()
      return
    }
    setStepIndex((prev) => Math.min(prev + 1, STEPS.length - 1))
  }

  function handleBack() {
    setStepIndex((prev) => Math.max(prev - 1, 0))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <StepIcon size={19} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Passo {stepIndex + 1} de {STEPS.length}
              </p>
              <h2 className="text-base font-bold text-slate-900">{step.title}</h2>
            </div>
          </div>
        </div>

        <div className="flex gap-1.5 px-6 pt-4">
          {STEPS.map((item, index) => (
            <span
              key={item.id}
              className={clsx(
                'h-1.5 flex-1 rounded-full transition-colors',
                index <= stepIndex ? 'bg-blue-600' : 'bg-slate-200',
              )}
            />
          ))}
        </div>

        <div className="px-6 py-5">
          <StepBody />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={handleFinish}
            className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            ⏭️ Pular Tutorial
          </button>

          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft size={15} />
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
            >
              {isLastStep ? (
                <>
                  <CheckCircle2 size={16} />
                  Concluir
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
