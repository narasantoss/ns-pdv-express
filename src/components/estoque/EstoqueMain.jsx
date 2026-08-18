import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  AlertTriangle,
  Printer,
  X,
  CheckCircle2,
  Pencil,
  Copy,
  Trash2,
  ChevronDown,
  ChevronRight,
  Layers,
  Shirt,
  PawPrint,
  Package,
  Lock,
  Eye,
  FolderTree,
  FileSpreadsheet,
  Download,
} from 'lucide-react'
import clsx from 'clsx'
import { useAccessControl } from '../../context/AccessControlContext'
import { useSuppliers } from '../../context/SuppliersContext'
import { useProducts } from '../../context/ProductsContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import CategoriesModal from './CategoriesModal'
import ImportProductsModal from './ImportProductsModal'
import { buildProductsExportCsv, downloadTextFile } from '../../utils/csv'

const UNIT_OPTIONS = ['UN', 'KG', 'G', 'MT', 'L', 'PAR', 'CX']

const NICHE_OPTIONS = [
  { id: 'vestuario', label: 'Vestuário/Moda', icon: Shirt },
  { id: 'petshop', label: 'Pet Shop', icon: PawPrint },
  { id: 'geral', label: 'Geral/Alimentos', icon: Package },
]

const NICHE_BADGE_TONE = {
  vestuario: 'bg-indigo-50 text-indigo-700',
  petshop: 'bg-amber-50 text-amber-700',
  geral: 'bg-slate-100 text-slate-600',
}

const TABS = [
  { id: 'geral', label: 'Dados Gerais' },
  { id: 'grade', label: 'Grade & Variações' },
  { id: 'nicho', label: 'Dados do Nicho' },
]

const STOCK_FILTERS = [
  { id: 'todos', label: 'Todos os Produtos' },
  { id: 'baixo', label: 'Estoque Baixo' },
  { id: 'esgotado', label: 'Esgotados' },
]

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatCurrency(value) {
  return currency.format(Number.isFinite(value) ? value : 0)
}

function buildCombos(sizes, colors) {
  if (sizes.length === 0 && colors.length === 0) return []
  const sizeList = sizes.length > 0 ? sizes : [null]
  const colorList = colors.length > 0 ? colors : [null]
  const combos = []
  for (const size of sizeList) {
    for (const color of colorList) {
      combos.push({ size, color })
    }
  }
  return combos
}

function comboLabel(productName, combo) {
  return [productName || 'Produto', combo.color, combo.size].filter(Boolean).join(' - ')
}

function sumStock(variations) {
  return variations.reduce((sum, variation) => sum + (Number.parseInt(variation.stock, 10) || 0), 0)
}

function collectAllCodes(products) {
  const codes = new Set()
  products.forEach((product) => {
    if (product.code) codes.add(product.code)
    product.variations.forEach((variation) => {
      if (variation.code) codes.add(variation.code)
    })
  })
  return codes
}

function suggestUniqueCode(baseCode, usedCodes) {
  const digits = baseCode.replace(/\D/g, '')
  if (!digits) return baseCode
  let next = BigInt(digits)
  let candidate
  do {
    next += 1n
    candidate = next.toString().padStart(digits.length, '0')
  } while (usedCodes.has(candidate))
  return candidate
}

function BarcodePattern({ code }) {
  const bars = code.split('').map((char, index) => ({
    isBar: index % 2 === 0,
    width: 2 + (char.charCodeAt(0) % 4),
  }))

  return (
    <div className="flex h-16 items-stretch gap-px bg-white p-2">
      {bars.map((bar, index) => (
        <div
          key={index}
          className={bar.isBar ? 'bg-slate-900' : 'bg-white'}
          style={{ width: `${bar.width}px` }}
        />
      ))}
    </div>
  )
}

const EMPTY_FORM = {
  name: '',
  code: '',
  category: '',
  supplierId: '',
  costPrice: '',
  price: '',
  unit: 'UN',
  weighable: false,
  scaleCode: '',
  stock: '',
  minStock: '',
  hasVariations: false,
  niche: '',
  brand: '',
  collection: '',
  gender: '',
  material: '',
  species: '',
  line: '',
  weight: '',
  expirationDate: '',
  batch: '',
}

function buildNicheData(form) {
  if (form.niche === 'vestuario') {
    return {
      brand: form.brand.trim(),
      collection: form.collection.trim(),
      gender: form.gender,
      material: form.material.trim(),
    }
  }
  if (form.niche === 'petshop') {
    return { species: form.species.trim(), line: form.line.trim(), weight: form.weight.trim() }
  }
  if (form.niche === 'geral') {
    return { expirationDate: form.expirationDate, batch: form.batch.trim() }
  }
  return {}
}

const PRICE_UNLOCK_KEY = 'produtos-preco'

export default function EstoqueMain({ autoOpenNew = false, onAutoOpenNewHandled } = {}) {
  const { isBalcaoMode, isUnlocked, requestUnlock } = useAccessControl()
  const { requestAuthorization } = useManagerAuth()
  const { suppliers } = useSuppliers()
  const { products, setProducts, categoryList, setCategoryList } = useProducts()
  const canEditPrices = !isBalcaoMode || isUnlocked(PRICE_UNLOCK_KEY)
  const formDisabled = isBalcaoMode
  const priceFieldsDisabled = isBalcaoMode && !canEditPrices
  const [searchTerm, setSearchTerm] = useState('')
  const [stockFilter, setStockFilter] = useState('todos')
  const [categoryFilter, setCategoryFilter] = useState('todas')
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const [showNewModal, setShowNewModal] = useState(false)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingOriginalStock, setEditingOriginalStock] = useState(null)
  const [activeTab, setActiveTab] = useState('geral')
  const [form, setForm] = useState(EMPTY_FORM)
  const [sizes, setSizes] = useState([])
  const [colors, setColors] = useState([])
  const [sizeInput, setSizeInput] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [variations, setVariations] = useState([])

  const [labelItem, setLabelItem] = useState(null)
  const [printed, setPrinted] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)

  const [showCategoriesModal, setShowCategoriesModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    setVariations((prev) => {
      const combos = buildCombos(sizes, colors)
      return combos.map((combo) => {
        const existing = prev.find((v) => v.size === combo.size && v.color === combo.color)
        return existing ?? { size: combo.size, color: combo.color, stock: '', code: '' }
      })
    })
  }, [sizes, colors])

  useEffect(() => {
    if (!autoOpenNew) return
    openNewModal()
    onAutoOpenNewHandled?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(),
    [products],
  )

  const categoryProductCounts = useMemo(() => {
    const counts = {}
    products.forEach((product) => {
      if (!product.category) return
      counts[product.category] = (counts[product.category] ?? 0) + 1
    })
    return counts
  }, [products])

  function createCategory(name) {
    setCategoryList((prev) => {
      if (prev.some((category) => category.name.toLowerCase() === name.toLowerCase())) return prev
      const nextId = prev.length ? Math.max(...prev.map((category) => category.id)) + 1 : 1
      return [...prev, { id: nextId, name }]
    })
  }

  function renameCategory(id, newName) {
    const target = categoryList.find((category) => category.id === id)
    if (!target || target.name === newName) return
    const oldName = target.name
    setCategoryList((prev) =>
      prev.map((category) => (category.id === id ? { ...category, name: newName } : category)),
    )
    setProducts((prev) =>
      prev.map((product) => (product.category === oldName ? { ...product, category: newName } : product)),
    )
  }

  function deleteCategory(id) {
    const target = categoryList.find((category) => category.id === id)
    requestAuthorization({
      tipoAcao: MANAGER_ACTIONS.EXCLUSAO_CATEGORIA,
      title: 'Autorizar Exclusão de Categoria',
      description: 'Excluir uma categoria exige o PIN do Supervisor.',
      detailLabel: target?.name,
      onAuthorized: () => {
        setCategoryList((prev) => prev.filter((category) => category.id !== id))
      },
    })
  }

  function importProductsFromCsv(rows) {
    setProducts((prev) => {
      let nextId = prev.length ? Math.max(...prev.map((product) => product.id)) + 1 : 1
      const additions = rows.map((row) => ({
        id: nextId++,
        name: row.name,
        code: row.code,
        category: row.category || 'Geral',
        costPrice: row.costPrice,
        price: row.price,
        unit: row.unit,
        stock: row.stock,
        minStock: row.minStock,
        hasVariations: false,
        sizes: [],
        colors: [],
        variations: [],
        niche: '',
        nicheData: {},
      }))
      return [...prev, ...additions]
    })

    const importedCategoryNames = Array.from(
      new Set(rows.map((row) => (row.category || 'Geral').trim()).filter(Boolean)),
    )
    setCategoryList((prev) => {
      const existingLower = new Set(prev.map((category) => category.name.toLowerCase()))
      const toAdd = importedCategoryNames.filter((name) => !existingLower.has(name.toLowerCase()))
      if (toAdd.length === 0) return prev
      let nextId = prev.length ? Math.max(...prev.map((category) => category.id)) + 1 : 1
      return [...prev, ...toAdd.map((name) => ({ id: nextId++, name }))]
    })
  }

  function handleExportProducts() {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(`produtos-${stamp}.csv`, buildProductsExportCsv(products))
  }

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return products.filter((product) => {
      const matchesSearch =
        !term ||
        product.name.toLowerCase().includes(term) ||
        (product.code && product.code.includes(term)) ||
        (product.nicheData?.brand && product.nicheData.brand.toLowerCase().includes(term)) ||
        (product.hasVariations &&
          product.variations.some((variation) => variation.code && variation.code.includes(term)))

      const matchesStock =
        stockFilter === 'todos' ||
        (stockFilter === 'esgotado' && product.stock === 0) ||
        (stockFilter === 'baixo' && product.stock > 0 && product.stock <= product.minStock)

      const matchesCategory = categoryFilter === 'todas' || product.category === categoryFilter

      return matchesSearch && matchesStock && matchesCategory
    })
  }, [products, searchTerm, stockFilter, categoryFilter])

  const canSubmit =
    form.name.trim() && form.price !== '' && (form.hasVariations ? variations.length > 0 : form.code.trim())

  // Margem de lucro calculada em tempo real a partir do formulário — alerta
  // visualmente (vermelho) quando o preço de venda ficaria abaixo do custo,
  // antes mesmo de salvar o produto.
  const formCostPrice = Number.parseFloat(form.costPrice) || 0
  const formSalePrice = Number.parseFloat(form.price) || 0
  const marginValue = formSalePrice - formCostPrice
  const marginPercent = formSalePrice > 0 ? (marginValue / formSalePrice) * 100 : 0
  const showMarginHint = form.costPrice !== '' && form.price !== ''
  const hasNegativeMargin = showMarginHint && marginValue < 0

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openNewModal() {
    setEditingProductId(null)
    setEditingOriginalStock(null)
    setForm(EMPTY_FORM)
    setSizes([])
    setColors([])
    setSizeInput('')
    setColorInput('')
    setVariations([])
    setActiveTab('geral')
    setShowNewModal(true)
  }

  function openEditModal(product) {
    setEditingProductId(product.id)
    setEditingOriginalStock(product.hasVariations ? sumStock(product.variations) : product.stock)
    setForm({
      name: product.name,
      code: product.code,
      category: product.category,
      supplierId: product.supplierId ?? '',
      costPrice: product.costPrice === 0 ? '' : String(product.costPrice),
      price: product.price === 0 ? '' : String(product.price),
      unit: product.unit,
      weighable: Boolean(product.weighable),
      scaleCode: product.scaleCode ?? '',
      stock: product.hasVariations ? '' : String(product.stock),
      minStock: String(product.minStock),
      hasVariations: product.hasVariations,
      niche: product.niche,
      brand: product.nicheData?.brand ?? '',
      collection: product.nicheData?.collection ?? '',
      gender: product.nicheData?.gender ?? '',
      material: product.nicheData?.material ?? '',
      species: product.nicheData?.species ?? '',
      line: product.nicheData?.line ?? '',
      weight: product.nicheData?.weight ?? '',
      expirationDate: product.nicheData?.expirationDate ?? '',
      batch: product.nicheData?.batch ?? '',
    })
    setSizes(product.sizes)
    setColors(product.colors)
    setVariations(product.variations)
    setSizeInput('')
    setColorInput('')
    setActiveTab('geral')
    setShowNewModal(true)
  }

  function duplicateProduct(product) {
    const usedCodes = collectAllCodes(products)
    const newId = products.length ? Math.max(...products.map((item) => item.id)) + 1 : 1

    let newCode = ''
    if (!product.hasVariations && product.code) {
      newCode = suggestUniqueCode(product.code, usedCodes)
      usedCodes.add(newCode)
    }

    const newVariations = product.variations.map((variation) => {
      if (!variation.code) return { ...variation }
      const code = suggestUniqueCode(variation.code, usedCodes)
      usedCodes.add(code)
      return { ...variation, code }
    })

    const duplicated = {
      ...product,
      id: newId,
      name: `${product.name} (Cópia)`,
      code: newCode,
      sizes: [...product.sizes],
      colors: [...product.colors],
      variations: newVariations,
      nicheData: { ...product.nicheData },
    }

    setProducts((prev) => [...prev, duplicated])
  }

  function requestDelete(product) {
    setDeleteTarget(product)
  }

  function cancelDelete() {
    setDeleteTarget(null)
  }

  function confirmDelete() {
    if (!deleteTarget) return
    const id = deleteTarget.id
    const name = deleteTarget.name
    setDeleteTarget(null)
    requestAuthorization({
      tipoAcao: MANAGER_ACTIONS.EXCLUSAO_PRODUTO,
      title: 'Autorizar Exclusão de Produto',
      description: 'Excluir um produto do estoque exige o PIN do Supervisor.',
      detailLabel: name,
      onAuthorized: () => {
        setProducts((prev) => prev.filter((product) => product.id !== id))
        setExpandedIds((prev) => {
          if (!prev.has(id)) return prev
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      },
    })
  }

  function addSize() {
    const value = sizeInput.trim()
    if (!value) return
    setSizes((prev) => (prev.includes(value) ? prev : [...prev, value]))
    setSizeInput('')
  }

  function removeSize(value) {
    setSizes((prev) => prev.filter((size) => size !== value))
  }

  function addColor() {
    const value = colorInput.trim()
    if (!value) return
    setColors((prev) => (prev.includes(value) ? prev : [...prev, value]))
    setColorInput('')
  }

  function removeColor(value) {
    setColors((prev) => prev.filter((color) => color !== value))
  }

  function updateVariationField(index, field, value) {
    setVariations((prev) => prev.map((variation, i) => (i === index ? { ...variation, [field]: value } : variation)))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    const finalVariations = form.hasVariations
      ? variations.map((variation) => ({
          size: variation.size,
          color: variation.color,
          stock: Number.parseInt(variation.stock, 10) || 0,
          code: variation.code.trim(),
        }))
      : []

    const productData = {
      name: form.name.trim(),
      code: form.hasVariations ? '' : form.code.trim(),
      category: form.category.trim() || 'Geral',
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      costPrice: Number.parseFloat(form.costPrice) || 0,
      price: Number.parseFloat(form.price) || 0,
      unit: form.unit,
      weighable: form.weighable,
      scaleCode: form.weighable ? form.scaleCode.trim() : '',
      minStock: Number.parseInt(form.minStock, 10) || 0,
      hasVariations: form.hasVariations,
      sizes: form.hasVariations ? sizes : [],
      colors: form.hasVariations ? colors : [],
      variations: finalVariations,
      stock: form.hasVariations ? sumStock(finalVariations) : Number.parseInt(form.stock, 10) || 0,
      niche: form.niche,
      nicheData: buildNicheData(form),
    }

    const isManualStockAdjustment =
      editingProductId != null && editingOriginalStock != null && productData.stock !== editingOriginalStock

    if (isManualStockAdjustment) {
      requestAuthorization({
        tipoAcao: MANAGER_ACTIONS.AJUSTE_ESTOQUE,
        title: 'Autorizar Ajuste de Estoque',
        description: 'Alteração manual da quantidade em estoque exige o PIN do Gerente.',
        detailLabel: `${productData.name}: ${editingOriginalStock} → ${productData.stock} ${productData.unit.toLowerCase()}`,
        requireMotivo: true,
        motivoLabel: 'Motivo do ajuste',
        motivoPlaceholder: 'Ex: inventário, produto avariado, correção de contagem…',
        detalhes: {
          produtoId: editingProductId,
          produto: productData.name,
          estoqueAnterior: editingOriginalStock,
          estoqueNovo: productData.stock,
        },
        onAuthorized: () => saveProduct(productData),
      })
      return
    }

    saveProduct(productData)
  }

  function saveProduct(productData) {
    if (editingProductId) {
      setProducts((prev) =>
        prev.map((product) => (product.id === editingProductId ? { ...productData, id: editingProductId } : product)),
      )
    } else {
      const newId = products.length ? Math.max(...products.map((product) => product.id)) + 1 : 1
      setProducts((prev) => [...prev, { ...productData, id: newId }])
    }

    setShowNewModal(false)
  }

  function requestPriceUnlock() {
    requestUnlock({
      key: PRICE_UNLOCK_KEY,
      title: 'Alteração de Preço',
      description: 'Digite o PIN do Gerente/Admin para liberar a alteração de preços neste PC.',
    })
  }

  function openLabelPreview(item) {
    setPrinted(false)
    setLabelItem(item)
  }

  function closeLabelPreview() {
    setLabelItem(null)
    setPrinted(false)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            Estoque de Produtos
            {isBalcaoMode && (
              <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                <Eye size={11} />
                Somente Consulta
              </span>
            )}
          </h1>
          <p className="text-sm text-slate-500">
            {isBalcaoMode
              ? 'Consulte preços e estoque — cadastro e edição bloqueados no modo Balcão'
              : 'Consulte, cadastre e imprima etiquetas'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por nome, código de barras ou marca…"
              className="w-64 rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          {!isBalcaoMode && (
            <>
              <button
                type="button"
                onClick={() => setShowCategoriesModal(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                title="Gerenciar Categorias"
              >
                <FolderTree size={16} />
                Categorias
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                title="Importar Produtos via Planilha"
              >
                <FileSpreadsheet size={16} />
                Importar Planilha
              </button>
              <button
                type="button"
                onClick={handleExportProducts}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                title="Exportar Produtos (CSV)"
              >
                <Download size={16} />
                Exportar Produtos (CSV)
              </button>
              <button
                type="button"
                onClick={openNewModal}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
              >
                <Plus size={18} />
                Novo Produto
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex flex-wrap gap-1.5">
          {STOCK_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setStockFilter(id)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                stockFilter === id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="category-filter" className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Categoria
          </label>
          <select
            id="category-filter"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="todas">Todas</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-400">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
          </span>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-9 px-2 py-3" />
              <th className="px-2 py-3">Produto</th>
              <th className="px-5 py-3">Categoria</th>
              <th className="px-5 py-3">Preço</th>
              <th className="px-5 py-3">Estoque</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.map((product) => {
              const isLow = product.stock <= product.minStock
              const isExpanded = expandedIds.has(product.id)
              const nicheInfo = NICHE_OPTIONS.find((option) => option.id === product.niche)
              const variationBadgeLabel =
                product.sizes.length > 0
                  ? `${product.sizes.length} tamanhos disponíveis`
                  : `${product.colors.length} cores disponíveis`

              return (
                <Fragment key={product.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-2 py-3 text-center">
                      {product.hasVariations && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(product.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label={isExpanded ? 'Recolher variações' : 'Expandir variações'}
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-medium text-slate-800">{product.name}</p>
                      <p className="text-xs text-slate-400">
                        {product.hasVariations ? `${product.variations.length} combinações cadastradas` : product.code}
                      </p>
                      {(product.hasVariations || nicheInfo) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {product.hasVariations && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                              <Layers size={11} />
                              {variationBadgeLabel}
                            </span>
                          )}
                          {nicheInfo && (
                            <span
                              className={clsx(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                NICHE_BADGE_TONE[product.niche],
                              )}
                            >
                              <nicheInfo.icon size={11} />
                              {nicheInfo.label}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{product.category}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-800">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-medium text-slate-700">
                          {product.stock} {product.unit.toLowerCase()}
                        </span>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            <AlertTriangle size={12} />
                            Estoque baixo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!product.hasVariations && (
                          <button
                            type="button"
                            onClick={() =>
                              openLabelPreview({ name: product.name, price: product.price, code: product.code })
                            }
                            className="rounded-md p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                            aria-label="Imprimir etiqueta"
                            title="Imprimir etiqueta"
                          >
                            <Printer size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(product)}
                          className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label={isBalcaoMode ? 'Ver produto' : 'Editar produto'}
                          title={isBalcaoMode ? 'Ver produto' : 'Editar produto'}
                        >
                          {isBalcaoMode ? <Eye size={16} /> : <Pencil size={16} />}
                        </button>
                        {!isBalcaoMode && (
                          <>
                            <button
                              type="button"
                              onClick={() => duplicateProduct(product)}
                              className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              aria-label="Duplicar produto"
                              title="Duplicar produto"
                            >
                              <Copy size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => requestDelete(product)}
                              className="rounded-md p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Excluir produto"
                              title="Excluir produto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && product.hasVariations && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-5 py-3">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Combinação</th>
                              <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Estoque</th>
                              <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Código de Barras</th>
                              <th className="py-1.5 pr-3 text-right font-semibold uppercase tracking-wide">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {product.variations.map((variation, index) => (
                              <tr key={index}>
                                <td className="py-2 pr-3 font-medium text-slate-700">
                                  {comboLabel(product.name, variation)}
                                </td>
                                <td className="py-2 pr-3 tabular-nums">
                                  {variation.stock === 0 ? (
                                    <span className="font-semibold text-red-600">Sem estoque</span>
                                  ) : (
                                    `${variation.stock} un.`
                                  )}
                                </td>
                                <td className="py-2 pr-3 font-mono text-slate-500">{variation.code || '—'}</td>
                                <td className="py-2 pr-3 text-right">
                                  <button
                                    type="button"
                                    disabled={!variation.code}
                                    onClick={() =>
                                      openLabelPreview({
                                        name: comboLabel(product.name, variation),
                                        price: product.price,
                                        code: variation.code,
                                      })
                                    }
                                    className="rounded p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label="Imprimir etiqueta da variação"
                                    title="Imprimir etiqueta"
                                  >
                                    <Printer size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {filteredProducts.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-slate-400">
            <Search size={28} strokeWidth={1.5} />
            <p className="text-sm">Nenhum produto encontrado</p>
          </div>
        )}
      </div>

      {/* Modal: novo produto */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingProductId ? 'Editar Produto' : 'Novo Produto'}
              </h2>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 flex gap-1 border-b border-slate-200">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-400 hover:text-slate-600',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <div className="custom-scrollbar max-h-[52vh] space-y-4 overflow-y-auto pr-1">
                {activeTab === 'geral' && (
                  <>
                    {isBalcaoMode && (
                      <p className="flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
                        <Eye size={13} />
                        Modo Balcão: campos somente leitura, exceto o preço de venda (com PIN)
                      </p>
                    )}

                    <fieldset disabled={formDisabled} className="contents">
                      <div>
                        <label htmlFor="product-name" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Nome do Produto *
                        </label>
                        <input
                          id="product-name"
                          type="text"
                          autoFocus
                          value={form.name}
                          onChange={(event) => updateField('name', event.target.value)}
                          placeholder="Ex.: Camiseta Polo Piquet"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="product-code" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Código de Barras (EAN) {!form.hasVariations && '*'}
                          </label>
                          <input
                            id="product-code"
                            type="text"
                            disabled={form.hasVariations}
                            value={form.code}
                            onChange={(event) => updateField('code', event.target.value)}
                            placeholder="789…"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          {form.hasVariations && (
                            <p className="mt-1 text-xs text-slate-400">Definido por variação na aba Grade</p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor="product-category"
                            className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500"
                          >
                            <span>Categoria</span>
                            <button
                              type="button"
                              onClick={() => setShowCategoriesModal(true)}
                              className="flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-blue-600 hover:text-blue-700"
                            >
                              <FolderTree size={11} />
                              Gerenciar
                            </button>
                          </label>
                          <select
                            id="product-category"
                            value={form.category}
                            onChange={(event) => updateField('category', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            <option value="">Sem categoria</option>
                            {categoryList.map((category) => (
                              <option key={category.id} value={category.name}>
                                {category.name}
                              </option>
                            ))}
                            {form.category && !categoryList.some((category) => category.name === form.category) && (
                              <option value={form.category}>{form.category}</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="product-supplier" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Fornecedor (opcional)
                        </label>
                        <select
                          id="product-supplier"
                          value={form.supplierId}
                          onChange={(event) => updateField('supplierId', event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="">Nenhum vínculo</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.razaoSocial}
                            </option>
                          ))}
                        </select>
                      </div>
                    </fieldset>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label htmlFor="product-cost" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Preço Custo
                        </label>
                        <input
                          id="product-cost"
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={priceFieldsDisabled}
                          value={form.costPrice}
                          onChange={(event) => updateField('costPrice', event.target.value)}
                          placeholder="0,00"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="product-price"
                          className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500"
                        >
                          <span>Preço Venda *</span>
                          {priceFieldsDisabled && (
                            <button
                              type="button"
                              onClick={requestPriceUnlock}
                              className="flex items-center gap-1 text-[10px] font-bold normal-case tracking-normal text-blue-600 hover:text-blue-700"
                            >
                              <Lock size={11} />
                              Desbloquear
                            </button>
                          )}
                        </label>
                        <input
                          id="product-price"
                          type="number"
                          step="0.01"
                          min="0"
                          disabled={priceFieldsDisabled}
                          value={form.price}
                          onChange={(event) => updateField('price', event.target.value)}
                          placeholder="0,00"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                      <fieldset disabled={formDisabled} className="contents">
                        <div>
                          <label htmlFor="product-unit" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Unidade
                          </label>
                          <select
                            id="product-unit"
                            value={form.unit}
                            onChange={(event) => updateField('unit', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            {UNIT_OPTIONS.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                      </fieldset>
                    </div>

                    <fieldset disabled={formDisabled} className="contents">
                      <div className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">
                              Produto Pesável (Sacolão/Açougue/Feira)
                            </p>
                            <p className="text-xs text-slate-400">
                              Vendido por peso/fração — habilita a Venda por Peso (F9) e a leitura
                              automática de etiqueta de balança no PDV
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateField('weighable', !form.weighable)}
                            className={clsx(
                              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                              form.weighable ? 'bg-blue-600' : 'bg-slate-300',
                            )}
                            aria-pressed={form.weighable}
                            aria-label="Alternar produto pesável"
                          >
                            <span
                              className={clsx(
                                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                form.weighable ? 'translate-x-5' : 'translate-x-0.5',
                              )}
                            />
                          </button>
                        </div>

                        {form.weighable && (
                          <div className="mt-3">
                            <label
                              htmlFor="product-scale-code"
                              className="text-xs font-medium uppercase tracking-wide text-slate-500"
                            >
                              Código da Balança (4 ou 5 dígitos)
                            </label>
                            <input
                              id="product-scale-code"
                              type="text"
                              inputMode="numeric"
                              maxLength={5}
                              value={form.scaleCode}
                              onChange={(event) =>
                                updateField('scaleCode', event.target.value.replace(/\D/g, '').slice(0, 5))
                              }
                              placeholder="Ex: 1234"
                              className="mt-1 w-full max-w-[160px] rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                            />
                          </div>
                        )}
                      </div>
                    </fieldset>

                    {showMarginHint && (
                      <div
                        className={clsx(
                          'flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold',
                          hasNegativeMargin ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700',
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {hasNegativeMargin && <AlertTriangle size={13} className="shrink-0" />}
                          {hasNegativeMargin ? 'Margem negativa — venda abaixo do custo' : 'Margem de lucro'}
                        </span>
                        <span className="tabular-nums">
                          {formatCurrency(marginValue)} ({marginPercent.toFixed(1)}%)
                        </span>
                      </div>
                    )}

                    <fieldset disabled={formDisabled} className="contents">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="product-stock" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Estoque Atual
                          </label>
                          <input
                            id="product-stock"
                            type="number"
                            min="0"
                            disabled={form.hasVariations}
                            value={form.stock}
                            onChange={(event) => updateField('stock', event.target.value)}
                            placeholder="0"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          {form.hasVariations && (
                            <p className="mt-1 text-xs text-slate-400">Somado automaticamente das variações</p>
                          )}
                        </div>
                        <div>
                          <label htmlFor="product-min-stock" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Estoque Mínimo
                          </label>
                          <input
                            id="product-min-stock"
                            type="number"
                            min="0"
                            value={form.minStock}
                            onChange={(event) => updateField('minStock', event.target.value)}
                            placeholder="0"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>
                      </div>
                    </fieldset>
                  </>
                )}

                {activeTab === 'grade' && (
                  <fieldset disabled={formDisabled} className="contents">
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Produto possui variações?</p>
                        <p className="text-xs text-slate-400">Ative para produtos com grade de tamanho e/ou cor</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateField('hasVariations', !form.hasVariations)}
                        className={clsx(
                          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                          form.hasVariations ? 'bg-blue-600' : 'bg-slate-300',
                        )}
                        aria-pressed={form.hasVariations}
                        aria-label="Alternar variações"
                      >
                        <span
                          className={clsx(
                            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                            form.hasVariations ? 'translate-x-5' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    </div>

                    {form.hasVariations && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Tamanhos
                            </label>
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                value={sizeInput}
                                onChange={(event) => setSizeInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    addSize()
                                  }
                                }}
                                placeholder="Ex: P, M, G, 38, 40"
                                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                              />
                              <button
                                type="button"
                                onClick={addSize}
                                className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Adicionar
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {sizes.map((size) => (
                                <span
                                  key={size}
                                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                                >
                                  {size}
                                  <button
                                    type="button"
                                    onClick={() => removeSize(size)}
                                    aria-label={`Remover tamanho ${size}`}
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              Cores
                            </label>
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                value={colorInput}
                                onChange={(event) => setColorInput(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault()
                                    addColor()
                                  }
                                }}
                                placeholder="Ex: Preto, Branco, Azul"
                                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                              />
                              <button
                                type="button"
                                onClick={addColor}
                                className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Adicionar
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {colors.map((color) => (
                                <span
                                  key={color}
                                  className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700"
                                >
                                  {color}
                                  <button
                                    type="button"
                                    onClick={() => removeColor(color)}
                                    aria-label={`Remover cor ${color}`}
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {variations.length > 0 ? (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Combinações Geradas ({variations.length})
                            </p>
                            <div className="custom-scrollbar max-h-56 overflow-y-auto rounded-lg border border-slate-200">
                              <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-slate-50">
                                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    <th className="px-3 py-2">Combinação</th>
                                    <th className="w-28 px-3 py-2">Estoque</th>
                                    <th className="w-40 px-3 py-2">Código de Barras</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {variations.map((variation, index) => (
                                    <tr key={`${variation.size}-${variation.color}`}>
                                      <td className="px-3 py-2 text-slate-700">
                                        {comboLabel(form.name, variation)}
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="number"
                                          min="0"
                                          value={variation.stock}
                                          onChange={(event) =>
                                            updateVariationField(index, 'stock', event.target.value)
                                          }
                                          placeholder="0"
                                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="text"
                                          value={variation.code}
                                          onChange={(event) =>
                                            updateVariationField(index, 'code', event.target.value)
                                          }
                                          placeholder="EAN"
                                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-mono outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                            Adicione tamanhos e/ou cores para gerar a grade de variações.
                          </p>
                        )}
                      </>
                    )}
                  </fieldset>
                )}

                {activeTab === 'nicho' && (
                  <fieldset disabled={formDisabled} className="contents">
                    <div>
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Segmento
                      </label>
                      <div className="mt-1 grid grid-cols-3 gap-3">
                        {NICHE_OPTIONS.map(({ id, label, icon: Icon }) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => updateField('niche', form.niche === id ? '' : id)}
                            className={clsx(
                              'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                              form.niche === id
                                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md shadow-blue-500/10'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50',
                            )}
                          >
                            <Icon size={22} />
                            <span className="text-center text-xs font-semibold">{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {form.niche === 'vestuario' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="niche-brand" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Marca
                          </label>
                          <input
                            id="niche-brand"
                            type="text"
                            value={form.brand}
                            onChange={(event) => updateField('brand', event.target.value)}
                            placeholder="Ex.: Trend Wear"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div>
                          <label htmlFor="niche-collection" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Coleção
                          </label>
                          <input
                            id="niche-collection"
                            type="text"
                            value={form.collection}
                            onChange={(event) => updateField('collection', event.target.value)}
                            placeholder="Ex.: Verão 2026"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div>
                          <label htmlFor="niche-gender" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Gênero
                          </label>
                          <select
                            id="niche-gender"
                            value={form.gender}
                            onChange={(event) => updateField('gender', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          >
                            <option value="">Selecione…</option>
                            <option value="masculino">Masculino</option>
                            <option value="feminino">Feminino</option>
                            <option value="unissex">Unissex</option>
                            <option value="infantil">Infantil</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="niche-material" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Tecido/Material
                          </label>
                          <input
                            id="niche-material"
                            type="text"
                            value={form.material}
                            onChange={(event) => updateField('material', event.target.value)}
                            placeholder="Ex.: Algodão"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                      </div>
                    )}

                    {form.niche === 'petshop' && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label htmlFor="niche-species" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Animal/Espécie
                          </label>
                          <input
                            id="niche-species"
                            type="text"
                            value={form.species}
                            onChange={(event) => updateField('species', event.target.value)}
                            placeholder="Ex.: Cão, Gato"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div>
                          <label htmlFor="niche-line" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Linha
                          </label>
                          <input
                            id="niche-line"
                            type="text"
                            value={form.line}
                            onChange={(event) => updateField('line', event.target.value)}
                            placeholder="Ex.: Filhotes, Castrados"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div>
                          <label htmlFor="niche-weight" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Peso
                          </label>
                          <input
                            id="niche-weight"
                            type="text"
                            value={form.weight}
                            onChange={(event) => updateField('weight', event.target.value)}
                            placeholder="Ex.: 15kg"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                      </div>
                    )}

                    {form.niche === 'geral' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="niche-expiration" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Data de Validade
                          </label>
                          <input
                            id="niche-expiration"
                            type="date"
                            value={form.expirationDate}
                            onChange={(event) => updateField('expirationDate', event.target.value)}
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                        <div>
                          <label htmlFor="niche-batch" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Lote
                          </label>
                          <input
                            id="niche-batch"
                            type="text"
                            value={form.batch}
                            onChange={(event) => updateField('batch', event.target.value)}
                            placeholder="Ex.: L2026-08A"
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                          />
                        </div>
                      </div>
                    )}

                    {!form.niche && (
                      <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400">
                        Selecione um segmento para exibir campos específicos (opcional).
                      </p>
                    )}
                  </fieldset>
                )}
              </div>

              <div className="mt-6 flex gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {isBalcaoMode ? 'Fechar' : 'Cancelar'}
                </button>
                {(!isBalcaoMode || canEditPrices) && (
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {editingProductId ? 'Salvar Alterações' : 'Salvar Produto'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: etiqueta / impressão */}
      {labelItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Etiqueta de Produto</h2>
              <button
                type="button"
                onClick={closeLabelPreview}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center">
              <p className="truncate text-sm font-semibold text-slate-800">{labelItem.name}</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                {formatCurrency(labelItem.price)}
              </p>
              <BarcodePattern code={labelItem.code} />
              <p className="font-mono text-xs tracking-[0.3em] text-slate-500">{labelItem.code}</p>
            </div>

            {printed ? (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 size={16} />
                Etiqueta enviada para impressão!
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setPrinted(true)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Printer size={16} />
                Imprimir Etiqueta
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal: confirmação de exclusão */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Trash2 size={22} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Deseja excluir este produto?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{deleteTarget.name}</span> será removido
                  permanentemente do estoque.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <CategoriesModal
        open={showCategoriesModal}
        categories={categoryList}
        productCounts={categoryProductCounts}
        onClose={() => setShowCategoriesModal(false)}
        onCreate={createCategory}
        onRename={renameCategory}
        onDelete={deleteCategory}
      />

      <ImportProductsModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={importProductsFromCsv}
      />
    </div>
  )
}
