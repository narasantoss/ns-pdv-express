import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ScanBarcode,
  Undo2,
  AlertTriangle,
  CheckCircle2,
  ShoppingBag,
  ShoppingCart,
  Plus,
  Minus,
  X,
  Trash2,
  Gift,
  Wallet,
  Ticket,
  User,
  Phone,
  ListChecks,
} from 'lucide-react'
import clsx from 'clsx'
import { onlyDigits } from '../../data/clients'
import { useClients } from '../../context/ClientsContext'
import { useProducts } from '../../context/ProductsContext'
import { usePendingSale } from '../../context/PendingSaleContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import { vendasRepo, vouchersRepo, sacolasRepo, trocasLogRepo, produtosRepo } from '../../services/db'

const RETURN_REASONS = ['Tamanho', 'Defeito', 'Desistência']
const RETURN_DESTINATIONS = [
  { id: 'estoque', label: 'Voltar ao Estoque' },
  { id: 'descarte', label: 'Avaria/Descarte' },
]
const DEFAULT_REASON = RETURN_REASONS[0]
const DEFAULT_DESTINATION = RETURN_DESTINATIONS[0].id
const VOUCHER_VALIDITY_DAYS = 90
const BAG_DAY_PRESETS = [1, 3, 7, 15]

const MAIN_TABS = [
  { id: 'trocas', label: 'Trocas & Devoluções', icon: Undo2 },
  { id: 'sacolas', label: 'Sacolas Condicionais (Provar em Casa)', icon: ShoppingBag },
]

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatCurrency(value) {
  return currency.format(Number.isFinite(value) ? value : 0)
}

function todayISO() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDateBR(isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function addDaysISO(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = fromISO.split('-').map(Number)
  const [ty, tm, td] = toISO.split('-').map(Number)
  return Math.round((new Date(ty, tm - 1, td) - new Date(fy, fm - 1, fd)) / 86400000)
}

const VOUCHER_STATUS_FILTERS = [
  { id: 'ativo', label: 'Ativos' },
  { id: 'utilizado', label: 'Utilizados' },
]

const BAG_FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendente', label: 'Pendentes' },
  { id: 'vencido', label: 'Prazo Vencido' },
  { id: 'finalizada', label: 'Finalizadas' },
]

const BAG_STATUS_CONFIG = {
  pendente: { label: 'Pendente', tone: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  vencido: { label: 'Prazo Vencido', tone: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
  finalizada: { label: 'Finalizada', tone: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
}

function getBagStatus(bag, today) {
  if (bag.resolution === 'finalizada') return { key: 'finalizada', ...BAG_STATUS_CONFIG.finalizada }
  if (bag.dueAt < today) return { key: 'vencido', ...BAG_STATUS_CONFIG.vencido }
  return { key: 'pendente', ...BAG_STATUS_CONFIG.pendente }
}

function buildSearchSuggestions(term, { sales, clients, products }) {
  const trimmed = term.trim()
  if (!trimmed) return []
  const upper = trimmed.toUpperCase()
  const lower = trimmed.toLowerCase()
  const digits = onlyDigits(trimmed)

  const saleSuggestions = sales
    .filter((sale) => sale.status !== 'estornada')
    .map((sale) => ({ sale, client: clients.find((client) => client.id === sale.clienteId) ?? null }))
    .filter(({ sale, client }) => {
      const codeMatch = `#${sale.id}`.toUpperCase().includes(upper)
      const nameMatch = client && client.name.toLowerCase().includes(lower)
      const docMatch = client && digits.length > 0 && onlyDigits(client.cpfCnpj).includes(digits)
      return codeMatch || nameMatch || docMatch
    })
    .slice(0, 5)
    .map(({ sale, client }) => ({ kind: 'sale', key: `sale-${sale.id}`, sale, client }))

  const clientSuggestions = clients
    .filter(
      (client) =>
        client.name.toLowerCase().includes(lower) ||
        (digits.length > 0 && onlyDigits(client.cpfCnpj).includes(digits)),
    )
    .map((client) => ({ kind: 'client', key: `client-${client.id}`, client }))

  const productSuggestions = products
    .filter(
      (product) => (product.code && product.code.includes(trimmed)) || product.name.toLowerCase().includes(lower),
    )
    .map((product) => ({ kind: 'product', key: `product-${product.id}`, product }))

  return [...saleSuggestions, ...clientSuggestions, ...productSuggestions].slice(0, 6)
}

const EMPTY_BAG_ITEMS = []

export default function TrocasMain() {
  const { clients, applyExternalUpdate: applyClientUpdate } = useClients()
  const { products, isLoaded: productsLoaded, applyExternalUpdate: applyProductUpdate } = useProducts()
  const { setPendingSale } = usePendingSale()
  const { requestAuthorization } = useManagerAuth()
  const [activeMainTab, setActiveMainTab] = useState('trocas')
  const today = todayISO()

  // ---------- Aba: Trocas & Devoluções ----------
  const [searchTerm, setSearchTerm] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [workingItems, setWorkingItems] = useState([])
  const [customerName, setCustomerName] = useState('')
  const [customerCpf, setCustomerCpf] = useState('')
  const [actionResult, setActionResult] = useState(null)
  const [sales, setSales] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [voucherFilter, setVoucherFilter] = useState('ativo')

  const searchInputRef = useRef(null)
  const notFoundTimeoutRef = useRef(null)
  const actionResultTimeoutRef = useRef(null)

  // Vendas e vales-crédito reais, persistidos via `vendasRepo`/`vouchersRepo`
  // (SQLite local no Tauri, fallback em localStorage no navegador — ver
  // src/services/db.js). As vendas só são carregadas depois que o catálogo de
  // produtos termina de carregar, porque `vendasRepo.listWithItems` resolve o
  // nome de cada item vendido a partir do catálogo atual — de propósito só
  // dispara quando `productsLoaded` vira true, não a cada nova referência de
  // `products` (o array muda de referência a cada reconciliação de
  // ProductsContext, o que recarregaria as vendas sem necessidade).
  useEffect(() => {
    if (!productsLoaded) return
    let cancelled = false
    const getProductName = (produtoId) => products.find((product) => product.id === produtoId)?.name
    Promise.all([vendasRepo.listWithItems(getProductName), vouchersRepo.list()]).then(([saleList, voucherList]) => {
      if (cancelled) return
      setSales(saleList)
      setVouchers(voucherList)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsLoaded])

  const suggestions = useMemo(
    () => buildSearchSuggestions(searchTerm, { sales, clients, products }),
    [searchTerm, sales, clients, products],
  )

  useEffect(() => {
    return () => {
      clearTimeout(notFoundTimeoutRef.current)
      clearTimeout(actionResultTimeoutRef.current)
    }
  }, [])

  function flashNotFound() {
    clearTimeout(notFoundTimeoutRef.current)
    setNotFound(true)
    notFoundTimeoutRef.current = setTimeout(() => setNotFound(false), 2500)
  }

  function flashActionResult(result) {
    clearTimeout(actionResultTimeoutRef.current)
    setActionResult(result)
    actionResultTimeoutRef.current = setTimeout(() => setActionResult(null), 6000)
  }

  function loadSale(sale, client) {
    const source = `#${sale.id}`
    // Rateio proporcional do desconto concedido na venda original: cada item
    // devolvido credita apenas a fração líquida realmente paga por ele, nunca
    // o preço cheio — garante que o total ressarcido (vale ou dinheiro/PIX)
    // nunca exceda o valor líquido pago pelo cliente naquela venda.
    const discountRatio = sale.totalBruto > 0 ? sale.totalLiquido / sale.totalBruto : 1
    setWorkingItems((prev) => {
      if (prev.some((item) => item.source === source)) return prev
      const newRows = sale.itens.map((item) => ({
        id: `${source}-${item.produtoId}${item.variationCode ? `-${item.variationCode}` : ''}`,
        produtoId: item.produtoId,
        variationCode: item.variationCode ?? null,
        name: item.nome,
        code: products.find((product) => product.id === item.produtoId)?.code ?? '',
        price: item.precoUnitario,
        qty: item.quantidade,
        discountRatio,
        source,
        saleId: sale.id,
        saleItemCount: sale.itens.length,
        checked: false,
        reason: DEFAULT_REASON,
        destination: DEFAULT_DESTINATION,
      }))
      return [...prev, ...newRows]
    })
    setCustomerName((prev) => prev || client?.name || '')
    setCustomerCpf((prev) => prev || client?.cpfCnpj || '')
  }

  function attachClient(client) {
    setCustomerName(client.name)
    setCustomerCpf(client.cpfCnpj)
  }

  function addLooseProduct(product) {
    setWorkingItems((prev) => [
      ...prev,
      {
        id: `avulso-${product.code}-${prev.length}-${Date.now()}`,
        produtoId: product.id,
        variationCode: null,
        name: product.name,
        code: product.code,
        price: product.price,
        qty: 1,
        discountRatio: 1,
        source: 'avulso',
        checked: false,
        reason: DEFAULT_REASON,
        destination: DEFAULT_DESTINATION,
      },
    ])
  }

  function handleSuggestionSelect(suggestion) {
    if (suggestion.kind === 'sale') loadSale(suggestion.sale, suggestion.client)
    else if (suggestion.kind === 'client') attachClient(suggestion.client)
    else if (suggestion.kind === 'product') addLooseProduct(suggestion.product)
    setSearchTerm('')
    searchInputRef.current?.focus()
  }

  function handleSearchKeyDown(event) {
    if (event.key !== 'Enter') return
    event.preventDefault()

    const term = searchTerm.trim()
    if (!term) return

    const digits = onlyDigits(term)
    const exactSale = digits
      ? sales.find((sale) => sale.id === Number.parseInt(digits, 10) && sale.status !== 'estornada')
      : null
    if (exactSale) {
      loadSale(exactSale, clients.find((client) => client.id === exactSale.clienteId) ?? null)
      setSearchTerm('')
      return
    }

    const exactProduct = products.find((product) => product.code === term)
    if (exactProduct) {
      addLooseProduct(exactProduct)
      setSearchTerm('')
      return
    }

    if (suggestions.length > 0) {
      handleSuggestionSelect(suggestions[0])
      return
    }

    flashNotFound()
  }

  function toggleWorkingItem(id) {
    setWorkingItems((prev) => prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)))
  }

  function updateWorkingItem(id, field, value) {
    setWorkingItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  function removeWorkingItem(id) {
    setWorkingItems((prev) => prev.filter((item) => item.id !== id))
  }

  function clearWorking() {
    setWorkingItems([])
    setCustomerName('')
    setCustomerCpf('')
    setSearchTerm('')
    setActionResult(null)
  }

  const selectedItems = workingItems.filter((item) => item.checked)
  // Valor a ressarcir já com o rateio do desconto original aplicado (ver
  // `loadSale`) — `discountRatio` é 1 para itens avulsos (sem venda de
  // origem, então sem desconto a ratear).
  const selectedTotal = selectedItems.reduce(
    (sum, item) => sum + item.price * item.qty * (item.discountRatio ?? 1),
    0,
  )
  const hasSelection = selectedItems.length > 0
  const canGenerateVoucher = hasSelection && customerName.trim().length > 0

  /**
   * Ids de vendas reais cujos itens devolvidos cobrem 100% dos itens
   * originais da venda — usado para remover a venda integralmente devolvida
   * do faturamento líquido do dia (Financeiro/Histórico), ver `finishReturn`.
   */
  function findFullyReturnedSaleIds(items) {
    const bySource = new Map()
    items.forEach((item) => {
      if (item.source === 'avulso') return
      const list = bySource.get(item.source) ?? []
      list.push(item)
      bySource.set(item.source, list)
    })
    const ids = []
    for (const sourceItems of bySource.values()) {
      const { saleId, saleItemCount } = sourceItems[0]
      if (saleId != null && sourceItems.length === saleItemCount) ids.push(saleId)
    }
    return ids
  }

  /**
   * Devolve ao estoque real cada item selecionado com destino "Voltar ao
   * Estoque" — respeita a variação (tamanho/cor) exata debitada na venda
   * original, quando houver. `excludeSaleIds` pula itens de vendas que serão
   * estornadas por completo (ver `finishReturn`): `vendasRepo.voidSale` já
   * devolve o estoque de cada item da venda, então restockar aqui de novo
   * duplicaria a entrada.
   */
  function restockSelectedItems(items, excludeSaleIds = []) {
    const restockables = items.filter(
      (item) =>
        item.destination === 'estoque' && item.produtoId != null && !excludeSaleIds.includes(item.saleId),
    )
    return Promise.all(
      restockables.map((item) =>
        item.variationCode
          ? produtosRepo.adjustVariationStock(item.produtoId, item.variationCode, item.qty)
          : produtosRepo.adjustStock(item.produtoId, item.qty),
      ),
    ).then((updatedProducts) => {
      updatedProducts.forEach((product) => {
        if (product) applyProductUpdate(product)
      })
    })
  }

  /**
   * Estorna por completo, em `vendas`, cada venda integralmente devolvida
   * (todos os itens originais presentes na devolução) — o registro passa a
   * `status: 'estornada'` e some do faturamento líquido do dia no
   * Financeiro/Histórico de Vendas (que já filtram por esse status), além de
   * devolver o estoque de cada item (por variação, quando houver) e reverter
   * o débito de crediário, se a venda original tiver sido paga assim.
   */
  function voidFullyReturnedSales(saleIds, reason) {
    if (saleIds.length === 0) return Promise.resolve()
    return Promise.all(saleIds.map((id) => vendasRepo.voidSale(id, reason))).then((results) => {
      results.forEach((result) => {
        if (!result) return
        result.produtosAtualizados.forEach((product) => applyProductUpdate(product))
        if (result.clienteAtualizado) applyClientUpdate(result.clienteAtualizado)
      })
      setSales((prev) =>
        prev.map((sale) => (saleIds.includes(sale.id) ? { ...sale, status: 'estornada' } : sale)),
      )
    })
  }

  function confirmVoucher() {
    if (!canGenerateVoucher) return
    const issuedAt = todayISO()
    const code = `VC-${Math.floor(10000 + Math.random() * 89999)}`
    const customer = customerName.trim()
    const items = selectedItems
    const fullyReturnedSaleIds = findFullyReturnedSaleIds(items)

    vouchersRepo
      .create({
        code,
        customerName: customer,
        value: selectedTotal,
        issuedAt,
        expiresAt: addDaysISO(issuedAt, VOUCHER_VALIDITY_DAYS),
        status: 'ativo',
      })
      .then((created) => {
        setVouchers((prev) => [created, ...prev])
        return Promise.all([
          trocasLogRepo.create({
            type: 'vale',
            customerName: customer,
            value: selectedTotal,
            items: items.map((item) => ({ name: item.name, code: item.code, price: item.price, qty: item.qty })),
          }),
          restockSelectedItems(items, fullyReturnedSaleIds),
          voidFullyReturnedSales(fullyReturnedSaleIds, `Vale-crédito ${code} - devolução integral`),
        ])
      })
      .catch((error) => console.error('[trocas] Falha ao gerar vale-crédito no banco de dados:', error))

    setWorkingItems((prev) => prev.filter((item) => !item.checked))
    flashActionResult({ type: 'vale', value: selectedTotal, code, customerName: customer })
  }

  function markVoucherUsed(id) {
    vouchersRepo
      .markUsed(id)
      .then((updated) => {
        if (updated) setVouchers((prev) => prev.map((voucher) => (voucher.id === id ? updated : voucher)))
      })
      .catch((error) => console.error('[trocas] Falha ao marcar vale como utilizado:', error))
  }

  const filteredVouchers = vouchers.filter((voucher) => voucher.status === voucherFilter)

  function confirmRefund() {
    if (!hasSelection) return
    const items = selectedItems

    requestAuthorization({
      tipoAcao: MANAGER_ACTIONS.ESTORNO_TROCA,
      title: 'Autorizar Estorno em Dinheiro/PIX',
      description: 'Digite o PIN do Supervisor para confirmar este estorno em Trocas.',
      detailLabel: `Estorno de ${formatCurrency(selectedTotal)}${customerName.trim() ? ` · ${customerName.trim()}` : ''}`,
      detalhes: {
        valor: selectedTotal,
        cliente: customerName.trim(),
        itens: items.map((item) => ({ name: item.name, code: item.code, price: item.price, qty: item.qty })),
      },
      onAuthorized: () => executeRefund(items),
    })
  }

  function executeRefund(items) {
    const fullyReturnedSaleIds = findFullyReturnedSaleIds(items)

    trocasLogRepo
      .create({
        type: 'estorno',
        customerName: customerName.trim(),
        value: selectedTotal,
        items: items.map((item) => ({ name: item.name, code: item.code, price: item.price, qty: item.qty })),
      })
      .then(() =>
        Promise.all([
          restockSelectedItems(items, fullyReturnedSaleIds),
          voidFullyReturnedSales(fullyReturnedSaleIds, 'Estorno em Dinheiro/PIX - devolução integral'),
        ]),
      )
      .catch((error) => console.error('[trocas] Falha ao registrar estorno no banco de dados:', error))

    setWorkingItems((prev) => prev.filter((item) => !item.checked))
    flashActionResult({ type: 'estorno', value: selectedTotal })
  }

  // ---------- Aba: Sacolas Condicionais ----------
  const [bags, setBags] = useState([])
  const [bagFilter, setBagFilter] = useState('todas')
  const [bagActionResult, setBagActionResult] = useState(null)
  const bagActionTimeoutRef = useRef(null)

  const [showBagModal, setShowBagModal] = useState(false)
  const [bagClientSearchTerm, setBagClientSearchTerm] = useState('')
  const [bagClient, setBagClient] = useState(null)
  const [bagProductSearchTerm, setBagProductSearchTerm] = useState('')
  const [bagItems, setBagItems] = useState(EMPTY_BAG_ITEMS)
  const [bagDays, setBagDays] = useState(3)
  const [bagAttemptedSubmit, setBagAttemptedSubmit] = useState(false)

  const [processingBag, setProcessingBag] = useState(null)
  const [processDecisions, setProcessDecisions] = useState({})

  const filteredBags = useMemo(
    () => bags.filter((bag) => bagFilter === 'todas' || getBagStatus(bag, today).key === bagFilter),
    [bags, bagFilter, today],
  )

  useEffect(() => {
    let cancelled = false
    sacolasRepo.list().then((list) => {
      if (!cancelled) setBags(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => clearTimeout(bagActionTimeoutRef.current)
  }, [])

  const filteredBagClients = useMemo(() => {
    const term = bagClientSearchTerm.trim().toLowerCase()
    if (!term || bagClient) return []
    const digits = onlyDigits(bagClientSearchTerm)
    return clients.filter((client) => {
      const nameMatch = client.name.toLowerCase().includes(term)
      const docMatch = digits.length > 0 && onlyDigits(client.cpfCnpj).includes(digits)
      return nameMatch || docMatch
    }).slice(0, 6)
  }, [bagClientSearchTerm, bagClient, clients])

  const filteredBagProducts = useMemo(() => {
    const term = bagProductSearchTerm.trim().toLowerCase()
    if (!term) return []
    return products.filter(
      (product) => product.code.includes(bagProductSearchTerm.trim()) || product.name.toLowerCase().includes(term),
    ).slice(0, 6)
  }, [bagProductSearchTerm, products])

  function openBagModal() {
    setBagClientSearchTerm('')
    setBagClient(null)
    setBagProductSearchTerm('')
    setBagItems(EMPTY_BAG_ITEMS)
    setBagDays(3)
    setBagAttemptedSubmit(false)
    setShowBagModal(true)
  }

  function selectBagClient(client) {
    setBagClient(client)
    setBagClientSearchTerm('')
  }

  function addBagProduct(product) {
    setBagItems((prev) => {
      const existing = prev.find((item) => item.code === product.code)
      if (existing) {
        return prev.map((item) => (item.code === product.code ? { ...item, qty: item.qty + 1 } : item))
      }
      return [...prev, { id: product.id, code: product.code, name: product.name, price: product.price, qty: 1 }]
    })
    setBagProductSearchTerm('')
  }

  function updateBagItemQty(id, delta) {
    setBagItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item)).filter((item) => item.qty > 0),
    )
  }

  function removeBagItem(id) {
    setBagItems((prev) => prev.filter((item) => item.id !== id))
  }

  const canSubmitBag = Boolean(bagClient) && bagItems.length > 0 && bagDays >= 1
  const bagDueDatePreview = addDaysISO(today, Number.isFinite(bagDays) ? bagDays : 0)

  function handleBagSubmit(event) {
    event.preventDefault()
    if (!canSubmitBag) {
      setBagAttemptedSubmit(true)
      return
    }

    const newBag = {
      client: { id: bagClient.id, name: bagClient.name, phone: bagClient.phone, cpfCnpj: bagClient.cpfCnpj },
      items: bagItems,
      givenAt: today,
      dueAt: bagDueDatePreview,
      resolution: null,
      decisions: {},
    }

    sacolasRepo
      .create(newBag)
      .then((created) => setBags((prev) => [created, ...prev]))
      .catch((error) => console.error('[trocas] Falha ao registrar sacola condicional no banco de dados:', error))

    setShowBagModal(false)
  }

  function openProcessModal(bag) {
    setProcessingBag(bag)
    setProcessDecisions({})
  }

  function closeProcessModal() {
    setProcessingBag(null)
  }

  function setItemDecision(itemId, decision) {
    setProcessDecisions((prev) => ({ ...prev, [itemId]: decision }))
  }

  const processAllDecided = processingBag
    ? processingBag.items.every((item) => Boolean(processDecisions[item.id]))
    : false
  const processPurchasedItems = processingBag
    ? processingBag.items.filter((item) => processDecisions[item.id] === 'compra')
    : []
  const processPurchasedTotal = processPurchasedItems.reduce((sum, item) => sum + item.price * item.qty, 0)
  const processReturnedCount = processingBag
    ? processingBag.items.filter((item) => processDecisions[item.id] === 'estoque').length
    : 0

  function finalizeProcess() {
    if (!processingBag || !processAllDecided) return

    const decisions = { ...processDecisions }
    const returnedItems = processingBag.items.filter((item) => decisions[item.id] === 'estoque')

    setBags((prev) =>
      prev.map((bag) => (bag.id === processingBag.id ? { ...bag, resolution: 'finalizada', decisions } : bag)),
    )

    sacolasRepo
      .finalize(processingBag.id, decisions)
      .then(() =>
        Promise.all(returnedItems.map((item) => produtosRepo.adjustStock(item.id, item.qty))),
      )
      .then((updatedProducts) => {
        updatedProducts.forEach((product) => {
          if (product) applyProductUpdate(product)
        })
      })
      .catch((error) => console.error('[trocas] Falha ao acertar sacola condicional no banco de dados:', error))

    // Os itens que o cliente decidiu comprar vão para o carrinho de Vendas —
    // o operador finaliza o pagamento normalmente na tela de Vendas.
    if (processPurchasedItems.length > 0) {
      setPendingSale(processPurchasedItems.map((item) => ({ id: item.id, name: item.name, price: item.price, qty: item.qty })))
    }

    clearTimeout(bagActionTimeoutRef.current)
    setBagActionResult({
      clientName: processingBag.client.name,
      purchasedTotal: processPurchasedTotal,
      purchasedCount: processPurchasedItems.length,
      returnedCount: processReturnedCount,
    })
    bagActionTimeoutRef.current = setTimeout(() => setBagActionResult(null), 6000)

    setProcessingBag(null)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <div className="flex shrink-0 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {MAIN_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveMainTab(id)}
            className={clsx(
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
              activeMainTab === id
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
            )}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeMainTab === 'trocas' && (
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {/* Busca tripla */}
          <div className="shrink-0 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/60 p-3">
            <label
              htmlFor="trocas-search"
              className="flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-widest text-blue-700"
            >
              <ScanBarcode size={14} />
              Bipar Cupom, Buscar Cliente (CPF/Nome) ou Bipar Produto Trazido
            </label>
            <div className="relative mt-2">
              <ScanBarcode
                size={20}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-400"
              />
              <input
                id="trocas-search"
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Ex.: #123 (nº da venda), nome/CPF do cliente ou código de barras…"
                className="w-full rounded-lg border-2 border-blue-200 bg-white py-3 pl-12 pr-4 text-base font-medium text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20"
              />

              {suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.key}>
                      <button
                        type="button"
                        onClick={() => handleSuggestionSelect(suggestion)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-blue-50"
                      >
                        {suggestion.kind === 'sale' && (
                          <>
                            <Ticket size={16} className="shrink-0 text-blue-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-slate-800">
                                #{suggestion.sale.id} · {suggestion.client?.name ?? 'Consumidor'}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {suggestion.sale.itens.length}{' '}
                                {suggestion.sale.itens.length === 1 ? 'item' : 'itens'} ·{' '}
                                {formatDateBR(suggestion.sale.dataVenda.slice(0, 10))}
                              </span>
                            </span>
                          </>
                        )}
                        {suggestion.kind === 'client' && (
                          <>
                            <User size={16} className="shrink-0 text-emerald-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-slate-800">{suggestion.client.name}</span>
                              <span className="block text-xs text-slate-400">
                                {suggestion.client.cpfCnpj} · Identificar cliente
                              </span>
                            </span>
                          </>
                        )}
                        {suggestion.kind === 'product' && (
                          <>
                            <ScanBarcode size={16} className="shrink-0 text-amber-500" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-slate-800">{suggestion.product.name}</span>
                              <span className="block text-xs text-slate-400">
                                {suggestion.product.code} · Adicionar item avulso (sem cupom)
                              </span>
                            </span>
                          </>
                        )}
                        <span className="shrink-0 text-xs font-medium text-slate-400">
                          {suggestion.kind === 'product' ? formatCurrency(suggestion.product.price) : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {notFound && (
              <p className="mt-1.5 flex items-center gap-1 px-1 text-xs font-medium text-red-500">
                <AlertTriangle size={14} />
                Nada encontrado para "{searchTerm}". Tente o nº da venda (ex.: #123), um nome de cliente ou um código de produto.
              </p>
            )}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Painel de simulação */}
            <section className="flex min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Simulação de Venda Carregada
                  </h2>
                  <p className="text-xs text-slate-400">Marque os itens devolvidos, o motivo e o destino</p>
                </div>
                {workingItems.length > 0 && (
                  <button
                    type="button"
                    onClick={clearWorking}
                    className="text-xs font-semibold text-slate-400 hover:text-red-500"
                  >
                    Limpar tudo
                  </button>
                )}
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                {workingItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-slate-400">
                    <Undo2 size={32} strokeWidth={1.5} />
                    <p className="text-sm">Nenhum item carregado</p>
                    <p className="max-w-xs text-center text-xs">
                      Use a busca acima para bipar um cupom, localizar o cliente ou bipar o produto trazido.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {workingItems.map((item) => (
                      <li
                        key={item.id}
                        className={clsx(
                          'flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center',
                          item.checked ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleWorkingItem(item.id)}
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-slate-400">
                              {item.qty} un. × {formatCurrency(item.price)}
                            </span>
                            <span
                              className={clsx(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                item.source === 'avulso'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-blue-50 text-blue-700',
                              )}
                            >
                              {item.source === 'avulso' ? 'Item Avulso' : `Cupom ${item.source}`}
                            </span>
                          </div>
                          {item.discountRatio != null && item.discountRatio < 0.999 && (
                            <p className="mt-0.5 text-[11px] font-medium text-amber-600">
                              Rateio do desconto original: a ressarcir{' '}
                              {formatCurrency(item.price * item.qty * item.discountRatio)}
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <select
                            value={item.reason}
                            disabled={!item.checked}
                            onChange={(event) => updateWorkingItem(item.id, 'reason', event.target.value)}
                            className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {RETURN_REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                          </select>
                          <select
                            value={item.destination}
                            disabled={!item.checked}
                            onChange={(event) => updateWorkingItem(item.id, 'destination', event.target.value)}
                            className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {RETURN_DESTINATIONS.map((destination) => (
                              <option key={destination.id} value={destination.id}>
                                {destination.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeWorkingItem(item.id)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                            aria-label="Remover item"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Card de conclusão — `overflow-y-auto` + `relative z-10` evitam que, em
                telas/janelas mais baixas, o conteúdo "vaze" para fora da altura
                esticada pelo grid e fique coberto (visualmente e para clique) pela
                seção de Vales-Crédito logo abaixo no fluxo normal do documento. */}
            <section className="relative z-10 flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Conclusão da Devolução</h2>

              <div>
                <label htmlFor="voucher-customer" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Cliente (obrigatório para vale-crédito)
                </label>
                <input
                  id="voucher-customer"
                  type="text"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nome do cliente"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                {customerCpf && <p className="mt-1 px-1 text-xs text-slate-400">CPF: {customerCpf}</p>}
              </div>

              <div className="rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">
                    {selectedItems.length} {selectedItems.length === 1 ? 'item selecionado' : 'itens selecionados'}
                  </span>
                  <span className="text-xl font-bold tabular-nums text-slate-900">
                    {formatCurrency(selectedTotal)}
                  </span>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2">
                <button
                  type="button"
                  onClick={confirmVoucher}
                  disabled={!canGenerateVoucher}
                  className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Gift size={16} />
                  Gerar Vale-Crédito (Cupom)
                </button>
                {hasSelection && !customerName.trim() && (
                  <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
                    <AlertTriangle size={12} />
                    Informe o nome do cliente para gerar o vale
                  </p>
                )}

                <button
                  type="button"
                  onClick={confirmRefund}
                  disabled={!hasSelection}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <Wallet size={16} />
                  Estornar Dinheiro/PIX
                </button>

                {actionResult && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle2 size={16} className="shrink-0" />
                    {actionResult.type === 'vale'
                      ? `Vale-crédito ${actionResult.code} de ${formatCurrency(actionResult.value)} gerado para ${actionResult.customerName}.`
                      : `Estorno de ${formatCurrency(actionResult.value)} em Dinheiro/PIX confirmado.`}
                  </p>
                )}
              </div>
            </section>
          </div>

          {/* Histórico de vales-crédito */}
          <section className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Ticket size={16} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-700">Vales-Crédito</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {filteredVouchers.length}
                </span>
              </div>
              <div className="flex gap-1.5">
                {VOUCHER_STATUS_FILTERS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVoucherFilter(id)}
                    className={clsx(
                      'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      voucherFilter === id
                        ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                        : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Código</th>
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-4 py-2.5">Valor</th>
                  <th className="px-4 py-2.5">{voucherFilter === 'utilizado' ? 'Utilizado em' : 'Validade'}</th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVouchers.map((voucher) => (
                  <tr key={voucher.id}>
                    <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{voucher.code}</td>
                    <td className="px-4 py-2.5 text-slate-700">{voucher.customerName}</td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-800">
                      {formatCurrency(voucher.value)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {voucher.status === 'utilizado' ? formatDateBR(voucher.usedAt) : formatDateBR(voucher.expiresAt)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {voucher.status === 'ativo' ? (
                        <button
                          type="button"
                          onClick={() => markVoucherUsed(voucher.id)}
                          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                        >
                          Marcar como Utilizado
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredVouchers.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-400">
                {voucherFilter === 'utilizado'
                  ? 'Nenhum vale-crédito utilizado ainda'
                  : 'Nenhum vale-crédito ativo no momento'}
              </p>
            )}
          </section>
        </div>
      )}

      {activeMainTab === 'sacolas' && (
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex shrink-0 items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Sacolas Condicionais</h2>
              <p className="text-sm text-slate-500">Itens em posse do cliente para avaliação em casa</p>
            </div>
            <button
              type="button"
              onClick={openBagModal}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
            >
              <Plus size={16} />
              Nova Sacola
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {BAG_FILTERS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setBagFilter(id)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  bagFilter === id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
                )}
              >
                {label}
              </button>
            ))}
            <span className="ml-1 text-xs text-slate-400">
              {filteredBags.length} {filteredBags.length === 1 ? 'sacola' : 'sacolas'}
            </span>
          </div>

          {bagActionResult && (
            <p className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={16} className="shrink-0" />
              {bagActionResult.purchasedCount > 0
                ? `${formatCurrency(bagActionResult.purchasedTotal)} (${bagActionResult.purchasedCount} ${bagActionResult.purchasedCount === 1 ? 'item' : 'itens'}) de ${bagActionResult.clientName} enviado(s) ao PDV.`
                : `Acerto de sacola de ${bagActionResult.clientName} concluído.`}
              {bagActionResult.returnedCount > 0 &&
                ` ${bagActionResult.returnedCount} ${bagActionResult.returnedCount === 1 ? 'item devolvido' : 'itens devolvidos'} ao estoque.`}
            </p>
          )}

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3">Emprestado em</th>
                  <th className="px-4 py-3">Prazo</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBags.map((bag) => {
                  const status = getBagStatus(bag, today)
                  const itemCount = bag.items.reduce((sum, item) => sum + item.qty, 0)
                  const itemsSummary = bag.items.map((item) => `${item.qty}x ${item.name}`).join(', ')
                  const diff = daysBetween(today, bag.dueAt)

                  return (
                    <tr key={bag.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <ShoppingBag size={16} className="mt-0.5 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">{bag.client.name}</p>
                            <p className="flex items-center gap-1 text-xs text-slate-400">
                              <Phone size={11} />
                              {bag.client.phone}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        <p className="text-slate-700">
                          {itemCount} {itemCount === 1 ? 'item' : 'itens'}
                        </p>
                        <p className="truncate text-xs text-slate-400" title={itemsSummary}>
                          {itemsSummary}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDateBR(bag.givenAt)}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-500">{formatDateBR(bag.dueAt)}</p>
                        {status.key !== 'finalizada' && (
                          <p className={clsx('text-xs', diff < 0 ? 'text-red-500' : 'text-slate-400')}>
                            {diff < 0
                              ? `Vencido há ${Math.abs(diff)} dia(s)`
                              : diff === 0
                                ? 'Vence hoje'
                                : `Vence em ${diff} dia(s)`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', status.tone)}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {status.key !== 'finalizada' ? (
                          <button
                            type="button"
                            onClick={() => openProcessModal(bag)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            <ListChecks size={14} />
                            Processar Acerto
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {filteredBags.length === 0 && (
              <div className="flex flex-col items-center gap-2 p-10 text-slate-400">
                <ShoppingBag size={28} strokeWidth={1.5} />
                <p className="text-sm">
                  {bags.length === 0 ? 'Nenhuma sacola condicional em aberto' : 'Nenhuma sacola encontrada para este filtro'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: nova sacola condicional */}
      {showBagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Nova Sacola Condicional</h2>
              <button
                type="button"
                onClick={() => setShowBagModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleBagSubmit} noValidate>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</label>

                {bagClient ? (
                  <div className="mt-1 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                          <User size={16} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-blue-900">{bagClient.name}</p>
                          <p className="flex items-center gap-1 text-xs text-blue-700">
                            <Phone size={11} />
                            {bagClient.phone}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBagClient(null)}
                        className="rounded-md p-1 text-blue-400 hover:bg-blue-100 hover:text-blue-600"
                        aria-label="Trocar cliente"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="relative mt-1">
                    <input
                      type="text"
                      autoFocus
                      value={bagClientSearchTerm}
                      onChange={(event) => setBagClientSearchTerm(event.target.value)}
                      placeholder="Buscar por nome ou CPF…"
                      className={clsx(
                        'w-full rounded-lg border bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2',
                        bagAttemptedSubmit && !bagClient
                          ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
                          : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/30',
                      )}
                    />
                    {filteredBagClients.length > 0 && (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                        {filteredBagClients.map((client) => (
                          <li key={client.id}>
                            <button
                              type="button"
                              onClick={() => selectBagClient(client)}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                            >
                              <span>
                                <span className="block text-slate-800">{client.name}</span>
                                <span className="block text-xs text-slate-400">{client.cpfCnpj}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                                <Phone size={11} />
                                {client.phone}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {bagAttemptedSubmit && !bagClient && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertTriangle size={12} />
                    Selecione um cliente cadastrado
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Produtos da Sacola
                </label>
                <div className="relative mt-1">
                  <ScanBarcode
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={bagProductSearchTerm}
                    onChange={(event) => setBagProductSearchTerm(event.target.value)}
                    placeholder="Bipe o código de barras ou digite o nome…"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                  {filteredBagProducts.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                      {filteredBagProducts.map((product) => (
                        <li key={product.id}>
                          <button
                            type="button"
                            onClick={() => addBagProduct(product)}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                          >
                            <span className="text-slate-800">{product.name}</span>
                            <span className="text-xs text-slate-400">{formatCurrency(product.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {bagItems.length > 0 ? (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {bagItems.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                          <p className="font-mono text-xs text-slate-400">{item.code}</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-md border border-slate-200">
                          <button
                            type="button"
                            onClick={() => updateBagItemQty(item.id, -1)}
                            className="p-1 text-slate-500 hover:bg-slate-100"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="w-5 text-center text-xs font-medium tabular-nums text-slate-800">
                            {item.qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateBagItemQty(item.id, 1)}
                            className="p-1 text-slate-500 hover:bg-slate-100"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeBagItem(item.id)}
                          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                          aria-label="Remover item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  bagAttemptedSubmit && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertTriangle size={12} />
                      Adicione ao menos um produto
                    </p>
                  )
                )}
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Prazo para devolução
                </label>
                <div className="mt-1 flex gap-1.5">
                  {BAG_DAY_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBagDays(preset)}
                      className={clsx(
                        'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                        bagDays === preset
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      {preset} {preset === 1 ? 'dia' : 'dias'}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    value={bagDays}
                    onChange={(event) => setBagDays(Number.parseInt(event.target.value, 10) || 0)}
                    className="w-16 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-center text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                  />
                </div>
                <p className="mt-1.5 px-1 text-xs text-slate-400">
                  Devolução até <span className="font-semibold text-slate-600">{formatDateBR(bagDueDatePreview)}</span>
                </p>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBagModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Registrar Sacola
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: processar devolução/acerto de sacola */}
      {processingBag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Acerto de Sacola</h2>
              <button
                type="button"
                onClick={closeProcessModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
              <User size={14} />
              {processingBag.client.name}
              <span className="text-slate-300">·</span>
              <Phone size={12} />
              {processingBag.client.phone}
            </p>

            <ul className="space-y-2">
              {processingBag.items.map((item) => {
                const decision = processDecisions[item.id]
                return (
                  <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">
                          {item.qty} un. × {formatCurrency(item.price)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                        {formatCurrency(item.price * item.qty)}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setItemDecision(item.id, 'compra')}
                        className={clsx(
                          'rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors',
                          decision === 'compra'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        Cliente Comprou
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemDecision(item.id, 'estoque')}
                        className={clsx(
                          'rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors',
                          decision === 'estoque'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                        )}
                      >
                        Devolveu para Estoque
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-500">Total a enviar ao PDV</span>
              <span className="text-lg font-bold tabular-nums text-slate-900">
                {formatCurrency(processPurchasedTotal)}
              </span>
            </div>

            {!processAllDecided && (
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600">
                <AlertTriangle size={12} />
                Defina o destino de todos os itens para finalizar
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={closeProcessModal}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={finalizeProcess}
                disabled={!processAllDecided}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <ShoppingCart size={16} />
                Finalizar e Gerar Venda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
