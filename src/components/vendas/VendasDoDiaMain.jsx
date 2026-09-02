import { useEffect, useMemo, useState } from 'react'
import {
  History,
  CalendarDays,
  Search,
  Eye,
  RotateCcw,
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  Banknote,
  QrCode,
  CreditCard,
  Wallet,
  MapPin,
  Bike,
  ShoppingCart,
  Route,
} from 'lucide-react'
import clsx from 'clsx'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useProducts } from '../../context/ProductsContext'
import { useClients } from '../../context/ClientsContext'
import { useSession } from '../../context/SessionContext'
import { useDelivery } from '../../context/DeliveryContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import { formatCurrency } from '../../utils/format'
import { formatAddressSummary } from '../../data/clients'
import { printReceiptWindow, printMotoboySlipWindow } from '../../utils/printReceiptWindow'
import PrintCopiesModal from '../common/PrintCopiesModal'
import { describePaymentMethod } from '../../data/paymentMethods'
import { vendasRepo, produtosRepo } from '../../services/db'

// Formas de pagamento aceitas na quitação (Receber na Entrega/Crediário) —
// exige que o operador informe exatamente o que recebeu, para o valor cair
// no bucket certo do Financeiro/Fechamento de Caixa.
const SETTLEMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote, emoji: '💵' },
  { id: 'pix', label: 'PIX', icon: QrCode, emoji: '📱' },
  { id: 'cartao-credito', label: 'Cartão de Crédito', icon: CreditCard, emoji: '💳' },
  { id: 'cartao-debito', label: 'Cartão de Débito', icon: Wallet, emoji: '💳' },
]

const PERIOD_OPTIONS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7dias', label: 'Últimos 7 Dias' },
  { id: 'mes', label: 'Este Mês' },
]

const TYPE_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'venda', label: 'Vendas PDV' },
  { id: 'delivery', label: 'Delivery' },
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function startOfDay(date) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  return start
}

function daysAgo(date, today) {
  return Math.round((startOfDay(today) - startOfDay(date)) / 86400000)
}

function isInPeriod(offset, periodId, today, customRange) {
  if (periodId === 'hoje') return offset === 0
  if (periodId === 'ontem') return offset === 1
  if (periodId === '7dias') return offset >= 0 && offset <= 6

  if (periodId === 'personalizado') {
    if (!customRange?.start || !customRange?.end) return false
    const recordDate = new Date(today)
    recordDate.setHours(0, 0, 0, 0)
    recordDate.setDate(recordDate.getDate() - offset)
    return recordDate >= customRange.start && recordDate <= customRange.end
  }

  // 'mes'
  const recordDate = new Date(today)
  recordDate.setDate(recordDate.getDate() - offset)
  return recordDate.getMonth() === today.getMonth() && recordDate.getFullYear() === today.getFullYear()
}

function parseDateInput(value) {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatExpectedDeliveryLabel(expectedDeliveryDate) {
  if (!expectedDeliveryDate) return null
  const parsed = new Date(`${expectedDeliveryDate}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : dateFormatter.format(parsed)
}

/** Normaliza uma venda real (`vendasRepo.listWithItems`) para o formato unificado exibido nesta tela. */
function toSaleRecord(venda, clientsById) {
  const client = venda.clienteId != null ? clientsById.get(venda.clienteId) : null
  return {
    kind: 'venda',
    key: `venda-${venda.id}`,
    id: venda.id,
    code: `#${venda.id}`,
    dateTime: new Date(venda.dataVenda),
    employeeName: venda.operador?.trim() || 'Operador',
    clientName: client?.name ?? 'Consumidor',
    clientPhone: client?.phone ?? '',
    paymentMethodId: venda.formaPagamento,
    paymentStatus: venda.formaPagamento === 'crediario' ? 'pendente' : 'pago',
    voided: venda.status === 'estornada',
    voidReason: venda.estornoMotivo,
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
    change: venda.troco,
    address: null,
    referencePoint: '',
    motoboyName: null,
    raw: venda,
  }
}

/** Normaliza um pedido de Delivery (`useDelivery().orders`) para o formato unificado exibido nesta tela. */
function toDeliveryRecord(order) {
  const itemsSubtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
  return {
    kind: 'delivery',
    key: `delivery-${order.id}`,
    id: order.id,
    code: order.code,
    dateTime: order.createdAt,
    employeeName: '—',
    clientName: order.clientName || 'Consumidor',
    clientPhone: order.clientPhone ?? '',
    paymentMethodId: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    voided: order.status === 'cancelado',
    voidReason: order.cancelReason,
    items: order.items.map((item) => ({
      produtoId: item.id,
      name: item.name,
      qty: item.qty,
      unitPrice: item.price,
      subtotal: item.price * item.qty,
    })),
    subtotal: itemsSubtotal,
    discount: 0,
    total: itemsSubtotal + (order.deliveryFee ?? 0),
    change: order.changeFor,
    address: order.address,
    referencePoint: order.referencePoint,
    motoboyName: order.motoboyName,
    deliveryStatus: order.status,
    raw: order,
  }
}

function periodRangeLabel(periodId, today, customRange) {
  if (periodId === 'hoje') return dateFormatter.format(today)
  if (periodId === 'ontem') {
    const day = new Date(today)
    day.setDate(day.getDate() - 1)
    return dateFormatter.format(day)
  }
  if (periodId === '7dias') {
    const start = new Date(today)
    start.setDate(start.getDate() - 6)
    return `${dateFormatter.format(start)} até ${dateFormatter.format(today)}`
  }
  if (periodId === 'mes') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    return `${dateFormatter.format(start)} até ${dateFormatter.format(today)}`
  }
  if (periodId === 'personalizado' && customRange?.start && customRange?.end) {
    return `${dateFormatter.format(customRange.start)} até ${dateFormatter.format(customRange.end)}`
  }
  return '—'
}

export default function VendasDoDiaMain() {
  const { settings } = useStoreSettings()
  const { products, isLoaded: productsLoaded, applyExternalUpdate: applyProductUpdate } = useProducts()
  const { clients, applyExternalUpdate: applyClientUpdate } = useClients()
  const { currentOperator } = useSession()
  const { requestAuthorization } = useManagerAuth()
  const {
    orders,
    settlePayment: settleDeliveryPayment,
    cancelOrder: cancelDeliveryOrder,
  } = useDelivery()

  const [periodFilter, setPeriodFilter] = useState('hoje')
  const [showCustomPanel, setShowCustomPanel] = useState(false)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [typeFilter, setTypeFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [sales, setSales] = useState([])
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [settleTarget, setSettleTarget] = useState(null)
  const [settleMethod, setSettleMethod] = useState(null)
  const [copiesPromptRecord, setCopiesPromptRecord] = useState(null)
  const [busyKey, setBusyKey] = useState(null)
  const [actionError, setActionError] = useState('')

  const today = useMemo(() => new Date(), [])
  const clientsById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients])

  // Vendas reais persistidas via `vendasRepo` (SQLite local no Tauri,
  // fallback em localStorage no navegador — ver src/services/db.js). Os
  // pedidos de Delivery já vêm prontos de `useDelivery()` (carregados uma
  // vez no root do app), então só as vendas precisam de um fetch aqui.
  useEffect(() => {
    if (!productsLoaded) return
    let cancelled = false
    const getProductName = (produtoId) => products.find((product) => product.id === produtoId)?.name
    vendasRepo.listWithItems(getProductName).then((list) => {
      if (cancelled) return
      setSales(list)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoaded])

  const dataInicioDate = useMemo(() => parseDateInput(dataInicio), [dataInicio])
  const dataFimDate = useMemo(() => {
    const parsed = parseDateInput(dataFim)
    if (!parsed) return null
    parsed.setHours(23, 59, 59, 999)
    return parsed
  }, [dataFim])
  const customRange = useMemo(() => ({ start: dataInicioDate, end: dataFimDate }), [dataInicioDate, dataFimDate])

  const records = useMemo(() => {
    // Vendas "sintéticas" criadas pela quitação de um pedido de Delivery
    // (`origemPedidoDeliveryId`) não entram na lista — o pedido já aparece
    // sozinho, agora marcado como Pago; listar os dois duplicaria a linha.
    const saleRecords = sales.filter((venda) => !venda.origemPedidoDeliveryId).map((venda) => toSaleRecord(venda, clientsById))
    const deliveryRecords = orders.map(toDeliveryRecord)
    return [...saleRecords, ...deliveryRecords].sort((a, b) => b.dateTime - a.dateTime)
  }, [sales, orders, clientsById])

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return records.filter((record) => {
      if (typeFilter !== 'todos' && record.kind !== typeFilter) return false
      if (!isInPeriod(daysAgo(record.dateTime, today), periodFilter, today, customRange)) return false
      if (!term) return true
      return (
        record.code.toLowerCase().includes(term) ||
        record.clientName.toLowerCase().includes(term) ||
        record.clientPhone.includes(term)
      )
    })
  }, [records, search, typeFilter, periodFilter, today, customRange])

  const periodTotal = useMemo(
    () => filteredRecords.filter((record) => !record.voided).reduce((sum, record) => sum + record.total, 0),
    [filteredRecords],
  )

  function openDetails(record) {
    setSelectedRecord(record)
  }

  function closeDetails() {
    setSelectedRecord(null)
  }

  function openSettle(record) {
    setActionError('')
    setSettleMethod(null)
    setSettleTarget(record)
  }

  function closeSettle() {
    setSettleTarget(null)
    setSettleMethod(null)
  }

  async function confirmSettle() {
    if (!settleTarget || !settleMethod) return
    const record = settleTarget
    setBusyKey(record.key)
    setActionError('')
    try {
      if (record.kind === 'venda') {
        const result = await vendasRepo.settlePayment(record.id, settleMethod)
        setSales((prev) => prev.map((venda) => (venda.id === record.id ? { ...venda, formaPagamento: settleMethod } : venda)))
        if (result?.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)
      } else {
        const order = record.raw
        const itens = order.items.map((item) => ({
          produtoId: item.id,
          quantidade: item.qty,
          precoUnitario: item.price,
        }))
        const totalBruto = itens.reduce((sum, item) => sum + item.precoUnitario * item.quantidade, 0)
        const totalLiquido = totalBruto + (order.deliveryFee ?? 0)
        const settlement = await vendasRepo.registerSettlement({
          clienteId: order.clientId ?? null,
          operador: currentOperator?.name ?? '',
          itens,
          totalBruto,
          desconto: 0,
          totalLiquido,
          formaPagamento: settleMethod,
          deductStock: !order.stockDeducted,
          origemPedidoDeliveryId: order.id,
        })
        settlement.produtosAtualizados?.forEach((product) => applyProductUpdate(product))
        await settleDeliveryPayment(order.id, settleMethod, settlement.id)
      }
      closeSettle()
    } catch (error) {
      console.error('[historico-vendas] Falha ao registrar quitação:', error)
      setActionError('Não foi possível registrar o recebimento. Tente novamente.')
    } finally {
      setBusyKey(null)
    }
  }

  function openCancel(record) {
    setActionError('')
    setCancelReason('')
    setCancelTarget(record)
  }

  function closeCancel() {
    setCancelTarget(null)
    setCancelReason('')
  }

  function confirmCancel() {
    if (!cancelTarget || !cancelReason.trim()) return
    const record = cancelTarget
    const motivo = cancelReason.trim()
    requestAuthorization({
      tipoAcao: record.kind === 'delivery' ? MANAGER_ACTIONS.CANCELAMENTO_PEDIDO : MANAGER_ACTIONS.ESTORNO_VENDA,
      title: record.kind === 'delivery' ? 'Autorizar Cancelamento de Pedido' : 'Autorizar Estorno de Venda',
      description: 'Digite o PIN do Supervisor para confirmar esta ação.',
      detailLabel: `${record.code} · ${formatCurrency(record.total)}`,
      initialMotivo: motivo,
      detalhes: { registro: record.key, valor: record.total },
      onAuthorized: () => executeCancel(record, motivo),
    })
  }

  async function executeCancel(record, motivo) {
    setBusyKey(record.key)
    setActionError('')
    try {
      if (record.kind === 'venda') {
        const result = await vendasRepo.voidSale(record.id, motivo)
        if (result) {
          setSales((prev) => prev.map((venda) => (venda.id === record.id ? { ...venda, status: 'estornada' } : venda)))
          result.produtosAtualizados.forEach((product) => applyProductUpdate(product))
          if (result.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)
        }
      } else {
        const order = record.raw
        if (order.vendaId) {
          // Já foi paga/quitada em algum momento — estornar a venda vinculada
          // já devolve o estoque e reverte o crediário, se houver.
          const result = await vendasRepo.voidSale(order.vendaId, motivo)
          if (result) {
            result.produtosAtualizados.forEach((product) => applyProductUpdate(product))
            if (result.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)
          }
        } else if (order.stockDeducted) {
          await Promise.all(
            order.items
              .filter((item) => item.id != null)
              .map((item) =>
                produtosRepo.adjustStock(item.id, item.qty).then((product) => product && applyProductUpdate(product)),
              ),
          )
        }
        await cancelDeliveryOrder(order.id, motivo)
      }
      closeCancel()
    } catch (error) {
      console.error('[historico-vendas] Falha ao estornar/cancelar:', error)
      setActionError('Não foi possível concluir o estorno/cancelamento. Tente novamente.')
    } finally {
      setBusyKey(null)
    }
  }

  function requestPrint(record) {
    setCopiesPromptRecord(record)
  }

  function printSaleReceipt(record, copies) {
    printReceiptWindow({
      storeSettings: settings,
      documentType: 'cupom',
      saleCode: record.code,
      dateTimeLabel: dateTimeFormatter.format(record.dateTime),
      items: record.items,
      subtotal: record.subtotal,
      discount: record.discount,
      paymentLabel: describePaymentMethod(record.paymentMethodId).label,
      changeLabel: record.change != null && record.change > 0 ? formatCurrency(record.change) : null,
      total: record.total,
      footerMessage: settings.receiptFooter,
      copies,
    })
  }

  function printDeliveryReceipt(record, copies) {
    const order = record.raw
    const changeForLabel =
      order.paymentMethod === 'dinheiro' && order.changeFor > record.total ? formatCurrency(order.changeFor) : null

    printMotoboySlipWindow({
      storeSettings: settings,
      width: 80,
      orderCode: order.code,
      dateTimeLabel: dateTimeFormatter.format(record.dateTime),
      clientName: order.clientName,
      clientPhone: order.clientPhone,
      address: order.address,
      referencePoint: order.referencePoint,
      expectedDeliveryLabel: formatExpectedDeliveryLabel(order.expectedDeliveryDate),
      notes: order.notes,
      items: order.items,
      subtotal: record.subtotal,
      deliveryFee: order.deliveryFee ?? 0,
      total: record.total,
      paymentLabel: describePaymentMethod(order.paymentMethod).label,
      changeForLabel,
      paymentStatus: order.paymentStatus ?? 'pendente',
      motoboyName: order.motoboyName,
      copies,
    })
  }

  function confirmPrintCopies(copies) {
    if (!copiesPromptRecord) return
    if (copiesPromptRecord.kind === 'venda') printSaleReceipt(copiesPromptRecord, copies)
    else printDeliveryReceipt(copiesPromptRecord, copies)
    setCopiesPromptRecord(null)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <History size={18} className="text-blue-600" />
            Histórico de Vendas
          </h1>
          <p className="text-sm text-slate-500">
            Controle total de vendas e pedidos de Delivery: quitação, estorno, detalhes e reimpressão
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {filteredRecords.length} {filteredRecords.length === 1 ? 'registro' : 'registros'} · {periodRangeLabel(periodFilter, today, customRange)}
          </p>
          <p className="text-xl font-bold tabular-nums text-slate-900">{formatCurrency(periodTotal)}</p>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
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
                  Intervalo Customizado
                </button>

                {showCustomPanel && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowCustomPanel(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label htmlFor="data-inicio" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            De
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
                          <label htmlFor="data-fim" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Até
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

          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, cliente ou telefone"
              className="w-64 rounded-lg border border-slate-300 bg-slate-50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  typeFilter === id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {periodFilter === 'personalizado' && (
            <p className="text-xs font-medium text-blue-600">
              {dataInicioDate && dataFimDate
                ? `Exibindo dados de ${dateFormatter.format(dataInicioDate)} até ${dateFormatter.format(dataFimDate)}`
                : 'Selecione a data inicial e final para exibir o período personalizado'}
            </p>
          )}
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Data/Hora</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Pagamento</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Valor</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRecords.map((record) => {
              const method = describePaymentMethod(record.paymentMethodId)
              const isBusy = busyKey === record.key
              const canSettle = record.paymentStatus === 'pendente' && !record.voided
              return (
                <tr key={record.key} className={clsx('hover:bg-slate-50', record.voided && 'opacity-60')}>
                  <td className="px-5 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        record.kind === 'delivery' ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600',
                      )}
                    >
                      {record.kind === 'delivery' ? <Bike size={12} /> : <ShoppingCart size={12} />}
                      {record.kind === 'delivery' ? 'Delivery' : 'Venda PDV'}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{record.code}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">{dateTimeFormatter.format(record.dateTime)}</td>
                  <td className="px-5 py-3 text-slate-700">{record.clientName}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {method.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                          record.paymentStatus === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                        )}
                      >
                        {record.paymentStatus === 'pago' ? '🟢 PAGO' : '🟠 PENDENTE'}
                      </span>
                      {record.voided && (
                        <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                          {record.kind === 'delivery' ? 'Cancelado' : 'Estornada'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={clsx('px-5 py-3 text-right font-semibold tabular-nums', record.voided ? 'text-slate-400 line-through' : 'text-slate-800')}>
                    {formatCurrency(record.total)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openDetails(record)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        title="Ver detalhes"
                      >
                        <Eye size={13} />
                        Detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => requestPrint(record)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                        aria-label={`Reimprimir ${record.code}`}
                        title="Reimprimir"
                      >
                        <Printer size={13} />
                      </button>
                      {canSettle && (
                        <button
                          type="button"
                          onClick={() => openSettle(record)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Marcar como Pago"
                        >
                          <CheckCircle2 size={13} />
                          Pago
                        </button>
                      )}
                      {!record.voided && (
                        <button
                          type="button"
                          onClick={() => openCancel(record)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          title={record.kind === 'delivery' ? 'Cancelar pedido' : 'Estornar venda'}
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredRecords.length === 0 && (
          <p className="p-8 text-center text-sm text-slate-400">
            Nenhuma venda ou pedido encontrado para o período/filtro selecionado
          </p>
        )}
      </div>

      {/* Modal: quitação (marcar como Pago) */}
      {settleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <CheckCircle2 size={18} className="text-emerald-600" />
                Marcar como Pago
              </h2>
              <button type="button" onClick={closeSettle} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {settleTarget.code} · {formatCurrency(settleTarget.total)} — selecione a forma de pagamento recebida
            </p>

            <div className="grid grid-cols-2 gap-2">
              {SETTLEMENT_METHODS.map(({ id, label, icon: Icon, emoji }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSettleMethod(id)}
                  className={clsx(
                    'flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all',
                    settleMethod === id
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-500/10'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <span className="flex items-center gap-1 text-lg leading-none">
                    <Icon size={18} />
                    {emoji}
                  </span>
                  <span className="text-center text-xs font-semibold leading-tight">{label}</span>
                </button>
              ))}
            </div>

            {actionError && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle size={13} />
                {actionError}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeSettle} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmSettle}
                disabled={!settleMethod || busyKey === settleTarget.key}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Confirmar Recebimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: estorno/cancelamento (com motivo) */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <RotateCcw size={18} className="text-red-600" />
                {cancelTarget.kind === 'delivery' ? 'Cancelar Pedido' : 'Estornar Venda'}
              </h2>
              <button type="button" onClick={closeCancel} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {cancelTarget.code} · {formatCurrency(cancelTarget.total)}
            </p>

            <label htmlFor="cancel-reason" className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Motivo do estorno/cancelamento
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              autoFocus
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Ex: cliente desistiu, produto trocado, erro de lançamento…"
              className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/30"
            />

            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <AlertTriangle size={13} className="shrink-0 text-amber-500" />
              A quantidade dos itens será devolvida ao estoque e o saldo do caixa será atualizado.
            </p>

            {actionError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle size={13} />
                {actionError}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={closeCancel} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmCancel}
                disabled={!cancelReason.trim() || busyKey === cancelTarget.key}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalhes da venda/pedido */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <Eye size={18} className="text-blue-600" />
                  Detalhes
                </h2>
                <p className="font-mono text-xs text-slate-400">
                  {selectedRecord.code} · {selectedRecord.kind === 'delivery' ? 'Pedido de Delivery' : 'Venda PDV'}
                </p>
              </div>
              <button type="button" onClick={closeDetails} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span
                className={clsx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black uppercase tracking-wide',
                  selectedRecord.paymentStatus === 'pago' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                )}
              >
                {selectedRecord.paymentStatus === 'pago' ? '🟢 PAGO' : '🟠 PENDENTE'}
              </span>
              {selectedRecord.voided && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                  <AlertTriangle size={11} />
                  {selectedRecord.kind === 'delivery' ? 'Cancelado' : 'Estornada'}
                  {selectedRecord.voidReason ? ` — ${selectedRecord.voidReason}` : ''}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Cliente</p>
                <p className="font-medium text-slate-800">{selectedRecord.clientName}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Telefone</p>
                <p className="font-medium text-slate-800">{selectedRecord.clientPhone || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Data</p>
                <p className="font-medium tabular-nums text-slate-800">{dateFormatter.format(selectedRecord.dateTime)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Hora</p>
                <p className="font-medium tabular-nums text-slate-800">{timeFormatter.format(selectedRecord.dateTime)}</p>
              </div>
              {selectedRecord.kind === 'venda' && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Funcionário</p>
                  <p className="font-medium text-slate-800">{selectedRecord.employeeName}</p>
                </div>
              )}
            </div>

            {selectedRecord.kind === 'delivery' && (
              <div className="mt-3 space-y-2 rounded-lg border border-sky-100 bg-sky-50/60 p-3 text-sm">
                <p className="flex items-start gap-1.5 text-slate-700">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-sky-600" />
                  <span>
                    {formatAddressSummary(selectedRecord.address)}
                    {selectedRecord.referencePoint?.trim() && (
                      <span className="block text-xs text-slate-500">Referência: {selectedRecord.referencePoint}</span>
                    )}
                  </span>
                </p>
                <p className="flex items-center gap-1.5 text-slate-700">
                  <Route size={14} className="shrink-0 text-sky-600" />
                  {selectedRecord.motoboyName ? (
                    <span>
                      Entregador: <span className="font-medium">{selectedRecord.motoboyName}</span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Entregador ainda não atribuído</span>
                  )}
                </p>
              </div>
            )}

            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Produtos {selectedRecord.kind === 'delivery' ? '(itens e variações)' : ''}
              </h3>
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
                    {selectedRecord.items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-slate-700">{item.name}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">{item.qty}</td>
                        <td className="px-3 py-2 tabular-nums text-slate-600">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-800">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatCurrency(selectedRecord.subtotal)}</span>
              </div>
              {selectedRecord.discount > 0 && (
                <div className="flex items-center justify-between text-amber-600">
                  <span>Desconto</span>
                  <span className="tabular-nums">-{formatCurrency(selectedRecord.discount)}</span>
                </div>
              )}
              {selectedRecord.kind === 'delivery' && selectedRecord.total > selectedRecord.subtotal && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Taxa de Entrega</span>
                  <span className="tabular-nums">{formatCurrency(selectedRecord.total - selectedRecord.subtotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-600">
                <span>Forma de Pagamento</span>
                <span className="font-medium text-slate-800">{describePaymentMethod(selectedRecord.paymentMethodId).label}</span>
              </div>
              {selectedRecord.change != null && selectedRecord.change > 0 && (
                <div className="flex items-center justify-between text-slate-600">
                  <span>Troco</span>
                  <span className="tabular-nums">{formatCurrency(selectedRecord.change)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(selectedRecord.total)}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => requestPrint(selectedRecord)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer size={15} />
                Reimprimir
              </button>
              {selectedRecord.paymentStatus === 'pendente' && !selectedRecord.voided && (
                <button
                  type="button"
                  onClick={() => {
                    closeDetails()
                    openSettle(selectedRecord)
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <CheckCircle2 size={15} />
                  Marcar como Pago
                </button>
              )}
              {!selectedRecord.voided && (
                <button
                  type="button"
                  onClick={() => {
                    closeDetails()
                    openCancel(selectedRecord)
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <RotateCcw size={15} />
                  {selectedRecord.kind === 'delivery' ? 'Cancelar Pedido' : 'Estornar Venda'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: seletor de vias antes de reimprimir */}
      {copiesPromptRecord && (
        <PrintCopiesModal
          title="Reimprimir Cupom"
          description={`${copiesPromptRecord.code} — quantas vias deseja imprimir?`}
          onSelect={confirmPrintCopies}
          onClose={() => setCopiesPromptRecord(null)}
        />
      )}
    </div>
  )
}
