import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  ScanBarcode,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Banknote,
  QrCode,
  CreditCard,
  CalendarClock,
  X,
  CheckCircle2,
  AlertTriangle,
  Eraser,
  LogOut,
  UserPlus,
  User,
  MapPin,
  Phone,
  Percent,
  UserSearch,
  Layers,
  Tag,
  Receipt,
  ScrollText,
  Ban,
  Volume2,
  VolumeX,
  PlusCircle,
  MinusCircle,
  Lock,
  Wallet,
  Copy,
  IdCard,
  LayoutGrid,
  Clock,
  ArrowRightCircle,
  ClipboardList,
  Send,
  ScanSearch,
  Truck,
  CalendarDays,
  StickyNote,
  Palette,
  PackageCheck,
  Scale,
} from 'lucide-react'
import clsx from 'clsx'
import { onlyDigits, formatAddressSummary, EMPTY_ADDRESS } from '../../data/clients'
import { formatCurrency, roundCurrency, roundQty } from '../../utils/format'
import { parseScaleBarcode, normalizeScaleCode } from '../../utils/scaleBarcode'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useCashRegister } from '../../context/CashRegisterContext'
import { useAccessControl } from '../../context/AccessControlContext'
import { useSession } from '../../context/SessionContext'
import { usePendingSale } from '../../context/PendingSaleContext'
import { useProducts } from '../../context/ProductsContext'
import { useClients } from '../../context/ClientsContext'
import { useDelivery } from '../../context/DeliveryContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import { printReceiptWindow, printMotoboySlipWindow } from '../../utils/printReceiptWindow'
import PrintCopiesModal from '../common/PrintCopiesModal'
import {
  isSoundMuted,
  setSoundMuted,
  playBeepSuccess,
  playBeepError,
  playBeepFinish,
  playBeepRemove,
  playBeepPriceCheck,
} from '../../utils/sounds'
import CashClosingModal from '../financeiro/CashClosingModal'
import { loadComandas, persistComandas } from '../../lib/database'
import { vendasRepo, produtosRepo } from '../../services/db'

const PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote, shortcut: '1' },
  { id: 'pix', label: 'PIX', icon: QrCode, shortcut: '2' },
  { id: 'cartao-credito', label: 'Cartão de Crédito', icon: CreditCard, shortcut: '3' },
  { id: 'cartao-debito', label: 'Cartão de Débito', icon: Wallet, shortcut: '4' },
  { id: 'misto', label: 'Pagamento Misto', icon: Layers, shortcut: '5' },
  { id: 'crediario', label: 'Crediário', icon: CalendarClock },
]

// Formas de pagamento aceitas para pedidos enviados ao Delivery com
// cobrança na entrega (Opção B) — o pagamento acontece só na entrega, então
// nem Crediário (exige aprovação de limite agora) nem Pagamento Misto (exige
// fechar o troco agora) fazem sentido aqui. Os ids batem com os já usados
// por DeliveryMain/deliveryRepo.
const DELIVERY_PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro na Entrega', icon: Banknote },
  { id: 'pix', label: 'PIX', icon: QrCode },
  { id: 'cartao', label: 'Maquininha Cartão', icon: CreditCard },
]

// Formas de pagamento aceitas para pedidos de Delivery já pagos no caixa
// (Opção A) — mesmo subconjunto do PAYMENT_METHODS da venda normal, exceto
// Crediário e Pagamento Misto, que não fazem sentido para um único pagamento
// à vista antecipado.
const DELIVERY_ADVANCE_PAYMENT_METHODS = PAYMENT_METHODS.filter(
  (method) => method.id !== 'misto' && method.id !== 'crediario',
)

/** Rótulo de forma de pagamento para o cupom de Delivery, cobrindo tanto as
 * formas "pago no caixa" (PAYMENT_METHODS) quanto "cobrar na entrega"
 * (DELIVERY_PAYMENT_METHODS), já que um pedido pode ter vindo de qualquer um
 * dos dois fluxos. */
function deliveryPaymentMethodLabel(id) {
  return (
    PAYMENT_METHODS.find((method) => method.id === id)?.label ??
    DELIVERY_PAYMENT_METHODS.find((method) => method.id === id)?.label ??
    id
  )
}

const EMPTY_DELIVERY_FORM = {
  clientName: '',
  phone: '',
  address: { ...EMPTY_ADDRESS },
  referencePoint: '',
  expectedDeliveryDate: '',
  notes: '',
}

/** "Azul / Tam M" — mesma convenção de rótulo usada no cadastro de produtos (EstoqueMain). */
function variationLabel(variation) {
  if (!variation) return ''
  return [variation.color, variation.size ? `Tam ${variation.size}` : null].filter(Boolean).join(' / ')
}

/**
 * Identidade estável de uma variação (tamanho/cor) dentro do produto — usada
 * para diferenciar linhas do carrinho e para a baixa de estoque por
 * variação, em vez do `code` (código de barras da variação), que é um campo
 * opcional em EstoqueMain e costuma ficar em branco quando o lojista não
 * cadastra um EAN próprio por combinação. Duas combinações do mesmo produto
 * nunca repetem o par tamanho/cor (EstoqueMain gera o produto cartesiano
 * único de tamanhos × cores), então essa chave é sempre única por produto.
 */
function variationStockKey(variation) {
  if (!variation) return null
  return `${variation.size ?? ''}__${variation.color ?? ''}`
}

function cartLineName(item) {
  return item.variationLabel ? `${item.name} - ${item.variationLabel}` : item.name
}

// Unidades fracionadas (pesáveis/por medida) — exibidas com 3 casas decimais
// e passo de 0,1 no carrinho, em vez do passo inteiro (+1/-1) usado por
// produtos vendidos por unidade/par/caixa.
const FRACTIONAL_UNITS = new Set(['KG', 'G', 'MT', 'L'])

function isFractionalUnit(unit) {
  return FRACTIONAL_UNITS.has(unit)
}

function formatCartQty(qty, unit) {
  return isFractionalUnit(unit) ? qty.toFixed(3) : String(qty)
}

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

const QUICK_CASH_OPTIONS = [20, 50, 100, 200]

const INSTALLMENT_OPTIONS = [1, 2, 3, 4, 5, 6, 10, 12]

const TOTAL_COMANDAS = 30

function createInitialComandas() {
  return Array.from({ length: TOTAL_COMANDAS }, (_, index) => ({
    id: index + 1,
    status: 'livre',
    items: [],
    openedAt: null,
  }))
}

function comandaSubtotal(comanda) {
  return comanda.items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

function formatElapsedTime(openedAt, now) {
  if (!openedAt) return null
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(openedAt).getTime()) / 60000))
  if (minutes < 1) return 'há poucos segundos'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `há ${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ''}`
}

const RECEIPT_OPTIONS = [
  {
    id: 'cupom',
    label: 'Imprimir Cupom Não Fiscal',
    description: 'Impressora térmica 58mm/80mm',
    icon: Receipt,
  },
  {
    id: 'nfce',
    label: 'Emitir NFC-e / Fiscal',
    description: 'Transmissão para a SEFAZ com QR Code',
    icon: ScrollText,
  },
  {
    id: 'sem-impressao',
    label: 'Finalizar sem Imprimir',
    description: 'Não gera cupom nem nota fiscal',
    icon: Ban,
  },
]

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

const receiptDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function parseAmount(value) {
  const parsed = Number.parseFloat((value ?? '').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const EMPTY_NEW_CLIENT_FORM = {
  cpfCnpj: '',
  name: '',
  phone: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  city: '',
  creditLimit: '',
}

const EMPTY_MOVEMENT_FORM = { amount: '', description: '' }

function clientFieldClasses(invalid) {
  return clsx(
    'mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2',
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/30',
  )
}

const SHORTCUT_TONE_CLASSES = {
  emerald:
    'bg-emerald-600 border-emerald-800 hover:bg-emerald-500 focus-visible:ring-emerald-400',
  amber:
    'bg-amber-500 border-amber-700 hover:bg-amber-400 focus-visible:ring-amber-300',
  slate:
    'bg-slate-700 border-slate-900 hover:bg-slate-600 focus-visible:ring-slate-400',
  sky:
    'bg-sky-600 border-sky-800 hover:bg-sky-500 focus-visible:ring-sky-400',
  violet:
    'bg-violet-600 border-violet-800 hover:bg-violet-500 focus-visible:ring-violet-400',
  teal:
    'bg-teal-600 border-teal-800 hover:bg-teal-500 focus-visible:ring-teal-400',
}

function ShortcutButton({ keyLabel, description, icon: Icon, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex h-full min-h-[72px] flex-1 flex-col items-center justify-center gap-1 rounded-lg border-b-4 p-2 text-white shadow-sm transition-all active:translate-y-0.5 active:border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        SHORTCUT_TONE_CLASSES[tone],
      )}
    >
      <kbd className="flex shrink-0 items-center gap-1 rounded border border-white/30 bg-black/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-wide">
        <Icon size={12} />
        {keyLabel}
      </kbd>
      <span className="w-full text-center text-[11px] font-bold uppercase leading-tight tracking-tight">
        {description}
      </span>
    </button>
  )
}

function ComandaCard({ comanda, now, onClick }) {
  const isOcupada = comanda.status === 'ocupada'
  const codeLabel = String(comanda.id).padStart(2, '0')

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all',
        isOcupada
          ? 'border-sky-300 bg-sky-50 hover:border-sky-400 hover:shadow-md hover:shadow-sky-500/10'
          : 'border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-500/10',
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={clsx(
            'font-mono text-sm font-black',
            isOcupada ? 'text-sky-800' : 'text-emerald-800',
          )}
        >
          #{codeLabel}
        </span>
        <span
          className={clsx(
            'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
            isOcupada ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white',
          )}
        >
          {isOcupada ? 'Ocupada' : 'Livre'}
        </span>
      </div>

      {isOcupada ? (
        <>
          <span className="text-base font-bold tabular-nums text-sky-900">
            {formatCurrency(comandaSubtotal(comanda))}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-sky-600">
            <Clock size={11} />
            {formatElapsedTime(comanda.openedAt, now)}
          </span>
        </>
      ) : (
        <span className="text-[10px] font-medium text-emerald-600">Toque para abrir</span>
      )}
    </button>
  )
}

export default function PDVMain({ onExit, onGoToDelivery } = {}) {
  const { settings } = useStoreSettings()
  const { addMovement } = useCashRegister()
  const { isBalcaoMode } = useAccessControl()
  const { currentOperator } = useSession()
  const { requestAuthorization } = useManagerAuth()
  const { pendingSale, consumePendingSale } = usePendingSale()
  const { products, applyExternalUpdate: applyProductUpdate, isLoaded: productsLoaded } = useProducts()
  const { clients, applyExternalUpdate: applyClientUpdate, createClient } = useClients()
  const { createOrder: createDeliveryOrder, linkVenda: linkDeliveryVenda } = useDelivery()
  const MOCK_PRODUCTS = useMemo(
    () =>
      products.map((product) => ({
        id: product.id,
        code: product.code,
        name: product.name,
        price: product.price,
        stock: product.stock,
        unit: product.unit ?? 'UN',
        weighable: Boolean(product.weighable),
        scaleCode: product.scaleCode ?? '',
        hasVariations: Boolean(product.hasVariations),
        variations: product.variations ?? [],
      })),
    [products],
  )
  const [searchTerm, setSearchTerm] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('dinheiro')
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [amountReceived, setAmountReceived] = useState('')
  const [successMessage, setSuccessMessage] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [clientSearchTerm, setClientSearchTerm] = useState('')
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [showNewClientModal, setShowNewClientModal] = useState(false)
  const [newClientForm, setNewClientForm] = useState(EMPTY_NEW_CLIENT_FORM)
  const [newClientAttemptedSubmit, setNewClientAttemptedSubmit] = useState(false)
  const [discount, setDiscount] = useState(null)
  const [showDiscountModal, setShowDiscountModal] = useState(false)
  const [discountDraftType, setDiscountDraftType] = useState('value')
  const [discountDraftValue, setDiscountDraftValue] = useState('')
  const [showClientLinkModal, setShowClientLinkModal] = useState(false)
  const [showWeightSaleModal, setShowWeightSaleModal] = useState(false)
  const [weightSaleProductId, setWeightSaleProductId] = useState('')
  const [weightSaleInput, setWeightSaleInput] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [splitPayments, setSplitPayments] = useState({ dinheiro: '', cartao: '', pix: '' })
  const [receiptOption, setReceiptOption] = useState('cupom')
  const [soundMuted, setSoundMutedState] = useState(() => isSoundMuted())
  const [movementModal, setMovementModal] = useState(null)
  const [movementForm, setMovementForm] = useState(EMPTY_MOVEMENT_FORM)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [installments, setInstallments] = useState(1)
  const [noteDocument, setNoteDocument] = useState('')
  const [comandas, setComandas] = useState(createInitialComandas)
  const [showComandasModal, setShowComandasModal] = useState(false)
  const [comandaView, setComandaView] = useState('grid')
  const [activeComandaId, setActiveComandaId] = useState(null)
  const [comandaProductSearch, setComandaProductSearch] = useState('')
  const [activeComandaLabel, setActiveComandaLabel] = useState(null)
  const [awaitingComandaHandoff, setAwaitingComandaHandoff] = useState(false)
  const [showPriceCheckModal, setShowPriceCheckModal] = useState(false)
  const [priceCheckSearch, setPriceCheckSearch] = useState('')
  const [priceCheckResult, setPriceCheckResult] = useState(null)
  const [priceCheckNotFound, setPriceCheckNotFound] = useState(false)
  const [variationPicker, setVariationPicker] = useState(null)
  const [isDeliveryMode, setIsDeliveryMode] = useState(false)
  const [deliveryForm, setDeliveryForm] = useState(EMPTY_DELIVERY_FORM)
  // 'pago': Opção A — já pago no caixa (PIX/Cartão/Dinheiro antecipado).
  // 'pendente': Opção B — motoboy cobra na entrega (troco/maquininha).
  const [deliverySettlementType, setDeliverySettlementType] = useState('pendente')
  const [deliveryPaymentMethod, setDeliveryPaymentMethod] = useState('dinheiro')
  const [deliveryChangeFor, setDeliveryChangeFor] = useState('')
  const [copiesPromptOrder, setCopiesPromptOrder] = useState(null)

  const searchInputRef = useRef(null)
  const priceCheckInputRef = useRef(null)
  const clientSearchInputRef = useRef(null)
  const discountInputRef = useRef(null)
  const weightSaleInputRef = useRef(null)
  const amountReceivedInputRef = useRef(null)
  const splitDinheiroInputRef = useRef(null)
  const noteDocumentInputRef = useRef(null)
  const comandaProductSearchInputRef = useRef(null)
  const notFoundTimeoutRef = useRef(null)
  const successTimeoutRef = useRef(null)
  const comandasLoadedRef = useRef(false)
  const comandasPersistTimeoutRef = useRef(null)

  const subtotal = useMemo(
    () => roundCurrency(cart.reduce((sum, item) => sum + roundCurrency(item.price * item.qty), 0)),
    [cart],
  )
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.qty, 0),
    [cart],
  )

  /**
   * Itens do carrinho cujo pedido excede o saldo real em estoque — para
   * produto com grade, confere a variação (tamanho/cor) exata escolhida, não
   * o estoque agregado do produto-pai. Usado para bloquear a finalização da
   * venda (ou exigir PIN do Gerente para vender mesmo assim — ver `finalizeSale`).
   */
  const cartStockIssues = useMemo(() => {
    return cart
      .map((item) => {
        const product = MOCK_PRODUCTS.find((entry) => entry.id === item.productId)
        if (!product) return null
        const available = item.variationCode
          ? Number.parseInt(
              product.variations.find((variation) => variationStockKey(variation) === item.variationCode)?.stock,
              10,
            ) || 0
          : Number.parseInt(product.stock, 10) || 0
        if (item.qty > available) {
          return { id: item.id, name: cartLineName(item), available, requested: item.qty }
        }
        return null
      })
      .filter(Boolean)
  }, [cart, MOCK_PRODUCTS])

  const discountAmount = discount
    ? Math.min(
        subtotal,
        discount.type === 'percent' ? subtotal * (discount.amount / 100) : discount.amount,
      )
    : 0
  const total = Math.max(0, roundCurrency(subtotal - discountAmount))

  const receivedValue = Number.parseFloat(amountReceived.replace(',', '.'))
  const troco = Number.isFinite(receivedValue) ? receivedValue - total : null
  const isCashInsufficient =
    paymentMethod === 'dinheiro' && (!Number.isFinite(receivedValue) || troco < 0)

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null
  const creditAvailable = selectedClient ? selectedClient.creditLimit - selectedClient.balance : 0
  const isCreditInsufficient = Boolean(selectedClient) && creditAvailable < total
  const isCrediarioInvalid =
    paymentMethod === 'crediario' && (!selectedClient || isCreditInsufficient)

  const splitCartaoValue = parseAmount(splitPayments.cartao)
  const splitPixValue = parseAmount(splitPayments.pix)
  const splitDinheiroValue = parseAmount(splitPayments.dinheiro)
  const splitNonCashTotal = splitCartaoValue + splitPixValue
  const splitCashNeeded = Math.max(0, total - splitNonCashTotal)
  const splitTroco = splitDinheiroValue - splitCashNeeded
  const splitAllocatedTotal = splitCartaoValue + splitPixValue + splitDinheiroValue
  const splitRemaining = total - splitAllocatedTotal
  const isSplitInsufficient = paymentMethod === 'misto' && splitRemaining > 0.004

  const isConfirmDisabled =
    cart.length === 0 || isCashInsufficient || isCrediarioInvalid || isSplitInsufficient

  const pixKey = onlyDigits(settings.document ?? '').length > 0
    ? settings.document
    : 'Chave PIX não configurada'

  const filteredClients = useMemo(() => {
    const term = clientSearchTerm.trim().toLowerCase()
    if (!term) return []
    const termDigits = onlyDigits(clientSearchTerm)
    return clients
      .filter((client) => {
        const nameMatch = client.name.toLowerCase().includes(term)
        const docMatch = termDigits.length > 0 && onlyDigits(client.cpfCnpj ?? '').includes(termDigits)
        return nameMatch || docMatch
      })
      .slice(0, 6)
  }, [clients, clientSearchTerm])

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return []
    return MOCK_PRODUCTS.filter(
      (product) =>
        product.name.toLowerCase().includes(term) || product.code.includes(term),
    ).slice(0, 6)
  }, [searchTerm, MOCK_PRODUCTS])

  const weighableProducts = useMemo(
    () => MOCK_PRODUCTS.filter((product) => product.weighable),
    [MOCK_PRODUCTS],
  )

  const activeComanda = comandas.find((comanda) => comanda.id === activeComandaId) ?? null

  const filteredComandaProducts = useMemo(() => {
    const term = comandaProductSearch.trim().toLowerCase()
    if (!term) return []
    return MOCK_PRODUCTS.filter(
      (product) =>
        product.name.toLowerCase().includes(term) || product.code.includes(term),
    ).slice(0, 6)
  }, [comandaProductSearch, MOCK_PRODUCTS])

  const filteredPriceCheckProducts = useMemo(() => {
    const term = priceCheckSearch.trim().toLowerCase()
    if (!term) return []
    return MOCK_PRODUCTS.filter(
      (product) => product.name.toLowerCase().includes(term) || product.code.includes(term),
    ).slice(0, 8)
  }, [priceCheckSearch, MOCK_PRODUCTS])

  function openPriceCheckModal() {
    setPriceCheckSearch('')
    setPriceCheckResult(null)
    setPriceCheckNotFound(false)
    setShowPriceCheckModal(true)
  }

  function closePriceCheckModal() {
    setShowPriceCheckModal(false)
    setPriceCheckSearch('')
    setPriceCheckResult(null)
    setPriceCheckNotFound(false)
    searchInputRef.current?.focus()
  }

  function selectPriceCheckProduct(product) {
    setPriceCheckResult(product)
    setPriceCheckNotFound(false)
    setPriceCheckSearch('')
    playBeepPriceCheck()
    priceCheckInputRef.current?.focus()
  }

  function handlePriceCheckKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()

    const term = priceCheckSearch.trim()
    if (!term) return

    const exactMatch = MOCK_PRODUCTS.find((product) => product.code === term)
    const target = exactMatch ?? filteredPriceCheckProducts[0]

    if (target) {
      selectPriceCheckProduct(target)
    } else {
      setPriceCheckResult(null)
      setPriceCheckNotFound(true)
      playBeepError()
      setPriceCheckSearch('')
    }
  }

  function toggleSound() {
    const next = !soundMuted
    setSoundMuted(next)
    setSoundMutedState(next)
  }

  function openMovementModal(type) {
    setMovementForm(EMPTY_MOVEMENT_FORM)
    setMovementModal(type)
  }

  function closeMovementModal() {
    setMovementModal(null)
    searchInputRef.current?.focus()
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
        searchInputRef.current?.focus()
      },
    })
  }

  function openCloseModal() {
    setShowCloseModal(true)
  }

  function closeCloseModal() {
    setShowCloseModal(false)
    searchInputRef.current?.focus()
  }

  /** Procura, em todos os produtos com variações, uma variação cujo código de barras próprio bate com o termo bipado — permite pular o mini-modal quando o operador já bipou o tamanho/cor exato. */
  function findVariationMatch(term) {
    for (const product of MOCK_PRODUCTS) {
      if (!product.hasVariations) continue
      const variation = product.variations.find((item) => item.code && item.code === term)
      if (variation) return { product, variation }
    }
    return null
  }

  function addToCart(product, variation = null, qty = 1) {
    playBeepSuccess()
    const lineId = variation ? `${product.id}::${variationStockKey(variation)}` : product.id
    setCart((prev) => {
      const existing = prev.find((item) => item.id === lineId)
      if (existing) {
        return prev.map((item) => (item.id === lineId ? { ...item, qty: roundQty(item.qty + qty) } : item))
      }
      return [
        ...prev,
        {
          id: lineId,
          productId: product.id,
          name: product.name,
          variationLabel: variation ? variationLabel(variation) : null,
          variationCode: variationStockKey(variation),
          price: product.price,
          unit: product.unit ?? 'UN',
          qty: roundQty(qty),
        },
      ]
    })
  }

  /** Ao buscar/bipar um produto com variações cadastradas (tamanho/cor), abre o mini-modal de seleção rápida em vez de jogar direto no carrinho. */
  function resolveProductSelection(product) {
    if (product.hasVariations) {
      setVariationPicker(product)
      return
    }
    addToCart(product)
  }

  function selectVariation(variation) {
    if (!variationPicker) return
    addToCart(variationPicker, variation)
    setVariationPicker(null)
    setSearchTerm('')
    searchInputRef.current?.focus()
  }

  function closeVariationPicker() {
    setVariationPicker(null)
    searchInputRef.current?.focus()
  }

  function mergeCartItems(items) {
    setCart((prev) => {
      const next = [...prev]
      items.forEach((item) => {
        const index = next.findIndex((cartItem) => cartItem.id === item.id)
        if (index >= 0) {
          next[index] = { ...next[index], qty: next[index].qty + item.qty }
        } else {
          next.push({
            id: item.id,
            productId: item.productId ?? item.id,
            name: item.name,
            variationLabel: item.variationLabel ?? null,
            variationCode: item.variationCode ?? null,
            price: item.price,
            unit: item.unit ?? 'UN',
            qty: item.qty,
          })
        }
      })
      return next
    })
  }

  function loadComandaByNumber(number) {
    const comanda = comandas.find((item) => item.id === number)

    if (!comanda || comanda.items.length === 0) {
      playBeepError()
      clearTimeout(notFoundTimeoutRef.current)
      setNotFound(true)
      notFoundTimeoutRef.current = setTimeout(() => setNotFound(false), 2000)
      return
    }

    mergeCartItems(comanda.items)
    setComandas((prev) =>
      prev.map((item) =>
        item.id === number ? { ...item, status: 'livre', items: [], openedAt: null } : item,
      ),
    )
    setActiveComandaLabel(String(number).padStart(2, '0'))
    setSearchTerm('')
    playBeepSuccess()
    searchInputRef.current?.focus()
  }

  function handleSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()

    const term = searchTerm.trim()
    if (!term) return

    const comandaMatch = term.match(/^c-?0*(\d{1,2})$/i)
    if (comandaMatch) {
      loadComandaByNumber(Number(comandaMatch[1]))
      return
    }

    // Etiqueta de balança (EAN-13, prefixo '2') — traz o código interno do
    // produto pesável e o valor já pesado embutidos, sem precisar digitar
    // nada (ver src/utils/scaleBarcode.js). Um código de 13 dígitos nunca
    // bate com o formato "C<número>" de comanda acima, então a ordem aqui
    // não importa para esse caso.
    const scaleLabel = parseScaleBarcode(term)
    if (scaleLabel) {
      const product = MOCK_PRODUCTS.find(
        (item) =>
          item.weighable &&
          item.scaleCode &&
          normalizeScaleCode(item.scaleCode) === normalizeScaleCode(scaleLabel.scaleCode),
      )
      if (product && product.price > 0) {
        const qty = roundQty(scaleLabel.valorPago / product.price)
        addToCart(product, null, qty)
        setSearchTerm('')
      } else {
        playBeepError()
        clearTimeout(notFoundTimeoutRef.current)
        setNotFound(true)
        notFoundTimeoutRef.current = setTimeout(() => setNotFound(false), 2000)
      }
      return
    }

    const variationMatch = findVariationMatch(term)
    if (variationMatch) {
      addToCart(variationMatch.product, variationMatch.variation)
      setSearchTerm('')
      return
    }

    const exactMatch = MOCK_PRODUCTS.find((product) => product.code === term)
    const target = exactMatch ?? filteredProducts[0]

    if (target) {
      resolveProductSelection(target)
      setSearchTerm('')
    } else {
      playBeepError()
      clearTimeout(notFoundTimeoutRef.current)
      setNotFound(true)
      notFoundTimeoutRef.current = setTimeout(() => setNotFound(false), 2000)
    }
  }

  function updateQty(id, delta) {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: roundQty(item.qty + delta) } : item))
        .filter((item) => item.qty > 0),
    )
  }

  function removeItem(id) {
    playBeepRemove()
    setCart((prev) => prev.filter((item) => item.id !== id))
  }

  function clearCart() {
    setCart([])
    setDiscount(null)
    setActiveComandaLabel(null)
  }

  function requestClearCart() {
    if (cart.length === 0) return
    setShowClearConfirm(true)
  }

  function confirmClearCart() {
    clearCart()
    setShowClearConfirm(false)
    searchInputRef.current?.focus()
  }

  function cancelClearCart() {
    setShowClearConfirm(false)
    searchInputRef.current?.focus()
  }

  function openConfirmModal() {
    if (cart.length === 0) return
    setAmountReceived('')
    setSplitPayments({ dinheiro: '', cartao: '', pix: '' })
    setReceiptOption('cupom')
    setInstallments(1)
    setNoteDocument('')
    setIsDeliveryMode(false)
    setDeliveryForm(EMPTY_DELIVERY_FORM)
    setDeliverySettlementType('pendente')
    setDeliveryPaymentMethod('dinheiro')
    setDeliveryChangeFor('')
    setShowConfirmModal(true)
  }

  function closeConfirmModal() {
    setShowConfirmModal(false)
    searchInputRef.current?.focus()
  }

  function toggleDeliveryMode() {
    setIsDeliveryMode((prev) => {
      const next = !prev
      if (next) {
        setDeliveryForm({
          clientName: selectedClient?.name ?? '',
          phone: selectedClient?.phone ?? '',
          address: selectedClient?.address ? { ...selectedClient.address } : { ...EMPTY_ADDRESS },
          referencePoint: '',
          expectedDeliveryDate: '',
          notes: '',
        })
        setDeliverySettlementType('pendente')
      }
      return next
    })
  }

  // Opção A ("pago") reaproveita os estados `paymentMethod`/`amountReceived`
  // da venda normal (ocultos enquanto o modo Delivery está ativo) — ao
  // entrar nessa opção, garante que a forma selecionada seja uma das
  // aceitas para pagamento antecipado (não Crediário/Misto, que não fazem
  // sentido aqui).
  function selectDeliverySettlementType(type) {
    setDeliverySettlementType(type)
    if (type === 'pago' && !DELIVERY_ADVANCE_PAYMENT_METHODS.some((method) => method.id === paymentMethod)) {
      setPaymentMethod('dinheiro')
      setAmountReceived('')
    }
  }

  function updateDeliveryField(field, value) {
    setDeliveryForm((prev) => ({ ...prev, [field]: value }))
  }

  function updateDeliveryAddressField(field, value) {
    setDeliveryForm((prev) => ({ ...prev, address: { ...prev.address, [field]: value } }))
  }

  const isDeliveryAdvancePaid = isDeliveryMode && deliverySettlementType === 'pago'

  const isDeliveryConfirmDisabled =
    cart.length === 0 ||
    !deliveryForm.clientName.trim() ||
    !deliveryForm.phone.trim() ||
    !deliveryForm.address.street.trim() ||
    (isDeliveryAdvancePaid && isCashInsufficient)

  function printDeliverySlip(order, copies) {
    const paymentLabel = deliveryPaymentMethodLabel(order.paymentMethod)
    const itemsSubtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0)
    const total = itemsSubtotal + (order.deliveryFee ?? 0)
    const changeForLabel =
      order.paymentMethod === 'dinheiro' && order.changeFor > total ? formatCurrency(order.changeFor) : null

    printMotoboySlipWindow({
      storeSettings: settings,
      width: 80,
      orderCode: order.code,
      dateTimeLabel: receiptDateTimeFormatter.format(order.createdAt ?? new Date()),
      clientName: order.clientName,
      clientPhone: order.clientPhone,
      address: order.address,
      referencePoint: order.referencePoint,
      expectedDeliveryLabel: formatExpectedDeliveryLabel(order.expectedDeliveryDate),
      notes: order.notes,
      items: order.items,
      subtotal: itemsSubtotal,
      deliveryFee: order.deliveryFee ?? 0,
      total,
      paymentLabel,
      changeForLabel,
      paymentStatus: order.paymentStatus ?? 'pendente',
      motoboyName: order.motoboyName,
      copies,
    })
  }

  function finalizeDeliverySale() {
    if (isDeliveryConfirmDisabled) return

    playBeepFinish()

    const orderItems = cart.map((item) => ({
      id: item.productId,
      name: cartLineName(item),
      price: item.price,
      qty: item.qty,
    }))

    const orderPayload = isDeliveryAdvancePaid
      ? {
          status: 'pendente',
          clientId: selectedClient?.id ?? null,
          clientName: deliveryForm.clientName.trim(),
          clientPhone: deliveryForm.phone.trim(),
          address: deliveryForm.address,
          referencePoint: deliveryForm.referencePoint.trim(),
          expectedDeliveryDate: deliveryForm.expectedDeliveryDate || null,
          notes: deliveryForm.notes.trim(),
          items: orderItems,
          deliveryFee: 0,
          // Já foi pago no caixa — nada a cobrar do cliente na entrega.
          paymentMethod,
          changeFor: null,
          motoboyId: null,
          motoboyName: null,
          origin: 'pdv',
          paymentStatus: 'pago',
          stockDeducted: true,
        }
      : {
          status: 'pendente',
          clientId: selectedClient?.id ?? null,
          clientName: deliveryForm.clientName.trim(),
          clientPhone: deliveryForm.phone.trim(),
          address: deliveryForm.address,
          referencePoint: deliveryForm.referencePoint.trim(),
          expectedDeliveryDate: deliveryForm.expectedDeliveryDate || null,
          notes: deliveryForm.notes.trim(),
          items: orderItems,
          deliveryFee: 0,
          paymentMethod: deliveryPaymentMethod,
          changeFor: deliveryPaymentMethod === 'dinheiro' ? parseAmount(deliveryChangeFor) || null : null,
          motoboyId: null,
          motoboyName: null,
          origin: 'pdv',
          paymentStatus: 'pendente',
          stockDeducted: true,
        }

    createDeliveryOrder(orderPayload)
      .then((created) => {
        if (isDeliveryAdvancePaid) {
          // Liquida o valor no financeiro/caixa como uma venda concluída —
          // `registerSale` já dá baixa no estoque de cada item, então (ao
          // contrário do fluxo "cobrar na entrega" abaixo) não repetimos o
          // ajuste manual de estoque aqui.
          vendasRepo
            .registerSale({
              clienteId: selectedClient?.id ?? null,
              operador: currentOperator?.name ?? '',
              itens: cart.map((item) => ({
                produtoId: item.productId ?? item.id,
                quantidade: item.qty,
                precoUnitario: item.price,
              })),
              totalBruto: subtotal,
              desconto: discountAmount,
              totalLiquido: total,
              formaPagamento: paymentMethod,
              status: 'concluida',
              troco: paymentMethod === 'dinheiro' && troco > 0 ? troco : null,
              amountReceived: paymentMethod === 'dinheiro' && Number.isFinite(receivedValue) ? receivedValue : null,
              splitPayments: null,
            })
            .then((result) => {
              result.produtosAtualizados.forEach((product) => applyProductUpdate(product))
              if (result.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)
              // Anexa o id da venda ao pedido — permite que um cancelamento
              // posterior (Histórico de Vendas) estorne este lançamento
              // financeiro junto com o pedido.
              linkDeliveryVenda(created.id, result.id).catch((error) =>
                console.error('[pdv] Falha ao vincular a venda ao pedido de delivery:', error),
              )
            })
            .catch((error) =>
              console.error('[pdv] Falha ao liquidar no caixa o pedido de delivery pago:', error),
            )
        } else {
          cart.forEach((item) => {
            if (item.productId == null) return
            produtosRepo
              .adjustStock(item.productId, -item.qty)
              .then((updated) => updated && applyProductUpdate(updated))
              .catch((error) => console.error('[pdv] Falha ao baixar estoque do pedido de delivery:', error))
          })
        }

        // Só troca para a aba Delivery depois que o operador escolher as vias
        // e a impressão disparar — navegar antes desmontaria o PDV (e o
        // seletor de vias junto) assim que a tela mudasse.
        setCopiesPromptOrder(created)
      })
      .catch((error) => {
        console.error('[pdv] Falha ao enviar o pedido para o Delivery:', error)
      })

    setCart([])
    setDiscount(null)
    setAmountReceived('')
    setSelectedClientId(null)
    setClientSearchTerm('')
    setActiveComandaLabel(null)
    setIsDeliveryMode(false)
    setShowConfirmModal(false)
    clearTimeout(successTimeoutRef.current)
    setSuccessMessage(
      isDeliveryAdvancePaid ? 'Pedido pago e enviado para o Delivery!' : 'Pedido enviado para o Delivery!',
    )
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(false), 3000)
  }

  function addQuickCash(value) {
    if (paymentMethod !== 'dinheiro') return
    setAmountReceived((prev) => (parseAmount(prev) + value).toFixed(2))
  }

  function fillExactAmount() {
    if (paymentMethod !== 'dinheiro') return
    setAmountReceived(total.toFixed(2))
  }

  function copyPixKey() {
    navigator.clipboard?.writeText(pixKey).catch(() => {})
  }

  function openComandasModal() {
    setComandaView('grid')
    setActiveComandaId(null)
    setComandaProductSearch('')
    setShowComandasModal(true)
  }

  function closeComandasModal() {
    setShowComandasModal(false)
    setComandaView('grid')
    setActiveComandaId(null)
    setComandaProductSearch('')
    setAwaitingComandaHandoff(false)
    searchInputRef.current?.focus()
  }

  function openComandaHandoff() {
    if (cart.length === 0) return
    setAwaitingComandaHandoff(true)
    openComandasModal()
  }

  function handoffCartToComanda(comanda) {
    if (cart.length === 0) return

    setComandas((prev) =>
      prev.map((item) => {
        if (item.id !== comanda.id) return item
        const items = [...item.items]
        cart.forEach((cartItem) => {
          const index = items.findIndex((existing) => existing.id === cartItem.id)
          if (index >= 0) {
            items[index] = { ...items[index], qty: items[index].qty + cartItem.qty }
          } else {
            items.push({
              id: cartItem.id,
              productId: cartItem.productId ?? cartItem.id,
              name: cartItem.name,
              variationLabel: cartItem.variationLabel ?? null,
              price: cartItem.price,
              qty: cartItem.qty,
            })
          }
        })
        return {
          ...item,
          status: 'ocupada',
          items,
          openedAt: item.openedAt ?? new Date().toISOString(),
        }
      }),
    )

    playBeepFinish()
    setCart([])
    setDiscount(null)
    setActiveComandaLabel(null)
    setShowComandasModal(false)
    setComandaView('grid')
    setActiveComandaId(null)
    setAwaitingComandaHandoff(false)
    clearTimeout(successTimeoutRef.current)
    setSuccessMessage(`Pedido enviado para a Comanda #${String(comanda.id).padStart(2, '0')}`)
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(false), 3000)
    searchInputRef.current?.focus()
  }

  function openComandaDetail(comanda) {
    if (awaitingComandaHandoff) {
      handoffCartToComanda(comanda)
      return
    }
    setActiveComandaId(comanda.id)
    setComandaProductSearch('')
    setComandaView(comanda.status === 'ocupada' ? 'preview' : 'edit')
  }

  function backToComandaGrid() {
    setComandaView('grid')
    setActiveComandaId(null)
    setComandaProductSearch('')
  }

  function startAddingComandaItems() {
    setComandaProductSearch('')
    setComandaView('edit')
  }

  function addItemToComanda(product) {
    if (!activeComandaId) return
    playBeepSuccess()
    setComandas((prev) =>
      prev.map((comanda) => {
        if (comanda.id !== activeComandaId) return comanda
        const existing = comanda.items.find((item) => item.id === product.id)
        const items = existing
          ? comanda.items.map((item) =>
              item.id === product.id ? { ...item, qty: item.qty + 1 } : item,
            )
          : [...comanda.items, { id: product.id, name: product.name, price: product.price, qty: 1 }]
        return {
          ...comanda,
          status: 'ocupada',
          items,
          openedAt: comanda.openedAt ?? new Date().toISOString(),
        }
      }),
    )
    setComandaProductSearch('')
  }

  function handleComandaProductSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()

    const term = comandaProductSearch.trim()
    if (!term) return

    const exactMatch = MOCK_PRODUCTS.find((product) => product.code === term)
    const target = exactMatch ?? filteredComandaProducts[0]

    if (target) {
      addItemToComanda(target)
    } else {
      playBeepError()
    }
  }

  function updateComandaItemQty(productId, delta) {
    if (!activeComandaId) return
    setComandas((prev) =>
      prev.map((comanda) => {
        if (comanda.id !== activeComandaId) return comanda
        const items = comanda.items
          .map((item) => (item.id === productId ? { ...item, qty: item.qty + delta } : item))
          .filter((item) => item.qty > 0)
        return {
          ...comanda,
          items,
          status: items.length > 0 ? comanda.status : 'livre',
          openedAt: items.length > 0 ? comanda.openedAt : null,
        }
      }),
    )
  }

  function removeComandaItem(productId) {
    if (!activeComandaId) return
    playBeepRemove()
    setComandas((prev) =>
      prev.map((comanda) => {
        if (comanda.id !== activeComandaId) return comanda
        const items = comanda.items.filter((item) => item.id !== productId)
        return {
          ...comanda,
          items,
          status: items.length > 0 ? comanda.status : 'livre',
          openedAt: items.length > 0 ? comanda.openedAt : null,
        }
      }),
    )
  }

  function printComandaPreview(comanda) {
    const comandaTotal = comandaSubtotal(comanda)
    printReceiptWindow({
      storeSettings: settings,
      documentType: 'cupom',
      width: 80,
      saleCode: `Comanda #${String(comanda.id).padStart(2, '0')}`,
      dateTimeLabel: receiptDateTimeFormatter.format(new Date()),
      items: comanda.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPrice: item.price,
        subtotal: item.price * item.qty,
      })),
      subtotal: comandaTotal,
      discount: 0,
      paymentLabel: null,
      changeLabel: null,
      total: comandaTotal,
      footerMessage: 'Prévia da conta — documento sem valor fiscal',
    })
  }

  function pullComandaToCashier(comanda) {
    if (!comanda || comanda.items.length === 0) return

    mergeCartItems(comanda.items)
    setComandas((prev) =>
      prev.map((item) =>
        item.id === comanda.id ? { ...item, status: 'livre', items: [], openedAt: null } : item,
      ),
    )
    setActiveComandaLabel(String(comanda.id).padStart(2, '0'))
    setShowComandasModal(false)
    setComandaView('grid')
    setActiveComandaId(null)
    setAmountReceived('')
    setSplitPayments({ dinheiro: '', cartao: '', pix: '' })
    setReceiptOption('cupom')
    setInstallments(1)
    setNoteDocument('')
    setShowConfirmModal(true)
  }

  function selectClient(client) {
    setSelectedClientId(client.id)
    setClientSearchTerm('')
  }

  function unlinkClient() {
    setSelectedClientId(null)
    setClientSearchTerm('')
  }

  function updateSplitPayment(method, value) {
    setSplitPayments((prev) => ({ ...prev, [method]: value }))
  }

  function openDiscountModal() {
    setDiscountDraftType(discount?.type ?? 'value')
    setDiscountDraftValue(discount ? String(discount.amount) : '')
    setShowDiscountModal(true)
  }

  function closeDiscountModal() {
    setShowDiscountModal(false)
    searchInputRef.current?.focus()
  }

  function applyDiscount() {
    const value = parseAmount(discountDraftValue)
    if (value <= 0) {
      setDiscount(null)
      setShowDiscountModal(false)
      searchInputRef.current?.focus()
      return
    }

    const nextDiscount = { type: discountDraftType, amount: value }
    const discountAmountValue = discountDraftType === 'percent' ? subtotal * (value / 100) : value
    const percentOfSubtotal = subtotal > 0 ? (discountAmountValue / subtotal) * 100 : 0

    if (percentOfSubtotal > 10) {
      requestAuthorization({
        tipoAcao: MANAGER_ACTIONS.DESCONTO,
        title: 'Autorizar Desconto',
        description: 'Desconto acima de 10% do subtotal exige o PIN do Gerente.',
        detailLabel: `Desconto de ${formatCurrency(Math.min(subtotal, discountAmountValue))} (${percentOfSubtotal.toFixed(1)}% do subtotal)`,
        detalhes: { subtotal, valorDesconto: discountAmountValue, percentual: percentOfSubtotal },
        onAuthorized: () => {
          setDiscount(nextDiscount)
          setShowDiscountModal(false)
          searchInputRef.current?.focus()
        },
      })
      return
    }

    setDiscount(nextDiscount)
    setShowDiscountModal(false)
    searchInputRef.current?.focus()
  }

  function removeDiscount() {
    setDiscount(null)
    setShowDiscountModal(false)
    searchInputRef.current?.focus()
  }

  function openClientLinkModal() {
    setClientSearchTerm('')
    setShowClientLinkModal(true)
  }

  function closeClientLinkModal() {
    setShowClientLinkModal(false)
    searchInputRef.current?.focus()
  }

  function openWeightSaleModal() {
    setWeightSaleProductId((prev) =>
      weighableProducts.some((product) => product.id === prev) ? prev : (weighableProducts[0]?.id ?? ''),
    )
    setWeightSaleInput('')
    setShowWeightSaleModal(true)
  }

  function closeWeightSaleModal() {
    setShowWeightSaleModal(false)
    searchInputRef.current?.focus()
  }

  const weightSaleProduct = weighableProducts.find((product) => product.id === weightSaleProductId) ?? null
  const weightSaleQty = roundQty(parseAmount(weightSaleInput))
  const weightSaleTotal = weightSaleProduct ? roundCurrency(weightSaleProduct.price * weightSaleQty) : 0

  function confirmWeightSale() {
    if (!weightSaleProduct || weightSaleQty <= 0) return
    addToCart(weightSaleProduct, null, weightSaleQty)
    setShowWeightSaleModal(false)
    setWeightSaleInput('')
    searchInputRef.current?.focus()
  }

  function openNewClientModal() {
    const term = clientSearchTerm.trim()
    const looksLikeDocument = term.length > 0 && /^[0-9.\-/\s]+$/.test(term)
    setNewClientForm({
      ...EMPTY_NEW_CLIENT_FORM,
      cpfCnpj: looksLikeDocument ? term : '',
      name: looksLikeDocument ? '' : term,
    })
    setNewClientAttemptedSubmit(false)
    setShowNewClientModal(true)
  }

  function closeNewClientModal() {
    setShowNewClientModal(false)
  }

  function updateNewClientField(field, value) {
    setNewClientForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleNewClientSubmit(event) {
    event.preventDefault()

    const canSubmitNewClient =
      newClientForm.cpfCnpj.trim() &&
      newClientForm.name.trim() &&
      newClientForm.phone.trim() &&
      newClientForm.creditLimit !== ''

    if (!canSubmitNewClient) {
      setNewClientAttemptedSubmit(true)
      return
    }

    const newClient = {
      cpfCnpj: newClientForm.cpfCnpj.trim(),
      name: newClientForm.name.trim(),
      phone: newClientForm.phone.trim(),
      creditLimit: Number.parseFloat(newClientForm.creditLimit) || 0,
      balance: 0,
      address: {
        cep: newClientForm.cep.trim(),
        street: newClientForm.street.trim(),
        number: newClientForm.number.trim(),
        neighborhood: newClientForm.neighborhood.trim(),
        city: newClientForm.city.trim(),
      },
      history: [],
    }

    // `createClient` grava no banco e já devolve o id definitivo — evita a
    // corrida de selecionar por um id local temporário antes da
    // reconciliação assíncrona do ClientsContext trocá-lo pelo id real.
    createClient(newClient)
      .then((created) => setSelectedClientId(created.id))
      .catch((error) => console.error('[pdv] Falha ao cadastrar cliente no banco de dados:', error))
    setClientSearchTerm('')
    setShowNewClientModal(false)
  }

  function finalizeSale(options = {}) {
    if (isConfirmDisabled) return

    if (!options.bypassStockCheck && cartStockIssues.length > 0) {
      requestAuthorization({
        tipoAcao: MANAGER_ACTIONS.VENDA_SEM_ESTOQUE,
        title: 'Autorizar Venda Sem Estoque',
        description:
          'Um ou mais itens do carrinho não têm saldo suficiente na variação/produto selecionado. Digite o PIN do Gerente para vender mesmo assim.',
        detailLabel: cartStockIssues
          .map((issue) => `${issue.name}: pedido ${issue.requested}, disponível ${issue.available}`)
          .join(' • '),
        requireMotivo: true,
        motivoLabel: 'Motivo da venda sem estoque',
        motivoPlaceholder: 'Ex.: contagem de estoque desatualizada, venda por encomenda…',
        detalhes: { itens: cartStockIssues },
        onAuthorized: () => finalizeSale({ bypassStockCheck: true }),
      })
      return
    }

    playBeepFinish()

    const changeValue = paymentMethod === 'dinheiro' ? troco : paymentMethod === 'misto' ? splitTroco : null
    const cartSnapshot = cart.map((item) => ({
      name: cartLineName(item),
      qty: item.qty,
      unit: item.unit ?? 'UN',
      unitPrice: item.price,
      subtotal: roundCurrency(item.price * item.qty),
    }))

    const saleSnapshot = {
      clienteId: selectedClient?.id ?? null,
      operador: currentOperator?.name ?? '',
      itens: cart.map((item) => ({
        produtoId: item.productId ?? item.id,
        quantidade: item.qty,
        precoUnitario: item.price,
        variationCode: item.variationCode ?? null,
      })),
      totalBruto: subtotal,
      desconto: discountAmount,
      totalLiquido: total,
      formaPagamento: paymentMethod,
      status: 'concluida',
      troco: changeValue,
      amountReceived: paymentMethod === 'dinheiro' && Number.isFinite(receivedValue) ? receivedValue : null,
      splitPayments: paymentMethod === 'misto' ? { dinheiro: splitDinheiroValue, cartao: splitCartaoValue, pix: splitPixValue } : null,
    }

    vendasRepo
      .registerSale(saleSnapshot)
      .then((result) => {
        result.produtosAtualizados.forEach((product) => applyProductUpdate(product))
        if (result.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)

        // O cupom só pode mostrar o código real da venda (usado depois por
        // Trocas para localizá-la) depois que o INSERT em `vendas` resolve
        // e devolve o id definitivo do banco — por isso a impressão acontece
        // aqui, e não antes de chamar `registerSale`.
        if (receiptOption !== 'sem-impressao') {
          const paymentLabel = PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.label

          printReceiptWindow({
            storeSettings: settings,
            documentType: receiptOption === 'nfce' ? 'nfce' : 'cupom',
            width: 80,
            saleCode: `#${result.id}`,
            dateTimeLabel: receiptDateTimeFormatter.format(new Date()),
            items: cartSnapshot,
            subtotal,
            discount: discountAmount,
            paymentLabel,
            changeLabel: changeValue != null && changeValue > 0 ? formatCurrency(changeValue) : null,
            total,
            footerMessage: settings.receiptFooter,
          })
        }
      })
      .catch((error) => {
        console.error('[pdv] Falha ao registrar a venda no banco de dados:', error)
      })

    setCart([])
    setDiscount(null)
    setAmountReceived('')
    setSplitPayments({ dinheiro: '', cartao: '', pix: '' })
    setSelectedClientId(null)
    setClientSearchTerm('')
    setInstallments(1)
    setNoteDocument('')
    setActiveComandaLabel(null)
    setShowConfirmModal(false)
    clearTimeout(successTimeoutRef.current)
    setSuccessMessage('Venda finalizada com sucesso!')
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(false), 3000)
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (copiesPromptOrder) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setCopiesPromptOrder(null)
          onGoToDelivery?.()
        }
        return
      }

      if (variationPicker) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeVariationPicker()
        }
        return
      }

      if (showCloseModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeCloseModal()
        }
        return
      }

      if (movementModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeMovementModal()
        }
        return
      }

      if (showNewClientModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeNewClientModal()
        }
        return
      }

      if (showClientLinkModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeClientLinkModal()
        }
        return
      }

      if (showWeightSaleModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeWeightSaleModal()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          confirmWeightSale()
        }
        return
      }

      if (showDiscountModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeDiscountModal()
        } else if (event.key === 'Enter') {
          event.preventDefault()
          applyDiscount()
        }
        return
      }

      if (showClearConfirm) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelClearCart()
        } else if (event.key === 'Enter' || event.key === 'F4') {
          event.preventDefault()
          confirmClearCart()
        }
        return
      }

      if (showComandasModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          if (comandaView !== 'grid') {
            backToComandaGrid()
          } else {
            closeComandasModal()
          }
        }
        return
      }

      if (showPriceCheckModal) {
        if (event.key === 'Escape' || event.key === 'F11') {
          event.preventDefault()
          closePriceCheckModal()
        }
        return
      }

      if (showConfirmModal) {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeConfirmModal()
          return
        }

        if (event.key === 'F5') {
          event.preventDefault()
          addQuickCash(50)
          return
        }

        if (event.key === 'F6') {
          event.preventDefault()
          addQuickCash(100)
          return
        }

        if (event.key === 'F7') {
          event.preventDefault()
          fillExactAmount()
          return
        }

        if (event.key === 'F8') {
          event.preventDefault()
          noteDocumentInputRef.current?.focus()
          return
        }

        const activeTag = document.activeElement?.tagName
        const isTypingField = activeTag === 'INPUT' || activeTag === 'TEXTAREA'

        if (!isDeliveryMode && !isTypingField && ['1', '2', '3', '4', '5'].includes(event.key)) {
          event.preventDefault()
          if (event.key === '1') setPaymentMethod('dinheiro')
          else if (event.key === '2') setPaymentMethod('pix')
          else if (event.key === '3') setPaymentMethod('cartao-credito')
          else if (event.key === '4') setPaymentMethod('cartao-debito')
          else if (event.key === '5') setPaymentMethod('misto')
          return
        }

        if (
          event.key === 'Enter' &&
          document.activeElement !== searchInputRef.current &&
          document.activeElement !== clientSearchInputRef.current
        ) {
          event.preventDefault()
          if (isDeliveryMode) finalizeDeliverySale()
          else finalizeSale()
        }
        return
      }

      if (event.key === 'F2') {
        event.preventDefault()
        openConfirmModal()
      } else if (event.key === 'F6' && isBalcaoMode) {
        event.preventDefault()
        openComandaHandoff()
      } else if (event.key === 'F3') {
        event.preventDefault()
        const digitsMatch = searchTerm.match(/\d{1,2}/)
        if (digitsMatch) {
          loadComandaByNumber(Number(digitsMatch[0]))
        } else {
          openComandasModal()
        }
      } else if (event.key === 'F4') {
        event.preventDefault()
        requestClearCart()
      } else if (event.key === 'F7') {
        event.preventDefault()
        openDiscountModal()
      } else if (event.key === 'F8') {
        event.preventDefault()
        openClientLinkModal()
      } else if (event.key === 'F9') {
        event.preventDefault()
        openWeightSaleModal()
      } else if (event.key === 'F11') {
        event.preventDefault()
        openPriceCheckModal()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (searchTerm) {
          setSearchTerm('')
        } else {
          onExit?.()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    return () => {
      clearTimeout(notFoundTimeoutRef.current)
      clearTimeout(successTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    // Espera o catálogo de produtos carregar antes de resolver os nomes dos
    // itens de cada comanda — do contrário, se o SQLite/localStorage de
    // comandas responder antes do de produtos, os itens ficam presos no
    // fallback "Produto #<id>" (o nome só é calculado uma vez, aqui).
    if (comandasLoadedRef.current || !productsLoaded) return

    let cancelled = false

    loadComandas((productId) => MOCK_PRODUCTS.find((product) => product.id === productId)?.name).then(
      (loaded) => {
        if (cancelled) return
        setComandas(loaded)
        comandasLoadedRef.current = true
      },
    )

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoaded])

  useEffect(() => {
    if (!pendingSale || pendingSale.length === 0) return
    mergeCartItems(pendingSale)
    consumePendingSale()
    playBeepSuccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSale])

  useEffect(() => {
    if (!comandasLoadedRef.current) return
    clearTimeout(comandasPersistTimeoutRef.current)
    comandasPersistTimeoutRef.current = setTimeout(() => {
      persistComandas(comandas)
    }, 400)
    return () => clearTimeout(comandasPersistTimeoutRef.current)
  }, [comandas])

  useEffect(() => {
    if (!showConfirmModal) return
    if (paymentMethod === 'dinheiro') {
      amountReceivedInputRef.current?.focus()
    } else if (paymentMethod === 'misto') {
      splitDinheiroInputRef.current?.focus()
    }
  }, [paymentMethod, showConfirmModal])

  useEffect(() => {
    if (
      !showConfirmModal &&
      !showNewClientModal &&
      !showClientLinkModal &&
      !showWeightSaleModal &&
      !showDiscountModal &&
      !showClearConfirm &&
      !movementModal &&
      !showCloseModal &&
      !showComandasModal &&
      !showPriceCheckModal &&
      !variationPicker &&
      !copiesPromptOrder
    ) {
      searchInputRef.current?.focus()
    }
  }, [
    showConfirmModal,
    showNewClientModal,
    showClientLinkModal,
    showWeightSaleModal,
    showDiscountModal,
    showClearConfirm,
    movementModal,
    showCloseModal,
    showComandasModal,
    showPriceCheckModal,
    variationPicker,
    copiesPromptOrder,
  ])

  useEffect(() => {
    if (!showComandasModal) return
    if (comandaView === 'edit') {
      comandaProductSearchInputRef.current?.focus()
    }
  }, [comandaView, showComandasModal])

  useEffect(() => {
    if (showPriceCheckModal) priceCheckInputRef.current?.focus()
  }, [showPriceCheckModal])

  useEffect(() => {
    if (showWeightSaleModal) weightSaleInputRef.current?.focus()
  }, [showWeightSaleModal])

  const timeLabel = timeFormatter.format(now)
  const dateLabel = dateFormatter.format(now)
  const weekdayLabel = weekdayFormatter.format(now)

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Header interno do PDV: status do caixa, controle de caixa e relógio */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <div>
            <p
              className={clsx(
                'text-sm font-bold uppercase tracking-wide',
                isBalcaoMode ? 'text-sky-600' : 'text-emerald-600',
              )}
            >
              {isBalcaoMode ? 'Modo Balcão / Atendimento' : 'Caixa Aberto'}
            </p>
            <p className="text-xs text-slate-400">
              {isBalcaoMode
                ? 'Terminal completo — cobrança, orçamento, clientes e delivery'
                : `Operador: ${currentOperator?.name ?? '—'}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openComandasModal}
            className="flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
          >
            <LayoutGrid size={15} />
            Comandas / Mesas (F3)
            {comandas.some((comanda) => comanda.status === 'ocupada') && (
              <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {comandas.filter((comanda) => comanda.status === 'ocupada').length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={openPriceCheckModal}
            className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <ScanSearch size={15} />
            Consulta de Preços (F11)
          </button>
          {!isBalcaoMode && (
            <>
              <button
                type="button"
                onClick={() => openMovementModal('suprimento')}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                <PlusCircle size={15} />
                Suprimento (Entrada)
              </button>
              <button
                type="button"
                onClick={() => openMovementModal('sangria')}
                className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                <MinusCircle size={15} />
                Sangria (Retirada)
              </button>
              <button
                type="button"
                onClick={openCloseModal}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                <Lock size={15} />
                Fechar Caixa do Dia
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleSound}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label={soundMuted ? 'Ativar som' : 'Silenciar som'}
            title={soundMuted ? 'Ativar som' : 'Silenciar som'}
          >
            {soundMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>

          <div className="flex items-center gap-2.5 border-l border-slate-200 pl-4">
            <CalendarClock size={18} className="shrink-0 text-slate-300" />
            <div className="text-right leading-tight">
              <p className="text-lg font-bold tabular-nums text-slate-800">{timeLabel}</p>
              <p className="text-xs font-semibold capitalize text-slate-500">{weekdayLabel}</p>
              <p className="text-[11px] capitalize text-slate-400">{dateLabel}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[1fr_380px]">
        {/* Painel esquerdo: leitura de código de barras e carrinho */}
        <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 p-3">
            <label
              htmlFor="barcode-input"
              className="flex items-center justify-between gap-1.5 px-1 text-xs font-bold uppercase tracking-widest text-blue-700"
            >
              <span className="flex items-center gap-1.5">
                <ScanBarcode size={14} />
                Leitura de Código de Barras
              </span>
              <span className="flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-blue-500">
                <ClipboardList size={12} />
                Digite C15 ou F3 para chamar uma comanda
              </span>
            </label>

            <div className="relative mt-2">
              <ScanBarcode
                size={22}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-400"
              />
              <input
                id="barcode-input"
                ref={searchInputRef}
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Bipe o produto, digite o código / nome ou C15 para uma comanda…"
                className="w-full rounded-lg border-2 border-blue-200 bg-white py-4 pl-14 pr-10 text-lg font-medium text-slate-900 outline-none transition-colors placeholder:text-base placeholder:font-normal focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
              />
              <Search
                size={18}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              {filteredProducts.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  {filteredProducts.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => {
                          resolveProductSelection(product)
                          setSearchTerm('')
                          if (!product.hasVariations) searchInputRef.current?.focus()
                        }}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-blue-50"
                      >
                        <span className="flex items-center gap-1.5 text-slate-800">
                          {product.name}
                          {product.hasVariations && (
                            <Palette size={12} className="shrink-0 text-violet-500" />
                          )}
                        </span>
                        <span className="font-semibold text-slate-500">
                          {formatCurrency(product.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {notFound && (
                <p className="absolute mt-1 flex items-center gap-1 text-xs font-medium text-red-500">
                  <AlertTriangle size={14} />
                  Produto não encontrado
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Carrinho
              {activeComandaLabel && (
                <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                  <ClipboardList size={11} />
                  Comanda #{activeComandaLabel}
                </span>
              )}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {cart.length} {cart.length === 1 ? 'item' : 'itens'}
            </span>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-slate-400">
                <ShoppingCart size={36} strokeWidth={1.5} />
                <p className="text-sm">Nenhum item adicionado</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cart.map((item) => {
                  const stockIssue = cartStockIssues.find((issue) => issue.id === item.id)
                  return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {item.name}
                      </p>
                      {item.variationLabel && (
                        <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-violet-600">
                          <Palette size={10} className="shrink-0" />
                          {item.variationLabel}
                        </p>
                      )}
                      <p className="text-xs text-slate-400">
                        {formatCurrency(item.price)} / {(item.unit ?? 'UN').toLowerCase()}
                      </p>
                      {stockIssue && (
                        <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-red-600">
                          <AlertTriangle size={10} className="shrink-0" />
                          Estoque insuficiente ({stockIssue.available} disponível)
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 rounded-md border border-slate-200">
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, isFractionalUnit(item.unit) ? -0.1 : -1)}
                        className="p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label="Diminuir quantidade"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-12 text-center text-sm font-medium tabular-nums text-slate-800">
                        {formatCartQty(item.qty, item.unit)}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.id, isFractionalUnit(item.unit) ? 0.1 : 1)}
                        className="p-1.5 text-slate-500 hover:bg-slate-100"
                        aria-label="Aumentar quantidade"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                      {formatCurrency(roundCurrency(item.price * item.qty))}
                    </span>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      aria-label="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Painel direito: total, atalhos e finalização */}
        <section className="flex min-h-0 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-xl ring-1 ring-slate-800">
            <div className="flex items-center justify-between text-xs font-medium text-slate-400">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="mt-1 flex items-center justify-between text-xs font-medium text-amber-400">
                <span className="flex items-center gap-1">
                  <Tag size={12} />
                  Desconto {discount?.type === 'percent' ? `(${discount.amount}%)` : ''}
                </span>
                <span className="tabular-nums">-{formatCurrency(discountAmount)}</span>
              </div>
            )}

            {selectedClient && (
              <div className="mt-1 flex items-center justify-between text-xs font-medium text-sky-400">
                <span className="flex items-center gap-1">
                  <User size={12} />
                  Cliente
                </span>
                <span className="truncate">{selectedClient.name}</span>
              </div>
            )}

            <div className="mt-3 border-t border-slate-800 pt-3 text-right">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                Valor Final
              </p>
              <p className="mt-1 text-5xl font-black tabular-nums text-emerald-400">
                {formatCurrency(total)}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {itemCount} {itemCount === 1 ? 'item' : 'itens'} no carrinho
              </p>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-3">
            <div className="grid grid-cols-5 items-stretch gap-2">
              <ShortcutButton
                keyLabel="F2"
                description={isBalcaoMode ? 'Cobrar' : 'Finalizar'}
                icon={CheckCircle2}
                tone="emerald"
                onClick={openConfirmModal}
              />
              <ShortcutButton
                keyLabel="F7"
                description="Desconto"
                icon={Percent}
                tone="sky"
                onClick={openDiscountModal}
              />
              <ShortcutButton
                keyLabel="F8"
                description="Cliente"
                icon={UserSearch}
                tone="violet"
                onClick={openClientLinkModal}
              />
              <ShortcutButton
                keyLabel="F9"
                description="Peso / Kg"
                icon={Scale}
                tone="teal"
                onClick={openWeightSaleModal}
              />
              <ShortcutButton
                keyLabel="F4"
                description="Limpar"
                icon={Eraser}
                tone="amber"
                onClick={requestClearCart}
              />
            </div>

            <button
              type="button"
              onClick={openConfirmModal}
              disabled={cart.length === 0}
              className="w-full rounded-lg bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {isBalcaoMode ? 'Finalizar Venda / Cobrar (F2)' : 'Finalizar Venda (F2)'}
            </button>

            {isBalcaoMode && (
              <button
                type="button"
                onClick={openComandaHandoff}
                disabled={cart.length === 0}
                className="w-full rounded-lg border border-sky-300 bg-sky-50 py-3 text-sm font-semibold text-sky-700 shadow-sm transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              >
                <span className="flex items-center justify-center gap-2">
                  <Send size={16} />
                  Gerar Orçamento / Enviar ao Caixa Principal (F6)
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onExit?.()}
              className="flex items-center justify-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              <LogOut size={13} />
              Sair (ESC)
            </button>

            {successMessage && (
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 size={16} />
                {successMessage}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Modal de fechamento de venda */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="my-auto flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between px-6 pb-4 pt-6">
              <h2 className="text-lg font-bold text-slate-900">Fechamento de Venda</h2>
              <button
                type="button"
                onClick={closeConfirmModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-4 pl-6 pr-2">
            <div className="space-y-1 rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span>
                  Subtotal · {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                </span>
                <span className="tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-amber-600">
                  <span>Desconto</span>
                  <span className="tabular-nums">-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total
                </span>
                <span className="text-xl font-bold tabular-nums text-slate-900">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            {cartStockIssues.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                Estoque insuficiente para {cartStockIssues.length === 1 ? 'este item' : 'estes itens'} do carrinho — finalizar vai pedir o PIN do Gerente.
              </p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={toggleDeliveryMode}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-xl border-2 p-3 text-left transition-all',
                  isDeliveryMode
                    ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm shadow-sky-500/10'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <Truck size={20} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">
                    Enviar para Delivery
                  </span>
                  <span className="block text-xs font-normal leading-tight text-slate-400">
                    Pago no caixa agora ou cobrado do cliente na entrega — você escolhe a seguir
                  </span>
                </span>
              </button>
            </div>

            {!isDeliveryMode && (
              <>
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Forma de Pagamento
                </h3>
                <span className="text-[10px] font-medium text-slate-400">Teclas 1-5</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map(({ id, label, icon: Icon, shortcut }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentMethod(id)}
                    className={clsx(
                      'flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 transition-all',
                      paymentMethod === id
                        ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md shadow-blue-500/10'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className="relative">
                      <Icon size={20} />
                      {shortcut && (
                        <span className="absolute -right-2.5 -top-2.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-slate-800 font-mono text-[9px] font-bold text-white">
                          {shortcut}
                        </span>
                      )}
                    </span>
                    <span className="text-center text-xs font-semibold leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'dinheiro' && (
              <div className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="amount-received"
                    className="text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Valor recebido
                  </label>
                  <input
                    id="amount-received"
                    ref={amountReceivedInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    value={amountReceived}
                    onChange={(event) => setAmountReceived(event.target.value)}
                    placeholder="0,00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={fillExactAmount}
                      className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Exato
                      <kbd className="rounded border border-emerald-300 bg-white px-1 font-mono text-[9px]">F7</kbd>
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuickCash(50)}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      + R$ 50
                      <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[9px]">F5</kbd>
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuickCash(100)}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      + R$ 100
                      <kbd className="rounded border border-slate-300 bg-white px-1 font-mono text-[9px]">F6</kbd>
                    </button>
                    {QUICK_CASH_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAmountReceived(value.toFixed(2))}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        R$ {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className={clsx(
                    'rounded-xl p-5 text-center',
                    isCashInsufficient ? 'bg-amber-50' : 'bg-emerald-50',
                  )}
                >
                  <p
                    className={clsx(
                      'text-xs font-bold uppercase tracking-[0.2em]',
                      isCashInsufficient ? 'text-amber-600' : 'text-emerald-600',
                    )}
                  >
                    Troco
                  </p>
                  <p
                    className={clsx(
                      'mt-1 text-5xl font-black tabular-nums',
                      isCashInsufficient ? 'text-amber-600' : 'text-emerald-600',
                    )}
                  >
                    {troco !== null && troco >= 0 ? formatCurrency(troco) : '—'}
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'pix' && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                  <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white">
                    <QrCode size={80} strokeWidth={1} className="text-slate-700" />
                  </div>
                  <div className="w-full text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Chave PIX
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
                      <span className="truncate font-mono text-sm text-slate-800">{pixKey}</span>
                      <button
                        type="button"
                        onClick={copyPixKey}
                        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Copiar chave PIX"
                        title="Copiar chave PIX"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-50 p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
                    Valor a Cobrar
                  </p>
                  <p className="mt-1 text-4xl font-black tabular-nums text-emerald-600">
                    {formatCurrency(total)}
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'cartao-credito' && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Parcelamento
                  </p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {INSTALLMENT_OPTIONS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setInstallments(n)}
                        className={clsx(
                          'rounded-lg border-2 py-2 text-xs font-semibold transition-colors',
                          installments === n
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300',
                        )}
                      >
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    {installments}x de
                  </p>
                  <p className="mt-1 text-4xl font-black tabular-nums text-slate-800">
                    {formatCurrency(total / installments)}
                  </p>
                </div>
              </div>
            )}

            {paymentMethod === 'cartao-debito' && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5 text-center">
                <Wallet size={28} className="mx-auto text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  Insira ou aproxime o cartão de débito na maquininha
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums text-slate-800">
                  {formatCurrency(total)}
                </p>
              </div>
            )}

            {paymentMethod === 'crediario' && (
              <div className="mt-4 space-y-3">
                {selectedClient && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                          <User size={16} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-blue-900">{selectedClient.name}</p>
                          <p className="font-mono text-xs text-blue-700">{selectedClient.cpfCnpj}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={unlinkClient}
                        className="rounded-md p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
                        aria-label="Trocar cliente"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="mt-2 space-y-1 text-xs text-blue-800">
                      <p className="flex items-center gap-1.5">
                        <Phone size={12} className="shrink-0" />
                        {selectedClient.phone}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <MapPin size={12} className="shrink-0" />
                        {formatAddressSummary(selectedClient.address)}
                      </p>
                    </div>
                  </div>
                )}

                {!selectedClient && (
                  <div>
                    <label
                      htmlFor="client-search"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Cliente
                    </label>
                    <div className="relative mt-1">
                      <Search
                        size={16}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="client-search"
                        ref={clientSearchInputRef}
                        type="text"
                        autoFocus
                        value={clientSearchTerm}
                        onChange={(event) => setClientSearchTerm(event.target.value)}
                        placeholder="Buscar por nome, CPF ou CNPJ…"
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />

                      {filteredClients.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                          {filteredClients.map((client) => (
                            <li key={client.id}>
                              <button
                                type="button"
                                onClick={() => selectClient(client)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                              >
                                <span>
                                  <span className="block text-slate-800">{client.name}</span>
                                  <span className="block font-mono text-xs text-slate-400">
                                    {client.cpfCnpj}
                                  </span>
                                </span>
                                <span className="shrink-0 text-xs text-slate-400">
                                  Limite {formatCurrency(client.creditLimit - client.balance)}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openNewClientModal}
                      className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      <UserPlus size={14} />
                      Cadastrar Cliente
                    </button>
                  </div>
                )}

                {selectedClient && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Limite Disponível
                      </p>
                      <p
                        className={clsx(
                          'mt-1 text-lg font-bold tabular-nums',
                          isCreditInsufficient ? 'text-amber-600' : 'text-emerald-600',
                        )}
                      >
                        {formatCurrency(creditAvailable)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Saldo Devedor Atual
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-slate-700">
                        {formatCurrency(selectedClient.balance)}
                      </p>
                    </div>
                  </div>
                )}

                {!selectedClient && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <AlertTriangle size={13} />
                    Selecione um cliente cadastrado para continuar
                  </p>
                )}

                {selectedClient && isCreditInsufficient && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <AlertTriangle size={13} />
                    Limite de crédito insuficiente para esta compra
                  </p>
                )}
              </div>
            )}

            {paymentMethod === 'misto' && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-medium text-slate-500">
                  Divida o valor entre as formas de pagamento abaixo.
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      htmlFor="split-dinheiro"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Dinheiro
                    </label>
                    <input
                      id="split-dinheiro"
                      ref={splitDinheiroInputRef}
                      type="number"
                      step="0.01"
                      min="0"
                      autoFocus
                      value={splitPayments.dinheiro}
                      onChange={(event) => updateSplitPayment('dinheiro', event.target.value)}
                      placeholder="0,00"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="split-cartao"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Cartão
                    </label>
                    <input
                      id="split-cartao"
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitPayments.cartao}
                      onChange={(event) => updateSplitPayment('cartao', event.target.value)}
                      placeholder="0,00"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="split-pix"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      PIX
                    </label>
                    <input
                      id="split-pix"
                      type="number"
                      step="0.01"
                      min="0"
                      value={splitPayments.pix}
                      onChange={(event) => updateSplitPayment('pix', event.target.value)}
                      placeholder="0,00"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-2 text-sm font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div
                  className={clsx(
                    'rounded-xl p-4 text-center',
                    isSplitInsufficient
                      ? 'bg-amber-50'
                      : splitTroco > 0
                        ? 'bg-emerald-50'
                        : 'bg-slate-50',
                  )}
                >
                  {isSplitInsufficient ? (
                    <>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-600">
                        Falta Alocar
                      </p>
                      <p className="mt-1 text-3xl font-black tabular-nums text-amber-600">
                        {formatCurrency(splitRemaining)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
                        Troco (Dinheiro)
                      </p>
                      <p className="mt-1 text-3xl font-black tabular-nums text-emerald-600">
                        {splitTroco > 0 ? formatCurrency(splitTroco) : formatCurrency(0)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4">
              <label
                htmlFor="note-document"
                className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                <IdCard size={13} />
                CPF/CNPJ na Nota (opcional)
                <kbd className="rounded border border-slate-300 bg-slate-100 px-1 py-0.5 font-mono text-[9px] text-slate-500">
                  F8
                </kbd>
              </label>
              <input
                id="note-document"
                ref={noteDocumentInputRef}
                type="text"
                value={noteDocument}
                onChange={(event) => setNoteDocument(event.target.value)}
                placeholder="000.000.000-00"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Impressão do Cupom
              </p>
              <div className="mt-1 flex flex-col gap-1.5">
                {RECEIPT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setReceiptOption(option.id)}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition-colors',
                      receiptOption === option.id
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300',
                    )}
                  >
                    <option.icon size={15} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{option.label}</span>
                      <span className="block text-xs font-normal leading-tight text-slate-400">
                        {option.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
              </>
            )}

            {isDeliveryMode && (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Como Este Pedido Será Pago?
                  </p>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => selectDeliverySettlementType('pago')}
                      className={clsx(
                        'flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-all',
                        deliverySettlementType === 'pago'
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-500/10'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                        <CheckCircle2 size={16} className="shrink-0" />
                        Já Pago no Caixa
                      </span>
                      <span className="text-xs font-normal leading-tight text-slate-400">
                        PIX, cartão ou dinheiro agora — liquida no caixa
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => selectDeliverySettlementType('pendente')}
                      className={clsx(
                        'flex flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-all',
                        deliverySettlementType === 'pendente'
                          ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm shadow-amber-500/10'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
                        <Banknote size={16} className="shrink-0" />
                        Receber na Entrega
                      </span>
                      <span className="text-xs font-normal leading-tight text-slate-400">
                        Motoboy cobra na porta (troco/maquininha)
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Nome do Cliente
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={deliveryForm.clientName}
                      onChange={(event) => updateDeliveryField('clientName', event.target.value)}
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
                      value={deliveryForm.phone}
                      onChange={(event) => updateDeliveryField('phone', event.target.value)}
                      placeholder="(11) 90000-0000"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Rua / Avenida
                    </label>
                    <input
                      type="text"
                      value={deliveryForm.address.street}
                      onChange={(event) => updateDeliveryAddressField('street', event.target.value)}
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
                      value={deliveryForm.address.number}
                      onChange={(event) => updateDeliveryAddressField('number', event.target.value)}
                      placeholder="123"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={deliveryForm.address.neighborhood}
                      onChange={(event) => updateDeliveryAddressField('neighborhood', event.target.value)}
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
                      value={deliveryForm.address.city}
                      onChange={(event) => updateDeliveryAddressField('city', event.target.value)}
                      placeholder="Cidade - UF"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Ponto de Referência
                  </label>
                  <input
                    type="text"
                    value={deliveryForm.referencePoint}
                    onChange={(event) => updateDeliveryField('referencePoint', event.target.value)}
                    placeholder="Ex: Portão azul, ao lado do mercado"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <CalendarDays size={13} />
                    Data Prevista de Entrega
                  </label>
                  <input
                    type="date"
                    value={deliveryForm.expectedDeliveryDate}
                    onChange={(event) => updateDeliveryField('expectedDeliveryDate', event.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <StickyNote size={13} />
                    Observações
                  </label>
                  <textarea
                    rows={2}
                    value={deliveryForm.notes}
                    onChange={(event) => updateDeliveryField('notes', event.target.value)}
                    placeholder="Ex: sem cebola, entregar após as 18h…"
                    className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                {deliverySettlementType === 'pago' ? (
                  <>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Forma de Pagamento (Recebido Agora)
                      </p>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {DELIVERY_ADVANCE_PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPaymentMethod(id)}
                            className={clsx(
                              'flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 transition-all',
                              paymentMethod === id
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-500/10'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                            )}
                          >
                            <Icon size={18} />
                            <span className="text-center text-xs font-semibold leading-tight">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {paymentMethod === 'dinheiro' ? (
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Valor Recebido
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amountReceived}
                          onChange={(event) => setAmountReceived(event.target.value)}
                          placeholder="0,00"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={fillExactAmount}
                            className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          >
                            Exato
                          </button>
                          {QUICK_CASH_OPTIONS.map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setAmountReceived(value.toFixed(2))}
                              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              R$ {value}
                            </button>
                          ))}
                        </div>
                        <div
                          className={clsx(
                            'mt-2 rounded-xl p-4 text-center',
                            isCashInsufficient ? 'bg-amber-50' : 'bg-emerald-50',
                          )}
                        >
                          <p
                            className={clsx(
                              'text-xs font-bold uppercase tracking-[0.2em]',
                              isCashInsufficient ? 'text-amber-600' : 'text-emerald-600',
                            )}
                          >
                            Troco
                          </p>
                          <p
                            className={clsx(
                              'mt-1 text-3xl font-black tabular-nums',
                              isCashInsufficient ? 'text-amber-600' : 'text-emerald-600',
                            )}
                          >
                            {troco !== null && troco >= 0 ? formatCurrency(troco) : '—'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-emerald-50 p-4 text-center">
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">
                          Valor a Cobrar
                        </p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-emerald-600">
                          {formatCurrency(total)}
                        </p>
                      </div>
                    )}

                    <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 size={14} className="shrink-0" />
                      Pagamento liquidado no caixa agora. O pedido sairá como "Pago / Pronto para Envio" no Delivery.
                    </p>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Pagamento na Entrega
                      </p>
                      <div className="mt-1.5 grid grid-cols-3 gap-2">
                        {DELIVERY_PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setDeliveryPaymentMethod(id)}
                            className={clsx(
                              'flex flex-col items-center gap-1 rounded-xl border-2 p-2.5 transition-all',
                              deliveryPaymentMethod === id
                                ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm shadow-sky-500/10'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                            )}
                          >
                            <Icon size={18} />
                            <span className="text-center text-xs font-semibold leading-tight">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {deliveryPaymentMethod === 'dinheiro' && (
                      <div>
                        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Troco para Quanto?
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={deliveryChangeFor}
                          onChange={(event) => setDeliveryChangeFor(event.target.value)}
                          placeholder="0,00"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                        />
                      </div>
                    )}

                    <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs font-medium text-amber-700">
                      <PackageCheck size={14} className="shrink-0" />
                      O pedido sairá como "Pendente de Pagamento" — o motoboy cobra na entrega. O cupom de entrega será impresso a seguir, com o seletor de vias.
                    </p>
                  </>
                )}
              </div>
            )}
            </div>

            <div className="flex shrink-0 gap-2 border-t border-slate-100 px-6 py-4">
              <button
                type="button"
                onClick={closeConfirmModal}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={isDeliveryMode ? finalizeDeliverySale : finalizeSale}
                disabled={isDeliveryMode ? isDeliveryConfirmDisabled : isConfirmDisabled}
                className={clsx(
                  'flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300',
                  isDeliveryMode
                    ? isDeliveryAdvancePaid
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-sky-600 hover:bg-sky-700'
                    : 'bg-emerald-600 hover:bg-emerald-700',
                )}
              >
                {isDeliveryMode
                  ? isDeliveryAdvancePaid
                    ? 'Confirmar Pagamento e Enviar'
                    : 'Enviar Pedido para Delivery'
                  : 'Confirmar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: cadastro rápido de cliente (crediário) */}
      {showNewClientModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Cadastrar Cliente</h2>
              <button
                type="button"
                onClick={closeNewClientModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleNewClientSubmit} noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="new-client-cpf"
                    className="text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    CPF / CNPJ
                  </label>
                  <input
                    id="new-client-cpf"
                    type="text"
                    autoFocus
                    value={newClientForm.cpfCnpj}
                    onChange={(event) => updateNewClientField('cpfCnpj', event.target.value)}
                    placeholder="000.000.000-00"
                    className={clientFieldClasses(newClientAttemptedSubmit && !newClientForm.cpfCnpj.trim())}
                  />
                  {newClientAttemptedSubmit && !newClientForm.cpfCnpj.trim() && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertTriangle size={12} />
                      Campo obrigatório
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="new-client-phone"
                    className="text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Telefone / WhatsApp
                  </label>
                  <input
                    id="new-client-phone"
                    type="text"
                    value={newClientForm.phone}
                    onChange={(event) => updateNewClientField('phone', event.target.value)}
                    placeholder="(11) 90000-0000"
                    className={clientFieldClasses(false)}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-client-name"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Nome Completo / Razão Social
                </label>
                <input
                  id="new-client-name"
                  type="text"
                  value={newClientForm.name}
                  onChange={(event) => updateNewClientField('name', event.target.value)}
                  placeholder="Nome completo ou razão social"
                  className={clientFieldClasses(newClientAttemptedSubmit && !newClientForm.name.trim())}
                />
                {newClientAttemptedSubmit && !newClientForm.name.trim() && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertTriangle size={12} />
                    Campo obrigatório
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Endereço
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="new-client-cep"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      CEP
                    </label>
                    <input
                      id="new-client-cep"
                      type="text"
                      value={newClientForm.cep}
                      onChange={(event) => updateNewClientField('cep', event.target.value)}
                      placeholder="00000-000"
                      className={clientFieldClasses(false)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label
                      htmlFor="new-client-street"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Logradouro
                    </label>
                    <input
                      id="new-client-street"
                      type="text"
                      value={newClientForm.street}
                      onChange={(event) => updateNewClientField('street', event.target.value)}
                      placeholder="Rua, Avenida…"
                      className={clientFieldClasses(false)}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="new-client-number"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Número
                    </label>
                    <input
                      id="new-client-number"
                      type="text"
                      value={newClientForm.number}
                      onChange={(event) => updateNewClientField('number', event.target.value)}
                      placeholder="123"
                      className={clientFieldClasses(false)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-client-neighborhood"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Bairro
                    </label>
                    <input
                      id="new-client-neighborhood"
                      type="text"
                      value={newClientForm.neighborhood}
                      onChange={(event) => updateNewClientField('neighborhood', event.target.value)}
                      placeholder="Bairro"
                      className={clientFieldClasses(false)}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-client-city"
                      className="text-xs font-medium uppercase tracking-wide text-slate-500"
                    >
                      Cidade
                    </label>
                    <input
                      id="new-client-city"
                      type="text"
                      value={newClientForm.city}
                      onChange={(event) => updateNewClientField('city', event.target.value)}
                      placeholder="Cidade - UF"
                      className={clientFieldClasses(false)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="new-client-limit"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Limite de Crédito (R$)
                </label>
                <input
                  id="new-client-limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newClientForm.creditLimit}
                  onChange={(event) => updateNewClientField('creditLimit', event.target.value)}
                  placeholder="0,00"
                  className={clientFieldClasses(false)}
                />
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={closeNewClientModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: aplicar desconto (F7) */}
      {showWeightSaleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Scale size={18} className="text-teal-600" />
                Venda por Peso
              </h2>
              <button
                type="button"
                onClick={closeWeightSaleModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {weighableProducts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nenhum produto pesável cadastrado. Marque "Produto Pesável" em Produtos → Novo Produto
                para liberar a venda por peso.
              </p>
            ) : (
              <>
                <div>
                  <label
                    htmlFor="weight-sale-product"
                    className="text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Produto
                  </label>
                  <select
                    id="weight-sale-product"
                    value={weightSaleProductId}
                    onChange={(event) => setWeightSaleProductId(Number(event.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
                  >
                    {weighableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4">
                  <label
                    htmlFor="weight-sale-weight"
                    className="text-xs font-medium uppercase tracking-wide text-slate-500"
                  >
                    Peso ({(weightSaleProduct?.unit ?? 'KG').toLowerCase()})
                  </label>
                  <input
                    id="weight-sale-weight"
                    ref={weightSaleInputRef}
                    type="number"
                    step="0.001"
                    min="0"
                    value={weightSaleInput}
                    onChange={(event) => setWeightSaleInput(event.target.value)}
                    placeholder="0,000"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-base font-medium outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    {formatCurrency(weightSaleProduct?.price ?? 0)}/{(weightSaleProduct?.unit ?? 'KG').toLowerCase()}
                    {' × '}
                    {weightSaleQty.toFixed(3)} {(weightSaleProduct?.unit ?? 'KG').toLowerCase()}
                  </p>
                  <p className="mt-1 text-3xl font-black tabular-nums text-emerald-600">
                    {formatCurrency(weightSaleTotal)}
                  </p>
                </div>

                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={closeWeightSaleModal}
                    className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmWeightSale}
                    disabled={weightSaleQty <= 0}
                    className="flex-1 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Adicionar ao Carrinho
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDiscountModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Percent size={18} className="text-sky-600" />
                Aplicar Desconto
              </h2>
              <button
                type="button"
                onClick={closeDiscountModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDiscountDraftType('value')}
                className={clsx(
                  'rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                  discountDraftType === 'value'
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300',
                )}
              >
                Em R$
              </button>
              <button
                type="button"
                onClick={() => setDiscountDraftType('percent')}
                className={clsx(
                  'rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                  discountDraftType === 'percent'
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300',
                )}
              >
                Em %
              </button>
            </div>

            <div className="mt-4">
              <label
                htmlFor="discount-value"
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                {discountDraftType === 'percent' ? 'Percentual de desconto' : 'Valor do desconto'}
              </label>
              <input
                id="discount-value"
                ref={discountInputRef}
                type="number"
                step="0.01"
                min="0"
                autoFocus
                value={discountDraftValue}
                onChange={(event) => setDiscountDraftValue(event.target.value)}
                placeholder={discountDraftType === 'percent' ? '0' : '0,00'}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-base font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30"
              />
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                Total com desconto
              </p>
              <p className="mt-1 text-3xl font-black tabular-nums text-emerald-600">
                {formatCurrency(
                  Math.max(
                    0,
                    subtotal -
                      Math.min(
                        subtotal,
                        discountDraftType === 'percent'
                          ? subtotal * (parseAmount(discountDraftValue) / 100)
                          : parseAmount(discountDraftValue),
                      ),
                  ),
                )}
              </p>
            </div>

            <div className="mt-6 flex gap-2">
              {discount ? (
                <button
                  type="button"
                  onClick={removeDiscount}
                  className="flex-1 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Remover Desconto
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeDiscountModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={applyDiscount}
                className="flex-1 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: vincular cliente / CPF na nota (F8) */}
      {showClientLinkModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <UserSearch size={18} className="text-violet-600" />
                Cliente / CPF na Nota
              </h2>
              <button
                type="button"
                onClick={closeClientLinkModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {selectedClient ? (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                      <User size={16} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-violet-900">{selectedClient.name}</p>
                      <p className="font-mono text-xs text-violet-700">{selectedClient.cpfCnpj}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={unlinkClient}
                    className="rounded-md p-1 text-violet-400 hover:bg-violet-100 hover:text-violet-600"
                    aria-label="Remover vínculo"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="client-link-search"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Buscar cliente
                </label>
                <div className="relative mt-1">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="client-link-search"
                    ref={clientSearchInputRef}
                    type="text"
                    autoFocus
                    value={clientSearchTerm}
                    onChange={(event) => setClientSearchTerm(event.target.value)}
                    placeholder="Buscar por nome, CPF ou CNPJ…"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
                  />

                  {filteredClients.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                      {filteredClients.map((client) => (
                        <li key={client.id}>
                          <button
                            type="button"
                            onClick={() => {
                              selectClient(client)
                              closeClientLinkModal()
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-50"
                          >
                            <span>
                              <span className="block text-slate-800">{client.name}</span>
                              <span className="block font-mono text-xs text-slate-400">
                                {client.cpfCnpj}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowClientLinkModal(false)
                    openNewClientModal()
                  }}
                  className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700"
                >
                  <UserPlus size={14} />
                  Cadastrar Cliente
                </button>
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={closeClientLinkModal}
                className="flex-1 rounded-lg bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmação rápida de limpar carrinho (F4) */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
            <AlertTriangle size={32} className="mx-auto text-amber-500" />
            <h2 className="mt-3 text-base font-bold text-slate-900">Limpar carrinho?</h2>
            <p className="mt-1 text-sm text-slate-500">
              {itemCount} {itemCount === 1 ? 'item será removido' : 'itens serão removidos'} da
              venda atual.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={cancelClearCart}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar (ESC)
              </button>
              <button
                type="button"
                onClick={confirmClearCart}
                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Limpar (F4)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: suprimento (entrada) ou sangria (retirada) de caixa */}
      {movementModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
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
                  htmlFor="pdv-movement-amount"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Valor (R$)
                </label>
                <input
                  id="pdv-movement-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  autoFocus
                  value={movementForm.amount}
                  onChange={(event) => updateMovementField('amount', event.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label
                  htmlFor="pdv-movement-description"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Observação / Motivo{movementModal === 'sangria' ? '' : ' (opcional)'}
                </label>
                <input
                  id="pdv-movement-description"
                  type="text"
                  value={movementForm.description}
                  onChange={(event) => updateMovementField('description', event.target.value)}
                  placeholder={
                    movementModal === 'suprimento' ? 'Ex: Reforço de troco' : 'Ex: Pagamento a fornecedor'
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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

      {/* Modal: Módulo de Comandas / Mesas (F3) */}
      {showComandasModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="my-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <LayoutGrid size={18} className="text-sky-600" />
                {comandaView === 'grid'
                  ? 'Comandas / Mesas'
                  : `Comanda #${String(activeComandaId ?? '').padStart(2, '0')}`}
              </h2>
              <button
                type="button"
                onClick={closeComandasModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-6">
              {comandaView === 'grid' && (
                <>
                  <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      Livre
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                      Ocupada
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                    {comandas.map((comanda) => (
                      <ComandaCard
                        key={comanda.id}
                        comanda={comanda}
                        now={now}
                        onClick={() => openComandaDetail(comanda)}
                      />
                    ))}
                  </div>
                </>
              )}

              {comandaView === 'preview' && activeComanda && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-sky-700">
                      <span className="flex items-center gap-1.5">
                        <Clock size={13} />
                        Aberta {formatElapsedTime(activeComanda.openedAt, now)}
                      </span>
                      <span className="tabular-nums">
                        {formatCurrency(comandaSubtotal(activeComanda))}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <ul className="divide-y divide-slate-100">
                      {activeComanda.items.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-400">
                              {item.qty} × {formatCurrency(item.price)}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-800">
                            {formatCurrency(item.price * item.qty)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl bg-slate-50 p-4 text-center">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                      Total da Comanda
                    </p>
                    <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
                      {formatCurrency(comandaSubtotal(activeComanda))}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={startAddingComandaItems}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <PlusCircle size={16} />
                      Adicionar mais itens
                    </button>
                    <button
                      type="button"
                      onClick={() => printComandaPreview(activeComanda)}
                      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Receipt size={16} />
                      Imprimir Prévia da Conta
                    </button>
                    <button
                      type="button"
                      onClick={() => pullComandaToCashier(activeComanda)}
                      className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      <ArrowRightCircle size={16} />
                      Lançar para o Caixa (F2)
                    </button>
                  </div>
                </div>
              )}

              {comandaView === 'edit' && activeComanda && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      ref={comandaProductSearchInputRef}
                      type="text"
                      autoFocus
                      value={comandaProductSearch}
                      onChange={(event) => setComandaProductSearch(event.target.value)}
                      onKeyDown={handleComandaProductSearchKeyDown}
                      placeholder="Bipe o produto ou digite o código / nome…"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                    />

                    {filteredComandaProducts.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                        {filteredComandaProducts.map((product) => (
                          <li key={product.id}>
                            <button
                              type="button"
                              onClick={() => addItemToComanda(product)}
                              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-blue-50"
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

                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    {activeComanda.items.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 p-8 text-slate-400">
                        <ShoppingCart size={28} strokeWidth={1.5} />
                        <p className="text-sm">Nenhum item lançado ainda</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {activeComanda.items.map((item) => (
                          <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                              <p className="text-xs text-slate-400">
                                {formatCurrency(item.price)} / un.
                              </p>
                            </div>

                            <div className="flex items-center gap-1 rounded-md border border-slate-200">
                              <button
                                type="button"
                                onClick={() => updateComandaItemQty(item.id, -1)}
                                className="p-1.5 text-slate-500 hover:bg-slate-100"
                                aria-label="Diminuir quantidade"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="w-6 text-center text-sm font-medium tabular-nums text-slate-800">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateComandaItemQty(item.id, 1)}
                                className="p-1.5 text-slate-500 hover:bg-slate-100"
                                aria-label="Aumentar quantidade"
                              >
                                <Plus size={14} />
                              </button>
                            </div>

                            <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                              {formatCurrency(item.price * item.qty)}
                            </span>

                            <button
                              type="button"
                              onClick={() => removeComandaItem(item.id)}
                              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                              aria-label="Remover item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                      Subtotal
                    </p>
                    <p className="text-2xl font-black tabular-nums text-slate-900">
                      {formatCurrency(comandaSubtotal(activeComanda))}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={backToComandaGrid}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    <CheckCircle2 size={16} />
                    Concluir Lançamento
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Consulta de Preços em tela cheia (F11) */}
      {showPriceCheckModal && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950 print:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-6 py-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <ScanSearch size={20} className="text-violet-400" />
              Consulta de Preços
            </h2>
            <button
              type="button"
              onClick={closePriceCheckModal}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Fechar consulta de preços"
              title="Fechar (F11 ou ESC)"
            >
              <X size={20} />
            </button>
          </div>

          <div className="custom-scrollbar flex min-h-0 flex-1 flex-col items-center gap-8 overflow-y-auto px-6 py-10">
            <div className="w-full max-w-xl">
              <div className="relative">
                <ScanSearch
                  size={22}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  ref={priceCheckInputRef}
                  type="text"
                  autoFocus
                  value={priceCheckSearch}
                  onChange={(event) => {
                    setPriceCheckSearch(event.target.value)
                    setPriceCheckNotFound(false)
                  }}
                  onKeyDown={handlePriceCheckKeyDown}
                  placeholder="Bipe o produto ou digite o código / nome…"
                  className="w-full rounded-xl border-2 border-slate-700 bg-slate-900 py-5 pl-14 pr-4 text-xl font-medium text-white outline-none placeholder:text-slate-500 focus:border-violet-500"
                />
              </div>

              {priceCheckSearch.trim() && filteredPriceCheckProducts.length > 0 && (
                <ul className="mt-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                  {filteredPriceCheckProducts.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => selectPriceCheckProduct(product)}
                        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm text-slate-200 hover:bg-slate-800"
                      >
                        <span>{product.name}</span>
                        <span className="font-semibold tabular-nums text-slate-400">
                          {formatCurrency(product.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {priceCheckNotFound && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-red-400">
                  <AlertTriangle size={14} />
                  Produto não encontrado
                </p>
              )}
            </div>

            {priceCheckResult ? (
              <div className="flex w-full max-w-xl flex-col items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center">
                <Tag size={26} className="text-violet-400" />
                <p className="text-2xl font-bold text-white">{priceCheckResult.name}</p>
                <p className="font-mono text-sm text-slate-500">{priceCheckResult.code}</p>
                <p className="mt-4 text-7xl font-black tabular-nums text-emerald-400">
                  {formatCurrency(priceCheckResult.price)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-600">
                <ScanSearch size={48} strokeWidth={1} />
                <p className="text-sm">Bipe ou digite um produto para consultar o preço</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-800 px-6 py-3 text-center text-xs text-slate-500">
            Pressione ESC ou F11 para sair da consulta
          </div>
        </div>
      )}

      {/* Mini-modal: seleção rápida de variação (tamanho/cor) antes de incluir no carrinho */}
      {variationPicker && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Palette size={18} className="text-violet-600" />
                Selecione a Variação
              </h2>
              <button
                type="button"
                onClick={closeVariationPicker}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 truncate text-sm text-slate-500">{variationPicker.name}</p>

            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto custom-scrollbar">
              {variationPicker.variations.map((variation, index) => {
                const outOfStock = (Number.parseInt(variation.stock, 10) || 0) <= 0
                return (
                  <button
                    key={variation.code || index}
                    type="button"
                    disabled={outOfStock}
                    onClick={() => selectVariation(variation)}
                    className={clsx(
                      'flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all',
                      outOfStock
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                        : 'border-slate-200 text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700',
                    )}
                  >
                    <span className="text-sm font-bold leading-tight">{variationLabel(variation)}</span>
                    <span className="text-[10px] font-medium uppercase tracking-wide">
                      {outOfStock ? 'Esgotado' : `${variation.stock} em estoque`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal: seletor de vias antes de imprimir o cupom de entrega enviado pelo PDV */}
      {copiesPromptOrder && (
        <PrintCopiesModal
          title="Cupom de Entrega"
          description={`Pedido ${copiesPromptOrder.code} enviado ao Delivery — quantas vias deseja imprimir?`}
          onSelect={(copies) => {
            printDeliverySlip(copiesPromptOrder, copies)
            setCopiesPromptOrder(null)
            onGoToDelivery?.()
          }}
          onClose={() => {
            setCopiesPromptOrder(null)
            onGoToDelivery?.()
          }}
        />
      )}

      {/* Modal: fechamento de caixa do dia (resumo financeiro + impressão) */}
      <CashClosingModal open={showCloseModal} onClose={closeCloseModal} />
    </div>
  )
}
