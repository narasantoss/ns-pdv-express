import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  X,
  Search,
  MapPin,
  Bike,
  MessageCircle,
  Printer,
  CheckCircle2,
  Undo2,
  Truck,
  ClipboardList,
  User,
  Banknote,
  QrCode,
  CreditCard,
  Minus,
  Trash2,
  AlertTriangle,
  PackageSearch,
  UserCog,
  IdCard,
  Clock,
  Route,
  Pencil,
  Wallet,
} from 'lucide-react'
import clsx from 'clsx'
import { onlyDigits, formatAddressSummary, EMPTY_ADDRESS } from '../../data/clients'
import { formatCurrency } from '../../utils/format'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useClients } from '../../context/ClientsContext'
import { useProducts } from '../../context/ProductsContext'
import { useDelivery } from '../../context/DeliveryContext'
import { printMotoboySlipWindow } from '../../utils/printReceiptWindow'
import PrintCopiesModal from '../common/PrintCopiesModal'

const EMPTY_MOTOBOY_FORM = { name: '', cpf: '', phone: '', plate: '' }

const PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro na Entrega', icon: Banknote },
  { id: 'pix', label: 'PIX', icon: QrCode },
  { id: 'cartao', label: 'Maquininha Cartão', icon: CreditCard },
]

// Rótulos de forma de pagamento usados nos cards/impressão — cobre tanto os
// 3 métodos oferecidos pelo formulário "Novo Pedido" deste módulo quanto os
// métodos de pagamento antecipado (Opção A do F2 no PDV), já que um pedido
// pode chegar de qualquer um dos dois fluxos.
const PAYMENT_METHOD_LABELS = {
  dinheiro: 'Dinheiro na Entrega',
  pix: 'PIX',
  cartao: 'Maquininha Cartão',
  'cartao-credito': 'Cartão de Crédito',
  'cartao-debito': 'Cartão de Débito',
}

function paymentMethodLabel(id) {
  return PAYMENT_METHOD_LABELS[id] ?? id
}

const STATUS_COLUMNS = [
  { id: 'pendente', label: 'Pendente / Em Separação', tone: 'amber' },
  { id: 'saiu', label: 'Saiu para Entrega', tone: 'sky' },
  { id: 'concluido', label: 'Concluído', tone: 'emerald' },
]

const STATUS_ORDER = STATUS_COLUMNS.map((column) => column.id)

const STATUS_TONE_CLASSES = {
  amber: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700', header: 'text-amber-700' },
  sky: { dot: 'bg-sky-500', badge: 'bg-sky-50 text-sky-700', header: 'text-sky-700' },
  emerald: { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700', header: 'text-emerald-700' },
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const expectedDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatExpectedDeliveryLabel(expectedDeliveryDate) {
  if (!expectedDeliveryDate) return null
  const parsed = new Date(`${expectedDeliveryDate}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : expectedDateFormatter.format(parsed)
}

function parseAmount(value) {
  const parsed = Number.parseFloat((value ?? '').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function orderSubtotal(order) {
  return order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

function orderTotal(order) {
  return orderSubtotal(order) + order.deliveryFee
}

function buildStatusMessage(order) {
  const isPaid = order.paymentStatus === 'pago'
  const totalLine = isPaid ? 'Pedido já pago' : `Total a pagar na entrega: ${formatCurrency(orderTotal(order))}`
  if (order.status === 'pendente') {
    return `Olá, ${order.clientName}! Recebemos seu pedido ${order.code} e ele já está em separação. ${isPaid ? totalLine : `Total: ${formatCurrency(orderTotal(order))}`}. Assim que sair para entrega você será avisado(a) por aqui.`
  }
  if (order.status === 'saiu') {
    return `Seu pedido ${order.code} saiu para entrega${order.motoboyName ? ` com ${order.motoboyName}` : ''} e chega em breve! ${totalLine}.`
  }
  return `Seu pedido ${order.code} foi entregue. Obrigado pela preferência!`
}

function buildMapsLink(address) {
  const query = encodeURIComponent(formatAddressSummary(address))
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

function buildMotoboyRouteMessage(order) {
  const total = orderTotal(order)
  const isPaid = order.paymentStatus === 'pago'
  const paymentLine = isPaid
    ? 'Já pago (NÃO cobrar do cliente)'
    : `${formatCurrency(total)} (${paymentMethodLabel(order.paymentMethod)})`
  const changeLine =
    !isPaid && order.paymentMethod === 'dinheiro' && order.changeFor > total
      ? `\nLevar troco para: ${formatCurrency(order.changeFor)}`
      : ''
  const referenceLine = order.referencePoint?.trim() ? `\nPonto de referência: ${order.referencePoint}` : ''

  return `Nova rota - Pedido ${order.code}\nCliente: ${order.clientName}\nEndereço: ${formatAddressSummary(order.address)}${referenceLine}\nValor a cobrar: ${paymentLine}${changeLine}\nRota no Google Maps: ${buildMapsLink(order.address)}`
}

function formatElapsedMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h${remainder}min` : `${hours}h`
}

function elapsedToneClass(minutes, status) {
  if (status === 'concluido') return 'text-slate-400'
  if (minutes >= 30) return 'text-red-600'
  if (minutes >= 15) return 'text-amber-600'
  return 'text-slate-400'
}

const EMPTY_ORDER_FORM = {
  clientId: null,
  clientName: '',
  clientPhone: '',
  address: { ...EMPTY_ADDRESS },
  referencePoint: '',
  expectedDeliveryDate: '',
  notes: '',
  items: [],
  deliveryFee: '',
  paymentMethod: 'dinheiro',
  changeFor: '',
  motoboyId: '',
}

export default function DeliveryMain() {
  const { settings } = useStoreSettings()
  const { clients } = useClients()
  const { products } = useProducts()
  const {
    orders,
    motoboys,
    createOrder,
    advanceStatus: setOrderStatus,
    assignMotoboy: assignOrderMotoboy,
    addMotoboy: createMotoboy,
    updateMotoboy: saveMotoboy,
    removeMotoboy: deleteMotoboy,
  } = useDelivery()
  const [showNewOrderModal, setShowNewOrderModal] = useState(false)
  const [orderForm, setOrderForm] = useState(EMPTY_ORDER_FORM)
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [productSearchTerm, setProductSearchTerm] = useState('')
  const [showMotoboyModal, setShowMotoboyModal] = useState(false)
  const [motoboyForm, setMotoboyForm] = useState(EMPTY_MOTOBOY_FORM)
  const [editingMotoboyId, setEditingMotoboyId] = useState(null)
  const [notifyTargetId, setNotifyTargetId] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [copiesPromptOrder, setCopiesPromptOrder] = useState(null)

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(intervalId)
  }, [])

  const filteredClients = useMemo(() => {
    const term = clientSearchTerm.trim().toLowerCase()
    if (!term) return []
    const termDigits = onlyDigits(clientSearchTerm)
    return clients.filter((client) => {
      const nameMatch = client.name.toLowerCase().includes(term)
      const phoneMatch = termDigits.length > 0 && onlyDigits(client.phone).includes(termDigits)
      return nameMatch || phoneMatch
    }).slice(0, 6)
  }, [clientSearchTerm, clients])

  const filteredProducts = useMemo(() => {
    const term = productSearchTerm.trim().toLowerCase()
    if (!term) return []
    return products.filter(
      (product) => product.name.toLowerCase().includes(term) || product.code.includes(term),
    ).slice(0, 6)
  }, [productSearchTerm, products])

  const formSubtotal = useMemo(
    () => orderForm.items.reduce((sum, item) => sum + item.price * item.qty, 0),
    [orderForm.items],
  )
  const formDeliveryFee = parseAmount(orderForm.deliveryFee)
  const formTotal = formSubtotal + formDeliveryFee
  const canSubmitOrder = orderForm.clientName.trim() && orderForm.items.length > 0

  const notifyOrder = useMemo(
    () => orders.find((order) => order.id === notifyTargetId) ?? null,
    [orders, notifyTargetId],
  )

  const ordersByStatus = useMemo(() => {
    const grouped = { pendente: [], saiu: [], concluido: [] }
    orders.forEach((order) => grouped[order.status]?.push(order))
    return grouped
  }, [orders])

  function openNewOrderModal() {
    setOrderForm(EMPTY_ORDER_FORM)
    setClientSearchTerm('')
    setProductSearchTerm('')
    setShowNewOrderModal(true)
  }

  function closeNewOrderModal() {
    setShowNewOrderModal(false)
  }

  function selectClientForOrder(client) {
    setOrderForm((prev) => ({
      ...prev,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      address: { ...client.address },
    }))
    setClientSearchTerm('')
  }

  function updateOrderField(field, value) {
    setOrderForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateOrderAddressField(field, value) {
    setOrderForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }))
  }

  function addProductToOrder(product) {
    setOrderForm((prev) => {
      const existing = prev.items.find((item) => item.id === product.id)
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === product.id ? { ...item, qty: item.qty + 1 } : item,
          ),
        }
      }
      return {
        ...prev,
        items: [...prev.items, { id: product.id, name: product.name, price: product.price, qty: 1 }],
      }
    })
    setProductSearchTerm('')
  }

  function updateOrderItemQty(id, delta) {
    setOrderForm((prev) => ({
      ...prev,
      items: prev.items
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0),
    }))
  }

  function removeOrderItem(id) {
    setOrderForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }))
  }

  function submitNewOrder(event) {
    event.preventDefault()
    if (!canSubmitOrder) return

    const motoboy = motoboys.find((item) => item.id === Number(orderForm.motoboyId)) ?? null

    createOrder({
      status: 'pendente',
      clientId: orderForm.clientId,
      clientName: orderForm.clientName.trim(),
      clientPhone: orderForm.clientPhone.trim(),
      address: orderForm.address,
      referencePoint: orderForm.referencePoint.trim(),
      expectedDeliveryDate: orderForm.expectedDeliveryDate || null,
      notes: orderForm.notes.trim(),
      items: orderForm.items,
      deliveryFee: formDeliveryFee,
      paymentMethod: orderForm.paymentMethod,
      changeFor: orderForm.paymentMethod === 'dinheiro' ? parseAmount(orderForm.changeFor) || null : null,
      motoboyId: motoboy?.id ?? null,
      motoboyName: motoboy?.name ?? null,
      // Pedidos criados diretamente aqui (fora do fechamento de venda do
      // PDV) não passam por uma liquidação no caixa — sempre cobrados pelo
      // motoboy no ato da entrega.
      paymentStatus: 'pendente',
    }).catch((error) => console.error('[delivery] Falha ao criar pedido no banco de dados:', error))

    setShowNewOrderModal(false)
  }

  function advanceStatus(orderId) {
    const order = orders.find((item) => item.id === orderId)
    if (!order) return
    const currentIndex = STATUS_ORDER.indexOf(order.status)
    const nextStatus = STATUS_ORDER[Math.min(currentIndex + 1, STATUS_ORDER.length - 1)]
    setOrderStatus(orderId, nextStatus).catch((error) =>
      console.error('[delivery] Falha ao avançar status do pedido:', error),
    )
  }

  function regressStatus(orderId) {
    const order = orders.find((item) => item.id === orderId)
    if (!order) return
    const currentIndex = STATUS_ORDER.indexOf(order.status)
    const previousStatus = STATUS_ORDER[Math.max(currentIndex - 1, 0)]
    setOrderStatus(orderId, previousStatus).catch((error) =>
      console.error('[delivery] Falha ao voltar status do pedido:', error),
    )
  }

  function assignMotoboy(orderId, motoboyId) {
    assignOrderMotoboy(orderId, motoboyId).catch((error) =>
      console.error('[delivery] Falha ao atribuir entregador ao pedido:', error),
    )
  }

  function openMotoboyModal() {
    setEditingMotoboyId(null)
    setMotoboyForm(EMPTY_MOTOBOY_FORM)
    setShowMotoboyModal(true)
  }

  function closeMotoboyModal() {
    setShowMotoboyModal(false)
    setEditingMotoboyId(null)
    setMotoboyForm(EMPTY_MOTOBOY_FORM)
  }

  function updateMotoboyField(field, value) {
    setMotoboyForm((prev) => ({ ...prev, [field]: value }))
  }

  function startEditMotoboy(motoboy) {
    setEditingMotoboyId(motoboy.id)
    setMotoboyForm({
      name: motoboy.name,
      cpf: motoboy.cpf,
      phone: motoboy.phone,
      plate: motoboy.plate,
    })
  }

  function cancelEditMotoboy() {
    setEditingMotoboyId(null)
    setMotoboyForm(EMPTY_MOTOBOY_FORM)
  }

  function submitMotoboyForm(event) {
    event.preventDefault()
    if (!motoboyForm.name.trim()) return

    const payload = {
      name: motoboyForm.name.trim(),
      cpf: motoboyForm.cpf.trim(),
      phone: motoboyForm.phone.trim(),
      plate: motoboyForm.plate.trim().toUpperCase(),
    }

    const action = editingMotoboyId ? saveMotoboy(editingMotoboyId, payload) : createMotoboy(payload)
    action.catch((error) => console.error('[delivery] Falha ao salvar entregador no banco de dados:', error))

    setEditingMotoboyId(null)
    setMotoboyForm(EMPTY_MOTOBOY_FORM)
  }

  function removeMotoboy(motoboyId) {
    deleteMotoboy(motoboyId).catch((error) =>
      console.error('[delivery] Falha ao remover entregador do banco de dados:', error),
    )
    if (editingMotoboyId === motoboyId) cancelEditMotoboy()
  }

  function openNotifyMenu(order) {
    setNotifyTargetId(order.id)
  }

  function closeNotifyMenu() {
    setNotifyTargetId(null)
  }

  function notifyClientWhatsApp(order) {
    const digits = onlyDigits(order.clientPhone)
    if (!digits) return
    const text = encodeURIComponent(buildStatusMessage(order))
    window.open(`https://wa.me/55${digits}?text=${text}`, '_blank', 'noopener,noreferrer')
    setNotifyTargetId(null)
  }

  function sendRouteToMotoboy(order) {
    const motoboy = motoboys.find((item) => item.id === order.motoboyId)
    const digits = onlyDigits(motoboy?.phone)
    if (!digits) return
    const text = encodeURIComponent(buildMotoboyRouteMessage(order))
    window.open(`https://wa.me/55${digits}?text=${text}`, '_blank', 'noopener,noreferrer')
    setNotifyTargetId(null)
  }

  function printMotoboySlip(order, copies = 1) {
    const paymentLabel = paymentMethodLabel(order.paymentMethod)
    const total = orderTotal(order)
    const changeForLabel =
      order.paymentMethod === 'dinheiro' && order.changeFor > total ? formatCurrency(order.changeFor) : null

    printMotoboySlipWindow({
      storeSettings: settings,
      width: 80,
      orderCode: order.code,
      dateTimeLabel: dateTimeFormatter.format(order.createdAt),
      clientName: order.clientName,
      clientPhone: order.clientPhone,
      address: order.address,
      referencePoint: order.referencePoint,
      expectedDeliveryLabel: formatExpectedDeliveryLabel(order.expectedDeliveryDate),
      notes: order.notes,
      items: order.items,
      subtotal: orderSubtotal(order),
      deliveryFee: order.deliveryFee,
      total,
      paymentLabel,
      changeForLabel,
      paymentStatus: order.paymentStatus ?? 'pendente',
      motoboyName: order.motoboyName,
      copies,
    })
  }

  function requestPrintMotoboySlip(order) {
    setCopiesPromptOrder(order)
  }

  function confirmPrintCopies(copies) {
    if (copiesPromptOrder) printMotoboySlip(copiesPromptOrder, copies)
    setCopiesPromptOrder(null)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Delivery</h1>
          <p className="text-sm text-slate-500">Acompanhamento de pedidos e entregadores em tempo real</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openMotoboyModal}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <UserCog size={16} />
            Gerenciar Entregadores
          </button>
          <button
            type="button"
            onClick={openNewOrderModal}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
          >
            <Plus size={18} />
            Novo Pedido
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-3">
        {STATUS_COLUMNS.map((column) => {
          const tone = STATUS_TONE_CLASSES[column.tone]
          const columnOrders = ordersByStatus[column.id]
          return (
            <section
              key={column.id}
              className="flex min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
            >
              <div className="flex shrink-0 items-center justify-between px-1">
                <p
                  className={clsx(
                    'flex items-center gap-2 text-xs font-bold uppercase tracking-wide',
                    tone.header,
                  )}
                >
                  <span className={clsx('h-2 w-2 rounded-full', tone.dot)} />
                  {column.label}
                </p>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', tone.badge)}>
                  {columnOrders.length}
                </span>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-0.5">
                {columnOrders.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-white/60 p-6 text-center text-slate-400">
                    <ClipboardList size={26} strokeWidth={1.5} />
                    <p className="text-xs">Nenhum pedido nesta etapa</p>
                  </div>
                )}

                {columnOrders.map((order) => (
                  <DeliveryOrderCard
                    key={order.id}
                    order={order}
                    motoboys={motoboys}
                    now={now}
                    onAdvance={() => advanceStatus(order.id)}
                    onRegress={() => regressStatus(order.id)}
                    onAssignMotoboy={(motoboyId) => assignMotoboy(order.id, motoboyId)}
                    onOpenNotify={() => openNotifyMenu(order)}
                    onPrint={() => requestPrintMotoboySlip(order)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {/* Modal: novo pedido de delivery */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Truck size={18} className="text-blue-600" />
                Novo Pedido de Delivery
              </h2>
              <button
                type="button"
                onClick={closeNewOrderModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitNewOrder} className="flex min-h-0 flex-1 flex-col">
              <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
                {/* Cliente */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <User size={13} />
                    Cliente
                  </h3>

                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      autoFocus
                      value={clientSearchTerm}
                      onChange={(event) => setClientSearchTerm(event.target.value)}
                      placeholder="Buscar cliente por telefone ou nome…"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />

                    {filteredClients.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                        {filteredClients.map((client) => (
                          <li key={client.id}>
                            <button
                              type="button"
                              onClick={() => selectClientForOrder(client)}
                              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-slate-800">{client.name}</span>
                                <span className="block text-xs text-slate-400">{client.phone}</span>
                              </span>
                              <span className="shrink-0 text-right text-xs text-slate-400">
                                {formatAddressSummary(client.address)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Nome do Cliente
                      </label>
                      <input
                        type="text"
                        value={orderForm.clientName}
                        onChange={(event) => updateOrderField('clientName', event.target.value)}
                        placeholder="Nome completo"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Telefone / WhatsApp
                      </label>
                      <input
                        type="text"
                        value={orderForm.clientPhone}
                        onChange={(event) => updateOrderField('clientPhone', event.target.value)}
                        placeholder="(11) 90000-0000"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Rua / Avenida
                      </label>
                      <input
                        type="text"
                        value={orderForm.address.street}
                        onChange={(event) => updateOrderAddressField('street', event.target.value)}
                        placeholder="Rua, Avenida…"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Número
                      </label>
                      <input
                        type="text"
                        value={orderForm.address.number}
                        onChange={(event) => updateOrderAddressField('number', event.target.value)}
                        placeholder="123"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Bairro
                      </label>
                      <input
                        type="text"
                        value={orderForm.address.neighborhood}
                        onChange={(event) => updateOrderAddressField('neighborhood', event.target.value)}
                        placeholder="Bairro"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Cidade
                      </label>
                      <input
                        type="text"
                        value={orderForm.address.city}
                        onChange={(event) => updateOrderAddressField('city', event.target.value)}
                        placeholder="Cidade - UF"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Ponto de Referência
                    </label>
                    <input
                      type="text"
                      value={orderForm.referencePoint}
                      onChange={(event) => updateOrderField('referencePoint', event.target.value)}
                      placeholder="Ex: Portão azul, ao lado do mercado"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Data Prevista de Entrega
                      </label>
                      <input
                        type="date"
                        value={orderForm.expectedDeliveryDate}
                        onChange={(event) => updateOrderField('expectedDeliveryDate', event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Observações
                    </label>
                    <textarea
                      rows={2}
                      value={orderForm.notes}
                      onChange={(event) => updateOrderField('notes', event.target.value)}
                      placeholder="Ex: sem cebola, entregar após as 18h…"
                      className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                {/* Itens */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <PackageSearch size={13} />
                    Itens do Pedido
                  </h3>

                  <div className="relative">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={productSearchTerm}
                      onChange={(event) => setProductSearchTerm(event.target.value)}
                      placeholder="Buscar produto por nome ou código…"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />

                    {filteredProducts.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                        {filteredProducts.map((product) => (
                          <li key={product.id}>
                            <button
                              type="button"
                              onClick={() => addProductToOrder(product)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                            >
                              <span className="text-slate-800">{product.name}</span>
                              <span className="font-semibold text-slate-500">
                                {formatCurrency(product.price)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
                    {orderForm.items.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-400">
                        Nenhum item adicionado ainda
                      </p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {orderForm.items.map((item) => (
                          <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                              {item.name}
                            </span>
                            <div className="flex items-center gap-1 rounded-md border border-slate-200">
                              <button
                                type="button"
                                onClick={() => updateOrderItemQty(item.id, -1)}
                                className="p-1 text-slate-500 hover:bg-slate-100"
                                aria-label="Diminuir quantidade"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="w-5 text-center text-xs font-medium tabular-nums">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateOrderItemQty(item.id, 1)}
                                className="p-1 text-slate-500 hover:bg-slate-100"
                                aria-label="Aumentar quantidade"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                            <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700">
                              {formatCurrency(item.price * item.qty)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeOrderItem(item.id)}
                              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                              aria-label="Remover item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Entrega e pagamento */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                    <Bike size={13} />
                    Entrega e Pagamento
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Taxa de Entrega (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={orderForm.deliveryFee}
                        onChange={(event) => updateOrderField('deliveryFee', event.target.value)}
                        placeholder="0,00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Troco para Quanto?
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={orderForm.paymentMethod !== 'dinheiro'}
                        value={orderForm.changeFor}
                        onChange={(event) => updateOrderField('changeFor', event.target.value)}
                        placeholder="0,00"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => updateOrderField('paymentMethod', id)}
                        className={clsx(
                          'flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 transition-all',
                          orderForm.paymentMethod === id
                            ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm shadow-blue-500/10'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        <Icon size={18} />
                        <span className="text-center text-xs font-semibold leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Motoboy / Entregador Responsável
                    </label>
                    <select
                      value={orderForm.motoboyId}
                      onChange={(event) => updateOrderField('motoboyId', event.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    >
                      <option value="">Atribuir depois</option>
                      {motoboys.map((motoboy) => (
                        <option key={motoboy.id} value={motoboy.id}>
                          {motoboy.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
                <div className="text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total do Pedido</p>
                  <p className="text-xl font-bold tabular-nums text-slate-900">{formatCurrency(formTotal)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeNewOrderModal}
                    className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmitOrder}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Criar Pedido
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: gerenciar entregadores (motoboys) */}
      {showMotoboyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <UserCog size={18} className="text-blue-600" />
                Gerenciar Entregadores
              </h2>
              <button
                type="button"
                onClick={closeMotoboyModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="overflow-hidden rounded-lg border border-slate-200">
                {motoboys.length === 0 ? (
                  <p className="p-4 text-center text-xs text-slate-400">
                    Nenhum entregador cadastrado ainda
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {motoboys.map((motoboy) => (
                      <li key={motoboy.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-600">
                          <Bike size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{motoboy.name}</p>
                          <p className="truncate text-xs text-slate-400">
                            {motoboy.phone || 'Sem WhatsApp'} · Placa {motoboy.plate || '—'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => startEditMotoboy(motoboy)}
                          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          aria-label={`Editar ${motoboy.name}`}
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMotoboy(motoboy.id)}
                          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          aria-label={`Remover ${motoboy.name}`}
                          title="Remover"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <form onSubmit={submitMotoboyForm} className="mt-4 space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {editingMotoboyId ? <Pencil size={12} /> : <Plus size={12} />}
                  {editingMotoboyId ? 'Editar Entregador' : 'Novo Entregador'}
                </p>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Nome Completo
                  </label>
                  <input
                    type="text"
                    value={motoboyForm.name}
                    onChange={(event) => updateMotoboyField('name', event.target.value)}
                    placeholder="Nome completo"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      CPF
                    </label>
                    <div className="relative mt-1">
                      <IdCard
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        type="text"
                        value={motoboyForm.cpf}
                        onChange={(event) => updateMotoboyField('cpf', event.target.value)}
                        placeholder="000.000.000-00"
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      WhatsApp
                    </label>
                    <input
                      type="text"
                      value={motoboyForm.phone}
                      onChange={(event) => updateMotoboyField('phone', event.target.value)}
                      placeholder="(11) 90000-0000"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Placa da Moto
                  </label>
                  <input
                    type="text"
                    value={motoboyForm.plate}
                    onChange={(event) => updateMotoboyField('plate', event.target.value.toUpperCase())}
                    placeholder="ABC1D23"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  {editingMotoboyId && (
                    <button
                      type="button"
                      onClick={cancelEditMotoboy}
                      className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Cancelar Edição
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={!motoboyForm.name.trim()}
                    className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {editingMotoboyId ? 'Salvar Alterações' : 'Adicionar Entregador'}
                  </button>
                </div>
              </form>
            </div>

            <div className="flex shrink-0 justify-end border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={closeMotoboyModal}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: disparo dual de WhatsApp (cliente vs motoboy) */}
      {notifyOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <MessageCircle size={18} className="text-emerald-600" />
                Notificar via WhatsApp
              </h2>
              <button
                type="button"
                onClick={closeNotifyMenu}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 text-xs text-slate-500">
              Pedido <span className="font-mono font-semibold text-slate-700">{notifyOrder.code}</span> ·{' '}
              {notifyOrder.clientName}
            </p>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => notifyClientWhatsApp(notifyOrder)}
                disabled={!onlyDigits(notifyOrder.clientPhone)}
                className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <MessageCircle size={16} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-emerald-800">
                    Notificar Cliente (Saiu p/ Entrega)
                  </span>
                  <span className="block text-xs text-emerald-700/80">
                    Envia a atualização de status formatada para o cliente
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => sendRouteToMotoboy(notifyOrder)}
                disabled={!notifyOrder.motoboyId || !onlyDigits(motoboys.find((m) => m.id === notifyOrder.motoboyId)?.phone)}
                className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-left transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <Route size={16} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-sky-800">
                    Enviar Rota para o Motoboy
                  </span>
                  <span className="block text-xs text-sky-700/80">
                    Endereço completo, valor a cobrar, troco e link do Google Maps
                  </span>
                </span>
              </button>
            </div>

            {!notifyOrder.motoboyId && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <AlertTriangle size={12} />
                Atribua um motoboy ao pedido para liberar o envio da rota
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal: seletor de vias antes de imprimir o cupom de entrega */}
      {copiesPromptOrder && (
        <PrintCopiesModal
          title="Cupom de Entrega"
          description={`Pedido ${copiesPromptOrder.code} — quantas vias deseja imprimir?`}
          onSelect={confirmPrintCopies}
          onClose={() => setCopiesPromptOrder(null)}
        />
      )}
    </div>
  )
}

function DeliveryOrderCard({ order, motoboys, now, onAdvance, onRegress, onAssignMotoboy, onOpenNotify, onPrint }) {
  const total = orderTotal(order)
  const paymentLabel = paymentMethodLabel(order.paymentMethod)
  const isPaid = order.paymentStatus === 'pago'
  const hasPhone = Boolean(onlyDigits(order.clientPhone))
  const elapsedMinutes = Math.max(0, Math.floor((now - order.createdAt) / 60000))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-slate-500">{order.code}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          {paymentLabel}
        </span>
      </div>

      <div className="mt-1.5">
        <span
          className={clsx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
            isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
          )}
        >
          {isPaid ? '🟢 PAGO' : '🟠 COBRAR NA ENTREGA'}
        </span>
      </div>

      <p className="mt-2 truncate text-sm font-semibold text-slate-800">{order.clientName}</p>

      <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        <span className="line-clamp-2">{formatAddressSummary(order.address)}</span>
      </p>

      <p
        className={clsx(
          'mt-1.5 flex items-center gap-1 text-[11px] font-medium',
          elapsedToneClass(elapsedMinutes, order.status),
        )}
      >
        <Clock size={11} />
        há {formatElapsedMinutes(elapsedMinutes)}
      </p>

      {order.paymentMethod === 'dinheiro' && order.changeFor > total && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">
          <Wallet size={13} className="shrink-0" />
          Levar troco para {formatCurrency(order.changeFor)}
        </div>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <Bike size={13} className={order.motoboyName ? 'shrink-0 text-sky-500' : 'shrink-0 text-slate-300'} />
        <select
          value={order.motoboyId ?? ''}
          onChange={(event) => onAssignMotoboy(event.target.value)}
          className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
        >
          <option value="">Motoboy não atribuído</option>
          {motoboys.map((motoboy) => (
            <option key={motoboy.id} value={motoboy.id}>
              {motoboy.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5">
        <span className="text-xs text-slate-400">Valor Total</span>
        <span className="text-base font-bold tabular-nums text-slate-900">{formatCurrency(total)}</span>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {order.status !== 'pendente' && (
          <button
            type="button"
            onClick={onRegress}
            className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            aria-label="Voltar etapa"
            title="Voltar etapa"
          >
            <Undo2 size={14} />
          </button>
        )}

        {order.status === 'pendente' && (
          <button
            type="button"
            onClick={onAdvance}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
          >
            <Bike size={13} />
            Saiu para Entrega
          </button>
        )}
        {order.status === 'saiu' && (
          <button
            type="button"
            onClick={onAdvance}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <CheckCircle2 size={13} />
            Concluir Entrega
          </button>
        )}
        {order.status === 'concluido' && (
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={13} />
            Pedido Entregue
          </span>
        )}

        <button
          type="button"
          onClick={onOpenNotify}
          disabled={!hasPhone && !order.motoboyId}
          className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-emerald-600 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Notificar via WhatsApp"
          title="Notificar via WhatsApp"
        >
          <MessageCircle size={14} />
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50"
          aria-label="Imprimir via do motoboy"
          title="Imprimir via do motoboy (58mm/80mm)"
        >
          <Printer size={14} />
        </button>
      </div>
    </div>
  )
}
