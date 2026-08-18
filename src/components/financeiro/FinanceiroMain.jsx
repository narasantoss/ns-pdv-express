import { useEffect, useMemo, useState } from 'react'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Lock,
  X,
  CalendarDays,
  ShoppingCart,
  PlusCircle,
  MinusCircle,
  Printer,
  FileSpreadsheet,
  Search,
  Eye,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useCashRegister } from '../../context/CashRegisterContext'
import { useProducts } from '../../context/ProductsContext'
import { useClients } from '../../context/ClientsContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import { formatCurrency } from '../../utils/format'
import ReceiptModal from '../common/ReceiptModal'
import CashClosingModal from './CashClosingModal'
import { PAYMENT_METHODS, PAYMENT_TONE_CLASSES, bucketForPaymentMethod, describePaymentMethod } from '../../data/paymentMethods'
import { vendasRepo } from '../../services/db'

function startOfDay(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

/** Quantos dias atrás de `today` uma data caiu — o mesmo papel que o `offset` fixo do antigo histórico fabricado tinha, calculado a partir da data real da venda. */
function daysAgo(date, today) {
  return Math.round((startOfDay(today) - startOfDay(date)) / 86400000)
}

/** Converte uma venda real (`vendasRepo.listWithItems`) para o formato de exibição que esta tela já usava. */
function toDashboardSale(venda, clientsById) {
  const client = venda.clienteId != null ? clientsById.get(venda.clienteId) : null
  return {
    id: venda.id,
    code: `#${venda.id}`,
    dateTime: new Date(venda.dataVenda),
    employeeName: venda.operador?.trim() || 'Operador',
    clientName: client?.name ?? 'Consumidor',
    paymentMethodId: venda.formaPagamento,
    status: venda.status,
    splitPayments: venda.splitPayments,
    items: venda.itens.map((item) => ({
      produtoId: item.produtoId,
      name: item.nome,
      qty: item.quantidade,
      unitPrice: item.precoUnitario,
      subtotal: item.subtotal,
    })),
    subtotal: venda.totalBruto,
    discount: venda.desconto,
    total: venda.totalLiquido,
    amountReceived: venda.amountReceived,
    change: venda.troco,
  }
}

/** Soma o valor de vendas de uma categoria (dinheiro/pix/cartão/crediário), decompondo pagamentos mistos pelo detalhamento salvo em `dados_extra`. */
function sumPaymentsReal(sales, methodId) {
  let total = 0
  for (const sale of sales) {
    if (sale.paymentMethodId === 'misto') {
      total += Number(sale.splitPayments?.[methodId] ?? 0)
      continue
    }
    if (bucketForPaymentMethod(sale.paymentMethodId) === methodId) total += sale.total
  }
  return total
}

const PERIOD_OPTIONS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7dias', label: 'Últimos 7 Dias' },
  { id: 'mes', label: 'Este Mês' },
]

function isInPeriod(offset, periodId, today, customRange) {
  if (periodId === 'hoje') return offset === 0
  if (periodId === 'ontem') return offset === 1
  if (periodId === '7dias') return offset <= 6

  if (periodId === 'personalizado') {
    if (!customRange?.start || !customRange?.end) return false
    const recordDate = new Date(today)
    recordDate.setHours(0, 0, 0, 0)
    recordDate.setDate(recordDate.getDate() - offset)
    return recordDate >= customRange.start && recordDate <= customRange.end
  }

  const recordDate = new Date(today)
  recordDate.setDate(recordDate.getDate() - offset)
  return recordDate.getMonth() === today.getMonth() && recordDate.getFullYear() === today.getFullYear()
}

/**
 * Agrega as vendas reais (não estornadas) de um período: faturamento, lucro
 * (aproximado — usa o `preco_custo` atual de cada produto, já que
 * `itens_venda` não guarda o custo no momento da venda), quebra por forma de
 * pagamento e ranking de produtos mais vendidos.
 */
function aggregatePeriod(periodId, paymentFilter, today, customRange, sales, costByProductId) {
  const periodSales = sales.filter(
    (sale) => sale.status !== 'estornada' && isInPeriod(daysAgo(sale.dateTime, today), periodId, today, customRange),
  )

  const grossAll = periodSales.reduce((sum, sale) => sum + sale.total, 0)

  let profitAll = 0
  const productsMap = new Map()
  for (const sale of periodSales) {
    for (const item of sale.items) {
      const cost = item.produtoId != null ? costByProductId.get(item.produtoId) : undefined
      if (cost != null) profitAll += (item.unitPrice - cost) * item.qty

      const key = item.produtoId ?? item.name
      const existing = productsMap.get(key) ?? { id: item.produtoId, name: item.name, qty: 0, revenue: 0 }
      existing.qty += item.qty
      existing.revenue += item.subtotal
      productsMap.set(key, existing)
    }
  }
  const profitRatio = grossAll > 0 ? profitAll / grossAll : 0

  const gross = paymentFilter === 'todos' ? grossAll : sumPaymentsReal(periodSales, paymentFilter)
  const profit = gross * profitRatio

  const payments = PAYMENT_METHODS.map((method) => ({
    ...method,
    amount: sumPaymentsReal(periodSales, method.id),
  }))

  const products = Array.from(productsMap.values()).sort((a, b) => b.revenue - a.revenue)
  const totalSales = products.reduce((sum, product) => sum + product.qty, 0)

  return { gross, profit, payments, products, totalSales }
}

function previousComparableGross(periodId, paymentFilter, today, sales) {
  let referenceOffsets = null
  if (periodId === 'hoje') referenceOffsets = [1]
  else if (periodId === 'ontem') referenceOffsets = [2]
  else if (periodId === '7dias') referenceOffsets = Array.from({ length: 7 }, (_, i) => i + 7)
  if (!referenceOffsets) return null

  const periodSales = sales.filter(
    (sale) => sale.status !== 'estornada' && referenceOffsets.includes(daysAgo(sale.dateTime, today)),
  )
  return paymentFilter === 'todos'
    ? periodSales.reduce((sum, sale) => sum + sale.total, 0)
    : sumPaymentsReal(periodSales, paymentFilter)
}

function parseAmount(value) {
  const parsed = Number.parseFloat((value ?? '').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function parseDateInput(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function periodRangeLabel(periodId, today, customRange) {
  if (periodId === 'hoje') return `Período: ${dateFormatter.format(today)}`

  if (periodId === 'ontem') {
    const day = new Date(today)
    day.setDate(day.getDate() - 1)
    return `Período: ${dateFormatter.format(day)}`
  }

  if (periodId === '7dias') {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return `Período: ${dateFormatter.format(start)} até ${dateFormatter.format(today)}`
  }

  if (periodId === 'mes') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return `Período: ${dateFormatter.format(start)} até ${dateFormatter.format(today)}`
  }

  if (periodId === 'personalizado' && customRange?.start && customRange?.end) {
    return `Período: ${dateFormatter.format(customRange.start)} até ${dateFormatter.format(customRange.end)}`
  }

  return 'Período: —'
}

function exportProductsCsv(products) {
  const header = 'Produto;Quantidade;Faturamento\n'
  const rows = products
    .map((product) => `${product.name};${product.qty};${product.revenue.toFixed(2).replace('.', ',')}`)
    .join('\n')
  const blob = new Blob([`${header}${rows}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `produtos-mais-vendidos-${dateFormatter.format(new Date()).replaceAll('/', '-')}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function StatCard({ label, value, trend, icon: Icon, tone }) {
  const TrendIcon = trend && trend.percent < 0 ? TrendingDown : TrendingUp
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid print:rounded-none print:border-slate-300 print:shadow-none">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <span className={clsx('flex h-9 w-9 items-center justify-center rounded-lg', tone.iconBg)}>
          <Icon size={18} className={tone.iconText} />
        </span>
      </div>
      <p className={clsx('text-3xl font-black tabular-nums', tone.value)}>{value}</p>
      {trend && (
        <p
          className={clsx(
            'flex items-center gap-1 text-xs font-medium',
            trend.percent < 0 ? 'text-red-600' : 'text-emerald-600',
          )}
        >
          <TrendIcon size={13} />
          {trend.percent >= 0 ? '+' : ''}
          {trend.percent.toFixed(0)}% vs. período anterior
        </p>
      )}
    </div>
  )
}

const EMPTY_MOVEMENT_FORM = { amount: '', description: '' }

export default function FinanceiroMain() {
  const { settings } = useStoreSettings()
  const { addMovement } = useCashRegister()
  const { products, isLoaded: productsLoaded, applyExternalUpdate: applyProductUpdate } = useProducts()
  const { clients, applyExternalUpdate: applyClientUpdate } = useClients()
  const { requestAuthorization } = useManagerAuth()
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [periodFilter, setPeriodFilter] = useState('hoje')
  const [paymentFilter, setPaymentFilter] = useState('todos')
  const [showCustomPanel, setShowCustomPanel] = useState(false)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [movementModal, setMovementModal] = useState(null)
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT_FORM)
  const [salesSearch, setSalesSearch] = useState('')
  const [selectedSale, setSelectedSale] = useState(null)
  const [confirmingVoid, setConfirmingVoid] = useState(false)
  const [sales, setSales] = useState([])
  const [receiptSale, setReceiptSale] = useState(null)

  const today = useMemo(() => new Date(), [])

  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])

  // Vendas reais, persistidas via `vendasRepo` (SQLite local no Tauri,
  // fallback em localStorage no navegador — ver src/services/db.js). Só
  // carrega depois que Produtos/Clientes terminam de carregar, já que
  // `toDashboardSale` resolve nome do produto/cliente a partir deles.
  useEffect(() => {
    if (!productsLoaded) return
    let cancelled = false
    const getProductName = (produtoId) => products.find((product) => product.id === produtoId)?.name
    vendasRepo.listWithItems(getProductName).then((list) => {
      if (cancelled) return
      setSales(list.map((venda) => toDashboardSale(venda, clientsById)))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoaded])

  const costByProductId = useMemo(() => new Map(products.map((product) => [product.id, product.costPrice])), [products])

  const dataInicioDate = useMemo(() => parseDateInput(dataInicio), [dataInicio])
  const dataFimDate = useMemo(() => {
    const parsed = parseDateInput(dataFim)
    if (!parsed) return null
    parsed.setHours(23, 59, 59, 999)
    return parsed
  }, [dataFim])

  const customRange = useMemo(
    () => ({ start: dataInicioDate, end: dataFimDate }),
    [dataInicioDate, dataFimDate],
  )

  const dashboard = useMemo(
    () => aggregatePeriod(periodFilter, paymentFilter, today, customRange, sales, costByProductId),
    [periodFilter, paymentFilter, today, customRange, sales, costByProductId],
  )

  const trend = useMemo(() => {
    const previousGross = previousComparableGross(periodFilter, paymentFilter, today, sales)
    if (previousGross === null || previousGross <= 0) return null
    return { percent: ((dashboard.gross - previousGross) / previousGross) * 100 }
  }, [periodFilter, paymentFilter, today, sales, dashboard.gross])

  const margin = dashboard.gross > 0 ? (dashboard.profit / dashboard.gross) * 100 : 0
  const activePaymentLabel = PAYMENT_METHODS.find((method) => method.id === paymentFilter)?.label
  const paymentsTotal = useMemo(
    () => dashboard.payments.reduce((sum, method) => sum + method.amount, 0),
    [dashboard.payments],
  )

  const filteredSales = useMemo(() => {
    const term = salesSearch.trim().toLowerCase()
    return sales.filter((sale) => {
      if (!isInPeriod(daysAgo(sale.dateTime, today), periodFilter, today, customRange)) return false
      if (!term) return true
      return sale.code.toLowerCase().includes(term) || sale.clientName.toLowerCase().includes(term)
    })
  }, [salesSearch, periodFilter, today, customRange, sales])

  function openCloseModal() {
    setShowCloseModal(true)
  }

  function closeModal() {
    setShowCloseModal(false)
  }

  function openMovementModal(type) {
    setMovementForm(EMPTY_MOVEMENT_FORM)
    setMovementModal(type)
  }

  function closeMovementModal() {
    setMovementModal(null)
  }

  function updateMovementField(field, value) {
    setMovementForm((prev) => ({ ...prev, [field]: value }))
  }

  function submitMovement(event) {
    event.preventDefault()
    const value = parseAmount(movementForm.amount)
    if (value <= 0) return
    const type = movementModal
    const description = movementForm.description.trim()

    if (type === 'sangria' && !description) return

    requestAuthorization({
      tipoAcao: type === 'sangria' ? MANAGER_ACTIONS.SANGRIA : MANAGER_ACTIONS.SUPRIMENTO,
      title: type === 'sangria' ? 'Autorizar Sangria de Caixa' : 'Autorizar Suprimento de Caixa',
      description: `Digite o PIN do Supervisor para confirmar esta ${
        type === 'sangria' ? 'retirada' : 'entrada'
      } de valor.`,
      detailLabel: `${type === 'sangria' ? 'Retirada' : 'Entrada'} de ${formatCurrency(value)}`,
      initialMotivo: description,
      detalhes: { valor: value, descricao: description },
      onAuthorized: () => {
        addMovement(type, value, description)
        setMovementModal(null)
      },
    })
  }

  function openSaleDetails(sale) {
    setSelectedSale(sale)
    setConfirmingVoid(false)
  }

  function closeSaleDetails() {
    setSelectedSale(null)
    setConfirmingVoid(false)
  }

  function requestVoidSale() {
    setConfirmingVoid(true)
  }

  function cancelVoidSale() {
    setConfirmingVoid(false)
  }

  function confirmVoidSale() {
    const saleId = selectedSale.id
    requestAuthorization({
      tipoAcao: MANAGER_ACTIONS.ESTORNO_VENDA,
      title: 'Autorizar Estorno de Venda',
      description: 'Digite o PIN do Supervisor e o motivo para confirmar o estorno.',
      detailLabel: `${selectedSale.code} · ${formatCurrency(selectedSale.total)}`,
      requireMotivo: true,
      motivoLabel: 'Motivo do estorno',
      motivoPlaceholder: 'Ex: cliente desistiu, produto trocado, erro de lançamento…',
      detalhes: { vendaId: saleId, valor: selectedSale.total },
      onAuthorized: (motivo) => executeVoidSale(saleId, motivo),
    })
  }

  function executeVoidSale(saleId, motivo) {
    vendasRepo
      .voidSale(saleId, motivo)
      .then((result) => {
        if (!result) return
        setSales((prev) => prev.map((sale) => (sale.id === saleId ? { ...sale, status: 'estornada' } : sale)))
        setSelectedSale((prev) => (prev && prev.id === saleId ? { ...prev, status: 'estornada' } : prev))
        result.produtosAtualizados.forEach((product) => applyProductUpdate(product))
        if (result.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)
      })
      .catch((error) => console.error('[financeiro] Falha ao estornar venda no banco de dados:', error))
    setConfirmingVoid(false)
  }

  function openReceipt(sale) {
    setReceiptSale({
      storeSettings: settings,
      documentType: 'cupom',
      saleCode: sale.code,
      dateTimeLabel: dateTimeFormatter.format(sale.dateTime),
      items: sale.items,
      subtotal: sale.subtotal,
      discount: sale.discount,
      paymentLabel: describePaymentMethod(sale.paymentMethodId).label,
      changeLabel: sale.change != null && sale.change > 0 ? formatCurrency(sale.change) : null,
      total: sale.total,
      footerMessage: settings.receiptFooter,
    })
  }

  function closeReceipt() {
    setReceiptSale(null)
  }

  // ESC fecha a modal de Detalhes da Venda — e, quando há uma sub-etapa
  // aberta por cima dela (recibo, confirmação de estorno), fecha só essa
  // camada, sem descartar a modal de detalhes inteira de uma vez.
  useEffect(() => {
    if (!selectedSale) return
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      if (receiptSale) {
        closeReceipt()
      } else if (confirmingVoid) {
        cancelVoidSale()
      } else {
        closeSaleDetails()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSale, receiptSale, confirmingVoid])

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden print:h-auto print:gap-2 print:overflow-visible">
      {/* Cabeçalho oficial do relatório: visível apenas na impressão */}
      <div className="hidden print:block">
        <div className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-3">
          <div className="flex items-start gap-3">
            {settings.logoDataUrl && (
              <img src={settings.logoDataUrl} alt="Logo" className="h-14 w-14 object-contain" />
            )}
            <div>
              <p className="text-base font-bold uppercase text-slate-900">
                {settings.fantasyName.trim() || 'Minha Loja'}
              </p>
              {settings.document.trim() && (
                <p className="text-xs text-slate-700">CNPJ/CPF: {settings.document}</p>
              )}
              {settings.address.trim() && <p className="text-xs text-slate-700">{settings.address}</p>}
              {settings.phone.trim() && <p className="text-xs text-slate-700">{settings.phone}</p>}
            </div>
          </div>
          <p className="whitespace-nowrap text-xs text-slate-600">
            Emitido em {dateFormatter.format(today)} às {timeFormatter.format(today)}
          </p>
        </div>

        <h1 className="mt-3 text-center text-lg font-black uppercase tracking-wide text-slate-900">
          Relatório Financeiro e Fechamento de Caixa
        </h1>
        <p className="mb-2 mt-1 text-center text-sm font-medium text-slate-700">
          {periodRangeLabel(periodFilter, today, customRange)}
        </p>
      </div>

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm print:hidden">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-500">Dashboard financeiro e fechamento de caixa</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openMovementModal('suprimento')}
            className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <PlusCircle size={16} />
            Suprimento (Entrada)
          </button>
          <button
            type="button"
            onClick={() => openMovementModal('sangria')}
            className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
          >
            <MinusCircle size={16} />
            Sangria (Retirada)
          </button>
          <button
            type="button"
            onClick={openCloseModal}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            <Lock size={16} />
            Fechar Caixa do Dia
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} className="shrink-0 text-slate-400" />
            <div className="flex flex-wrap items-center gap-1.5">
              {PERIOD_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPeriodFilter(id)
                    setShowCustomPanel(false)
                  }}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    periodFilter === id
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                      : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
                  )}
                >
                  {label}
                </button>
              ))}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFilter('personalizado')
                    setShowCustomPanel((prev) => !prev)
                  }}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                    periodFilter === 'personalizado'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                      : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
                  )}
                >
                  Personalizado
                </button>

                {showCustomPanel && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCustomPanel(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="data-inicio"
                            className="text-xs font-medium uppercase tracking-wide text-slate-500"
                          >
                            Data Inicial
                          </label>
                          <input
                            id="data-inicio"
                            type="date"
                            value={dataInicio}
                            max={dataFim || undefined}
                            onChange={(event) => setDataInicio(event.target.value)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor="data-fim"
                            className="text-xs font-medium uppercase tracking-wide text-slate-500"
                          >
                            Data Final
                          </label>
                          <input
                            id="data-fim"
                            type="date"
                            value={dataFim}
                            min={dataInicio || undefined}
                            onChange={(event) => setDataFim(event.target.value)}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowCustomPanel(false)}
                          className="mt-1 rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Aplicar
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="payment-filter" className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Forma de Pagamento
            </label>
            <select
              id="payment-filter"
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            >
              <option value="todos">Todas</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {periodFilter === 'personalizado' && (
          <p className="text-xs font-medium text-blue-600">
            {dataInicioDate && dataFimDate
              ? `Exibindo dados de ${dateFormatter.format(dataInicioDate)} até ${dateFormatter.format(dataFimDate)}`
              : 'Selecione a data inicial e final para exibir o período personalizado'}
          </p>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto print:h-auto print:min-h-0 print:flex-none print:overflow-visible">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-3">
          <StatCard
            label={`Faturamento Bruto${activePaymentLabel ? ` (${activePaymentLabel})` : ''}`}
            value={formatCurrency(dashboard.gross)}
            trend={trend}
            icon={DollarSign}
            tone={{ iconBg: 'bg-blue-50', iconText: 'text-blue-600', value: 'text-slate-900' }}
          />
          <StatCard
            label="Lucro Líquido Real"
            value={formatCurrency(dashboard.profit)}
            icon={TrendingUp}
            tone={{ iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', value: 'text-emerald-600' }}
          />
          <StatCard
            label="Total de Vendas"
            value={`${dashboard.totalSales} un.`}
            icon={ShoppingCart}
            tone={{ iconBg: 'bg-amber-50', iconText: 'text-amber-600', value: 'text-slate-900' }}
          />
          <StatCard
            label="Margem"
            value={`${margin.toFixed(1)}%`}
            icon={Percent}
            tone={{ iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', value: 'text-slate-900' }}
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid print:rounded-none print:border-slate-300 print:shadow-none">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Vendas por Forma de Pagamento
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 print:gap-3">
            {dashboard.payments.map((method) => {
              const tone = PAYMENT_TONE_CLASSES[method.tone]
              const percent = paymentsTotal > 0 ? (method.amount / paymentsTotal) * 100 : 0
              const Icon = method.icon
              return (
                <div
                  key={method.id}
                  className="rounded-lg border border-slate-100 p-4 print:break-inside-avoid print:border-slate-300"
                >
                  <div className="flex items-center justify-between">
                    <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', tone.iconBg)}>
                      <Icon size={16} className={tone.iconText} />
                    </span>
                    <span className="text-xs font-semibold text-slate-400">{percent.toFixed(1)}%</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-500">{method.label}</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">
                    {formatCurrency(method.amount)}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={clsx('h-full rounded-full', tone.bar)}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm print:rounded-none print:border-slate-300 print:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 print:border-slate-300">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Histórico de Vendas Realizadas
            </h2>
            <div className="relative print:hidden">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={salesSearch}
                onChange={(event) => setSalesSearch(event.target.value)}
                placeholder="Buscar por nº da venda ou cliente"
                className="w-64 rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
          <table className="w-full text-left text-sm print:border-collapse">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400 print:border-b print:border-slate-400 print:text-slate-600">
                <th className="px-5 py-2 print:px-2 print:py-1.5">Código</th>
                <th className="px-5 py-2 print:px-2 print:py-1.5">Data/Hora</th>
                <th className="px-5 py-2 print:px-2 print:py-1.5">Funcionário</th>
                <th className="px-5 py-2 print:px-2 print:py-1.5">Cliente</th>
                <th className="px-5 py-2 print:px-2 print:py-1.5">Forma de Pagamento</th>
                <th className="px-5 py-2 text-right print:px-2 print:py-1.5">Valor Total</th>
                <th className="px-5 py-2 text-right print:hidden">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 print:divide-slate-300">
              {filteredSales.map((sale) => {
                const method = describePaymentMethod(sale.paymentMethodId)
                const tone = PAYMENT_TONE_CLASSES[method.tone]
                const isVoided = sale.status === 'estornada'
                return (
                  <tr key={sale.id} className="hover:bg-slate-50 print:break-inside-avoid">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700 print:px-2 print:py-1.5">
                      {sale.code}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-600 print:px-2 print:py-1.5">
                      {dateTimeFormatter.format(sale.dateTime)}
                    </td>
                    <td className="px-5 py-3 text-slate-700 print:px-2 print:py-1.5">{sale.employeeName}</td>
                    <td className="px-5 py-3 text-slate-700 print:px-2 print:py-1.5">{sale.clientName}</td>
                    <td className="px-5 py-3 print:px-2 print:py-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                            tone.iconBg,
                            tone.iconText,
                          )}
                        >
                          {method.label}
                        </span>
                        {isVoided && (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            Estornada
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      className={clsx(
                        'px-5 py-3 text-right font-semibold tabular-nums print:px-2 print:py-1.5',
                        isVoided ? 'text-slate-400 line-through' : 'text-slate-800',
                      )}
                    >
                      {formatCurrency(sale.total)}
                    </td>
                    <td className="px-5 py-3 print:hidden">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openSaleDetails(sale)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          <Eye size={14} />
                          Ver Detalhes
                        </button>
                        <button
                          type="button"
                          onClick={() => openReceipt(sale)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                          aria-label={`Reimprimir recibo da venda ${sale.code}`}
                          title="Reimprimir Recibo"
                        >
                          <Printer size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredSales.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">
              Nenhuma venda encontrada para o período ou busca selecionados
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm print:mt-4 print:rounded-none print:border-slate-300 print:shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 print:border-slate-300">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Vendas do Período · Produtos Mais Vendidos
            </h2>
            <div className="flex items-center gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Printer size={14} />
                Exportar PDF / Imprimir Recibo
              </button>
              <button
                type="button"
                onClick={() => exportProductsCsv(dashboard.products)}
                disabled={dashboard.products.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileSpreadsheet size={14} />
                Exportar Excel/CSV
              </button>
            </div>
          </div>
          <table className="w-full text-left text-sm print:border-collapse">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400 print:border-b print:border-slate-400 print:text-slate-600">
                <th className="px-5 py-2 print:px-2 print:py-1.5">Produto</th>
                <th className="px-5 py-2 print:px-2 print:py-1.5">Qtd. Vendida</th>
                <th className="px-5 py-2 print:px-2 print:py-1.5">Faturamento</th>
                <th className="px-5 py-2 w-1/3 print:px-2 print:py-1.5">% do Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 print:divide-slate-300">
              {dashboard.products.map((product) => {
                const gross = dashboard.products.reduce((sum, item) => sum + item.revenue, 0)
                const percentOfGross = gross > 0 ? (product.revenue / gross) * 100 : 0
                return (
                  <tr key={product.id} className="hover:bg-slate-50 print:break-inside-avoid">
                    <td className="px-5 py-3 font-medium text-slate-800 print:px-2 print:py-1.5">
                      {product.name}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-600 print:px-2 print:py-1.5">
                      {product.qty} un.
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-800 print:px-2 print:py-1.5">
                      {formatCurrency(product.revenue)}
                    </td>
                    <td className="px-5 py-3 print:px-2 print:py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 print:border print:border-slate-300">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${Math.min(percentOfGross, 100)}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-xs text-slate-400">
                          {percentOfGross.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {dashboard.products.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">Nenhuma venda no período selecionado</p>
          )}
        </div>

        {/* Assinatura: visível apenas na impressão */}
        <div className="hidden print:mt-10 print:block print:break-inside-avoid">
          <div className="flex items-end justify-between gap-10 text-xs text-slate-600">
            <div className="flex-1 border-t border-slate-900 pt-2 text-center">
              Assinatura do Gerente/Operador
            </div>
            <div className="flex-1 border-t border-slate-900 pt-2 text-center">
              Data: ____ / ____ / ______
            </div>
          </div>
        </div>
      </div>

      {/* Modal: suprimento (entrada) ou sangria (retirada) de caixa */}
      {movementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:hidden">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                {movementModal === 'suprimento' ? (
                  <>
                    <PlusCircle size={18} className="text-emerald-600" />
                    Suprimento (Entrada)
                  </>
                ) : (
                  <>
                    <MinusCircle size={18} className="text-red-600" />
                    Sangria (Retirada)
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={closeMovementModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={submitMovement}>
              <div>
                <label
                  htmlFor="movement-amount"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Valor (R$)
                </label>
                <input
                  id="movement-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={movementForm.amount}
                  onChange={(event) => updateMovementField('amount', event.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="movement-description"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Descrição / Motivo{movementModal === 'sangria' ? '' : ' (opcional)'}
                </label>
                <input
                  id="movement-description"
                  type="text"
                  value={movementForm.description}
                  onChange={(event) => updateMovementField('description', event.target.value)}
                  placeholder={
                    movementModal === 'suprimento' ? 'Ex: Reforço de troco' : 'Ex: Pagamento a fornecedor'
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="mt-1.5 text-xs text-slate-400">
                  {movementModal === 'sangria'
                    ? 'Obrigatório — o PIN do Supervisor será solicitado para confirmar a retirada.'
                    : 'O PIN do Supervisor será solicitado para confirmar esta entrada.'}
                </p>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={closeMovementModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    parseAmount(movementForm.amount) <= 0 ||
                    (movementModal === 'sangria' && !movementForm.description.trim())
                  }
                  className={clsx(
                    'flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300',
                    movementModal === 'suprimento'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700',
                  )}
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: fechamento de caixa (sempre referente ao dia de hoje) */}
      <CashClosingModal open={showCloseModal} onClose={closeModal} />

      {/* Modal: detalhes da venda */}
      {selectedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:hidden">
          <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Detalhes da Venda</h2>
                <p className="font-mono text-xs text-slate-400">{selectedSale.code}</p>
              </div>
              <button
                type="button"
                onClick={closeSaleDetails}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {selectedSale.status === 'estornada' && (
              <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                <AlertTriangle size={13} />
                Esta venda foi estornada
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Funcionário</p>
                <p className="font-medium text-slate-800">{selectedSale.employeeName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cliente</p>
                <p className="font-medium text-slate-800">{selectedSale.clientName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data</p>
                <p className="font-medium tabular-nums text-slate-800">
                  {dateFormatter.format(selectedSale.dateTime)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Hora</p>
                <p className="font-medium tabular-nums text-slate-800">
                  {timeFormatter.format(selectedSale.dateTime)}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos</h3>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Qtd.</th>
                      <th className="px-3 py-2">Preço Unit.</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSale.items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-slate-700">{item.name}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">{item.qty}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">
                          {formatCurrency(item.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">
                          {formatCurrency(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(selectedSale.subtotal)}</span>
              </div>
              {selectedSale.discount > 0 && (
                <div className="flex items-center justify-between text-amber-600">
                  <span>Desconto</span>
                  <span className="tabular-nums">-{formatCurrency(selectedSale.discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-600">
                <span>Forma de Pagamento</span>
                <span className="font-medium text-slate-800">
                  {describePaymentMethod(selectedSale.paymentMethodId).label}
                </span>
              </div>
              {selectedSale.change != null && selectedSale.change > 0 && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Troco</span>
                  <span className="tabular-nums">{formatCurrency(selectedSale.change)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(selectedSale.total)}</span>
              </div>
            </div>

            {!confirmingVoid ? (
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => openReceipt(selectedSale)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Printer size={15} />
                  Reimprimir Recibo
                </button>
                <button
                  type="button"
                  onClick={requestVoidSale}
                  disabled={selectedSale.status === 'estornada'}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw size={15} />
                  {selectedSale.status === 'estornada' ? 'Venda Estornada' : 'Estornar Venda'}
                </button>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="mb-2 text-sm font-medium text-red-700">Confirmar estorno desta venda?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelVoidSale}
                    className="flex-1 rounded-lg border border-slate-300 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmVoidSale}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Confirmar Estorno
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ReceiptModal open={Boolean(receiptSale)} onClose={closeReceipt} receipt={receiptSale} />
    </div>
  )
}
