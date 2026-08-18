import { useMemo, useState } from 'react'
import {
  ShieldCheck,
  Fingerprint,
  KeyRound,
  Wifi,
  Keyboard,
  BookOpen,
  HelpCircle,
  Search,
  ChevronDown,
  Download,
  Package,
  FileSpreadsheet,
  Bike,
  ClipboardList,
  FileText,
  DatabaseBackup,
  PlayCircle,
  Mail,
  SquarePlay,
  ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'
import { buildProductImportTemplate, downloadTextFile } from '../../utils/csv'
import { useOnboarding } from '../../context/OnboardingContext'

const SUPPORT_EMAIL = 'nssistemastech@gmail.com'
const YOUTUBE_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLS71r6kwmQI4'

const SECTIONS = [
  { id: 'instalacao', label: 'Instalação & Licença', icon: ShieldCheck },
  { id: 'atalhos', label: 'Guia Rápido & Atalhos', icon: Keyboard },
  { id: 'manuais', label: 'Manuais dos Módulos', icon: BookOpen },
  { id: 'faq', label: 'Dúvidas Frequentes (FAQ)', icon: HelpCircle },
]

const SHORTCUTS = [
  { key: 'F2', description: 'Finalizar Venda (PC Mestre) ou Enviar Pedido para o Caixa / Gerar Comanda (PC Balcão)' },
  { key: 'F3', description: 'Abre o painel de Comandas/Mesas. Digite "C15" ou os dígitos da comanda e pressione F3 para carregar o carrinho direto' },
  { key: 'F4', description: 'Limpa todos os itens do carrinho atual' },
  { key: 'F7', description: 'Abre o desconto (em R$ ou %) sobre o total da venda' },
  { key: 'F8', description: 'Vincula um Cliente / CPF na Nota à venda atual' },
  { key: 'F11', description: 'Abre a Consulta de Preços em tela cheia, com bipe sonoro exclusivo' },
  { key: 'ESC', description: 'Fecha o modal aberto; se nenhum modal estiver aberto, sai da tela de Vendas' },
  {
    key: '1 – 5',
    description:
      'No Fechamento de Venda: troca a forma de pagamento (1 Dinheiro, 2 PIX, 3 Cartão Crédito, 4 Cartão Débito, 5 Misto)',
  },
]

const MODULE_GUIDES = [
  {
    id: 'produtos',
    icon: Package,
    title: 'Produtos',
    steps: [
      'Cadastre produtos manualmente em Produtos → Novo Produto, informando nome, código de barras, categoria, preços e estoque.',
      'Use o botão Categorias para criar, renomear ou excluir categorias — renomear atualiza automaticamente todos os produtos vinculados.',
      'Vincule um Fornecedor (opcional) na aba Dados Gerais do produto para referência de compras.',
      'Produtos com grade de tamanho/cor usam a aba Grade & Variações — cada combinação tem seu próprio código de barras e estoque.',
    ],
  },
  {
    id: 'csv',
    icon: FileSpreadsheet,
    title: 'Importação & Exportação em CSV',
    steps: [
      'Em Produtos → Importar Planilha, baixe o modelo de exemplo (.csv) para garantir a formatação exata das colunas.',
      'Preencha nome, codigo_barras, categoria, preco_custo, preco_venda, unidade, estoque_atual e estoque_minimo — salve como CSV separado por vírgulas.',
      'Selecione o arquivo no modal de importação; linhas com erro são listadas e ignoradas, o restante é importado automaticamente.',
      'Use Exportar Produtos (CSV), em Produtos ou Configurações, para baixar todo o catálogo atual a qualquer momento.',
    ],
  },
  {
    id: 'delivery',
    icon: Bike,
    title: 'Delivery',
    steps: [
      'Cadastre o pedido com endereço, itens e forma de pagamento na tela de Delivery.',
      'Acompanhe o status do pedido (preparo, saiu para entrega, entregue) diretamente na listagem.',
      'Imprima a via do motoboy com endereço, itens e troco para conferência na entrega.',
    ],
  },
  {
    id: 'comandas',
    icon: ClipboardList,
    title: 'Comandas / Mesas',
    steps: [
      'Abra o painel de Comandas (F3) para ver a grade de 30 comandas — verde é livre, azul é ocupada.',
      'Clique numa comanda livre para lançar itens; ela fica ocupada automaticamente ao adicionar o primeiro produto.',
      'Numa comanda ocupada, use Adicionar mais itens, Imprimir Prévia da Conta ou Lançar para o Caixa para cobrar.',
      'No PC Balcão, monte o pedido normalmente e use Enviar Pedido para o Caixa / Gerar Comanda para atribuir a uma comanda sem coletar pagamento.',
    ],
  },
  {
    id: 'orcamentos',
    icon: FileText,
    title: 'Orçamentos',
    steps: [
      'Em Orçamentos → Novo Orçamento, informe cliente, itens e validade em dias.',
      'Configure Condições de Pagamento Personalizadas: número de parcelas, desconto à vista (% ou R$) e observações/termos da proposta.',
      'Imprima em Bobina (80mm) ou A4 — o documento mostra o valor parcelado, o valor à vista em destaque e as observações no rodapé.',
      'Quando o cliente aprovar, use Transformar em Venda para enviar os itens direto ao carrinho de Vendas.',
    ],
  },
  {
    id: 'backup',
    icon: DatabaseBackup,
    title: 'Backup & Restauração',
    steps: [
      'Em Configurações → Segurança de Dados, use Gerar Backup do Sistema para baixar uma cópia do banco de dados local com data e hora no nome do arquivo.',
      'Guarde o arquivo .db em um local seguro (pendrive, nuvem, outro computador).',
      'Para restaurar, use Restaurar Banco de Dados, selecione o arquivo .db e confirme no modal de segurança — os dados atuais serão substituídos e a sessão reiniciada.',
      'Fora do aplicativo desktop (Tauri), o backup vira um arquivo JSON portátil com os mesmos dados, já que não existe um banco SQLite real no navegador.',
    ],
  },
]

const FAQ_ITEMS = [
  {
    id: 1,
    question: 'Como faço a abertura de caixa no início do dia?',
    answer:
      'Ao abrir o sistema, faça login com seu PIN de operador. Se o caixa ainda não foi aberto hoje, o modal de Abertura de Caixa aparece automaticamente pedindo o Valor do Troco Inicial. Depois de aberto, ele permanece aberto mesmo se o app for fechado e reaberto no mesmo dia.',
  },
  {
    id: 2,
    question: 'Esqueci meu PIN de operador, o que eu faço?',
    answer:
      'Peça para o Gerente/Admin acessar Funcionários e trocar o PIN do seu usuário pelo ícone de chave. O operador Administrador padrão de fábrica usa o PIN 1234.',
  },
  {
    id: 3,
    question: 'Como alternar entre Modo Mestre e Modo Balcão?',
    answer:
      'Clique na badge "Modo Balcão / Atendimento" no rodapé do Menu Lateral e digite o PIN do Gerente/Admin. Isso libera imediatamente todas as abas e as opções de finalização de venda.',
  },
  {
    id: 4,
    question: 'Qual o formato exato do CSV de produtos?',
    answer:
      'As colunas são: nome, codigo_barras, categoria, preco_custo, preco_venda, unidade, estoque_atual, estoque_minimo. Use ponto decimal nos preços (ex: 19.90) e salve o arquivo como CSV separado por vírgulas.',
  },
  {
    id: 5,
    question: 'Para que serve a Consulta de Preços (F11)?',
    answer:
      'Abre uma tela cheia para o cliente ou operador conferir o preço de um produto sem lançá-lo na venda. Ela toca um bipe exclusivo (tom duplo de 600Hz), diferente do bipe usado ao vender, justamente para não ser confundido com uma passagem real pelo caixa.',
  },
  {
    id: 6,
    question: 'Como faço backup dos meus dados?',
    answer:
      'Vá em Configurações → Segurança de Dados e clique em Gerar Backup do Sistema. O arquivo é baixado com data e hora no nome, pronto para guardar em outro lugar.',
  },
  {
    id: 7,
    question: 'Perdi dados no PC, dá para restaurar de um backup?',
    answer:
      'Sim. Em Configurações → Segurança de Dados, clique em Restaurar Banco de Dados, selecione o arquivo .db do backup e confirme no modal de segurança. A sessão é reiniciada com os dados restaurados.',
  },
  {
    id: 8,
    question: 'Como transformo um orçamento aprovado em venda?',
    answer:
      'Na lista de Orçamentos, clique em Transformar. Os itens são enviados automaticamente para o carrinho da tela de Vendas, pronto para finalizar o pagamento.',
  },
]

function buildDemoHwid() {
  const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`
  let hash = 0
  for (let index = 0; index < raw.length; index++) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0
  }
  return `NS-${hash.toString(16).toUpperCase().padStart(8, '0')}-PDV`
}

export default function ComoUsarMain() {
  const [activeSection, setActiveSection] = useState('instalacao')
  const [faqSearch, setFaqSearch] = useState('')
  const [openFaqId, setOpenFaqId] = useState(null)
  const hwid = useMemo(() => buildDemoHwid(), [])
  const { reopenTour } = useOnboarding()

  const filteredFaq = useMemo(() => {
    const term = faqSearch.trim().toLowerCase()
    if (!term) return FAQ_ITEMS
    return FAQ_ITEMS.filter(
      (item) => item.question.toLowerCase().includes(term) || item.answer.toLowerCase().includes(term),
    )
  }, [faqSearch])

  function handleDownloadTemplate() {
    downloadTextFile('modelo-importacao-produtos.csv', buildProductImportTemplate())
  }

  function toggleFaq(id) {
    setOpenFaqId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Central de Ajuda</h1>
          <p className="text-sm text-slate-500">
            Como usar o NS PDV Express — instalação, atalhos, módulos e dúvidas frequentes
          </p>
        </div>

        <button
          type="button"
          onClick={reopenTour}
          className="flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3.5 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
        >
          <PlayCircle size={16} />
          ▶️ Ver Tutorial de Boas-Vindas Novamente
        </button>
      </header>

      <div className="shrink-0 overflow-hidden rounded-xl border border-red-200 bg-gradient-to-r from-red-50 via-white to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <SquarePlay size={22} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                🎬 Vídeo Aulas & Tutoriais Práticos
              </p>
              <h2 className="text-base font-bold text-slate-900">Aprenda a Usar em Vídeo</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                Assista a vídeos curtos e práticos ensinando passo a passo como operar todo o sistema em
                menos de 1 minuto.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <a
              href={YOUTUBE_PLAYLIST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-red-600/20 transition-colors hover:bg-red-700"
            >
              <SquarePlay size={16} />
              🔴 Assistir Playlist de Tutoriais no YouTube
              <ExternalLink size={14} className="opacity-80" />
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-blue-600 hover:underline"
            >
              <Mail size={12} />
              Suporte de emergência: {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={clsx(
              'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
              activeSection === id
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                : 'text-slate-500 hover:bg-slate-50',
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {activeSection === 'instalacao' && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Fingerprint size={13} />
                Identificador deste Computador (HWID)
              </p>
              <p className="text-sm text-slate-600">
                Cada instalação gera um identificador único de hardware (HWID), usado para vincular a
                licença a este computador. Informe-o ao suporte na hora de gerar sua chave de ativação.
              </p>
              <p className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2 font-mono text-sm font-semibold tracking-wider text-emerald-400">
                {hwid}
              </p>
              <p className="mt-1 text-xs text-slate-400">Valor de demonstração, gerado localmente neste navegador.</p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <KeyRound size={13} />
                  Ativação & Licenciamento
                </p>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Processo 100% Automático
                </span>
              </div>
              <p className="text-sm text-slate-600">
                Para compras feitas pelo Site, E-mail, WhatsApp ou Mercado Livre, a ativação não depende de
                suporte manual: assim que a compra é confirmada, a Chave de Licença é enviada instantaneamente
                pelo próprio canal da compra (chat do Mercado Livre, e-mail de confirmação do site ou WhatsApp).
              </p>

              <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                <li>Abra o sistema NS PDV Express no computador onde ele será usado.</li>
                <li>Cole a Chave de Licença recebida no campo de ativação.</li>
                <li>
                  Clique em <span className="font-semibold">"Ativar"</span>.
                </li>
              </ol>

              <p className="mt-3 text-sm text-slate-600">
                A chave é assinada digitalmente (RSA) e vinculada ao HWID deste computador (identificador acima)
                automaticamente em segundo plano, sem necessidade de contato com o suporte. A validação é feita
                localmente no primeiro acesso e a ativação ocorre uma única vez por computador.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Wifi size={13} />
                Conectando 2 Computadores na Mesma Rede
              </p>
              <p className="mb-3 text-sm text-slate-600">
                Não é preciso mexer em nada técnico do Windows — é só copiar e colar um código de um
                computador para o outro. Os dois computadores precisam estar ligados no mesmo
                Wi-Fi/roteador da loja.
              </p>
              <ol className="list-decimal space-y-2.5 pl-5 text-sm text-slate-600">
                <li>
                  <span className="font-semibold text-slate-800">No computador do Caixa Principal</span>: abra{' '}
                  <span className="font-semibold">Configurações → Modo de Operação do Sistema</span> e marque{' '}
                  <span className="font-semibold">"PC Mestre / Caixa Principal"</span>. Um cartão verde aparece
                  na tela com o Código de Conexão — é um número grande, tipo 192.168.1.10.
                </li>
                <li>
                  Clique em <span className="font-semibold">"Copiar Código de Conexão"</span> nesse cartão verde.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">No computador do Balcão/Atendimento</span>: abra
                  o mesmo painel de Configurações, marque <span className="font-semibold">"PC Cliente / Balcão"</span>,
                  cole o código no campo indicado e clique em <span className="font-semibold">"Testar Conexão"</span> para
                  confirmar que os dois computadores se enxergam na rede.
                </li>
              </ol>
              <p className="mt-3 text-xs text-slate-400">
                Depois de conectado, o terminal do Balcão passa a operar com acesso restrito (apenas Vendas e
                Produtos), liberável a qualquer momento com o PIN do Gerente/Admin.
              </p>
            </div>
          </div>
        )}

        {activeSection === 'atalhos' && (
          <div>
            <p className="mb-4 text-sm text-slate-500">
              Atalhos disponíveis na tela de Vendas — funcionam em qualquer campo do carrinho, exceto quando
              você está digitando dentro de um campo de texto.
            </p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-28 px-4 py-3">Tecla</th>
                    <th className="px-4 py-3">O que faz</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SHORTCUTS.map((shortcut) => (
                    <tr key={shortcut.key}>
                      <td className="px-4 py-3">
                        <kbd className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                          {shortcut.key}
                        </kbd>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{shortcut.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSection === 'manuais' && (
          <div className="space-y-5">
            {MODULE_GUIDES.map((guide) => (
              <div key={guide.id} className="rounded-lg border border-slate-200 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
                  <guide.icon size={16} className="text-blue-600" />
                  {guide.title}
                </p>
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                  {guide.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}

        {activeSection === 'faq' && (
          <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={faqSearch}
                  onChange={(event) => setFaqSearch(event.target.value)}
                  placeholder="Buscar nas perguntas frequentes…"
                  className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Download size={15} />
                Baixar modelo de CSV de produtos
              </button>
            </div>

            {filteredFaq.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                Nenhuma pergunta encontrada para "{faqSearch}".
              </p>
            ) : (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
                {filteredFaq.map((item) => {
                  const isOpen = openFaqId === item.id
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggleFaq(item.id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      >
                        {item.question}
                        <ChevronDown
                          size={16}
                          className={clsx('shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-180')}
                        />
                      </button>
                      {isOpen && (
                        <div className="bg-slate-50 px-4 py-3 text-sm text-slate-600">{item.answer}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs text-slate-500 shadow-sm">
        <a
          href={YOUTUBE_PLAYLIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 font-semibold text-red-600 transition-colors hover:bg-red-100"
        >
          <SquarePlay size={13} />
          Playlist de Tutoriais no YouTube
        </a>
        <span className="hidden text-slate-300 sm:inline">•</span>
        <span className="flex items-center gap-1.5">
          <Mail size={13} className="text-slate-400" />
          Suporte e dicas de urgência:
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-blue-600 hover:underline">
            {SUPPORT_EMAIL}
          </a>
        </span>
      </footer>
    </div>
  )
}
