import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  X,
  Search,
  Trash2,
  Minus,
  FileText,
  Printer,
  ArrowRightCircle,
  CheckCircle2,
  User,
  Phone,
  CalendarClock,
  ClipboardList,
  Layers,
  Percent,
  StickyNote,
} from 'lucide-react'
import clsx from 'clsx'
import { formatCurrency } from '../../utils/format'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { usePendingSale } from '../../context/PendingSaleContext'
import { useProducts } from '../../context/ProductsContext'
import { useSession } from '../../context/SessionContext'
import { printOrcamentoWindow } from '../../utils/printReceiptWindow'
import { orcamentosRepo } from '../../services/db'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function parseAmount(value) {
  const parsed = Number.parseFloat((value ?? '').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function computeInstallmentPlan(subtotal, installments) {
  const count = Math.max(1, Number.parseInt(installments, 10) || 1)
  return { count, value: subtotal / count }
}

function computeCashDiscount(subtotal, discountType, discountValue) {
  const raw = parseAmount(discountValue)
  const amount = discountType === 'percent' ? subtotal * (raw / 100) : raw
  return Math.min(subtotal, Math.max(0, amount))
}

function orcamentoSubtotal(orcamento) {
  return orcamento.items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

const EMPTY_DRAFT = {
  clientName: '',
  clientPhone: '',
  validityDays: '7',
  items: [],
  installments: '1',
  cashDiscountType: 'percent',
  cashDiscountValue: '',
  notes: '',
}

export default function OrcamentosMain({ onGoToVendas }) {
  const { settings } = useStoreSettings()
  const { setPendingSale } = usePendingSale()
  const { products } = useProducts()
  const { currentOperator } = useSession()
  const [orcamentos, setOrcamentos] = useState([])
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [productSearch, setProductSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [convertedMessage, setConvertedMessage] = useState(false)

  // Persistência real via `orcamentosRepo` (SQLite local no Tauri, fallback
  // em localStorage no navegador — ver src/services/db.js). Ao contrário de
  // Produtos/Clientes, aqui cada mutação chama o repositório diretamente
  // (criar/editar/excluir/converter) em vez de reconciliar um array inteiro:
  // um orçamento carrega itens e campos derivados (código, desconto à vista)
  // que fazem mais sentido como operações explícitas do que como diff.
  useEffect(() => {
    let cancelled = false
    orcamentosRepo.list().then((list) => {
      if (!cancelled) setOrcamentos(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCatalog = useMemo(() => {
    const term = productSearch.trim().toLowerCase()
    if (!term) return []
    return products.filter((product) => product.name.toLowerCase().includes(term)).slice(0, 6)
  }, [productSearch, products])

  const draftSubtotal = draft.items.reduce((sum, item) => sum + item.price * item.qty, 0)
  const draftInstallmentPlan = computeInstallmentPlan(draftSubtotal, draft.installments)
  const draftCashDiscount = computeCashDiscount(draftSubtotal, draft.cashDiscountType, draft.cashDiscountValue)
  const draftCashTotal = Math.max(0, draftSubtotal - draftCashDiscount)

  function openNewBuilder() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setProductSearch('')
    setShowBuilder(true)
  }

  function openEditBuilder(orcamento) {
    setEditingId(orcamento.id)
    const days = Math.max(
      1,
      Math.round((new Date(orcamento.validUntil) - new Date(orcamento.createdAt)) / (1000 * 60 * 60 * 24)),
    )
    setDraft({
      clientName: orcamento.clientName,
      clientPhone: orcamento.clientPhone,
      validityDays: String(days),
      items: orcamento.items.map((item) => ({ ...item })),
      installments: orcamento.installments ?? '1',
      cashDiscountType: orcamento.cashDiscountType ?? 'percent',
      cashDiscountValue: orcamento.cashDiscountValue ?? '',
      notes: orcamento.notes ?? '',
    })
    setProductSearch('')
    setShowBuilder(true)
  }

  function closeBuilder() {
    setShowBuilder(false)
  }

  // ESC fecha a modal de Novo/Editar Orçamento — e, se a confirmação de
  // exclusão estiver aberta por cima da lista, fecha essa primeiro.
  useEffect(() => {
    if (!showBuilder && !deleteTarget) return
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      if (deleteTarget) {
        setDeleteTarget(null)
      } else if (showBuilder) {
        closeBuilder()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showBuilder, deleteTarget])

  function addProductToDraft(product) {
    setDraft((prev) => {
      const existing = prev.items.find((item) => item.id === product.id)
      const items = existing
        ? prev.items.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item))
        : [...prev.items, { id: product.id, name: product.name, price: product.price, qty: 1 }]
      return { ...prev, items }
    })
    setProductSearch('')
  }

  function updateDraftQty(productId, delta) {
    setDraft((prev) => ({
      ...prev,
      items: prev.items
        .map((item) => (item.id === productId ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0),
    }))
  }

  function removeDraftItem(productId) {
    setDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== productId) }))
  }

  function saveDraft(event) {
    event.preventDefault()
    if (draft.items.length === 0) return

    const now = new Date()
    const validUntil = addDays(now, Number.parseInt(draft.validityDays, 10) || 7)
    const editingOrcamento = editingId ? orcamentos.find((item) => item.id === editingId) : null

    const payload = {
      code: editingOrcamento?.code,
      clienteId: editingOrcamento?.clienteId ?? null,
      operador: editingOrcamento?.operador ?? currentOperator?.name ?? '',
      clientName: draft.clientName.trim(),
      clientPhone: draft.clientPhone.trim(),
      createdAt: editingOrcamento?.createdAt ?? now.toISOString(),
      validUntil: validUntil.toISOString(),
      installments: draft.installments,
      cashDiscountType: draft.cashDiscountType,
      cashDiscountValue: draft.cashDiscountValue,
      notes: draft.notes.trim(),
      items: draft.items,
      converted: editingOrcamento?.converted ?? false,
    }

    const persist = editingId ? orcamentosRepo.update(editingId, payload) : orcamentosRepo.create(payload)

    persist
      .then((saved) => {
        setOrcamentos((prev) =>
          editingId ? prev.map((item) => (item.id === editingId ? saved : item)) : [saved, ...prev],
        )
      })
      .catch((error) => console.error('[orcamentos] Falha ao salvar orçamento no banco de dados:', error))

    setShowBuilder(false)
  }

  function requestDelete(orcamento) {
    setDeleteTarget(orcamento)
  }

  function confirmDelete() {
    const id = deleteTarget.id
    orcamentosRepo
      .remove(id)
      .then(() => setOrcamentos((prev) => prev.filter((orcamento) => orcamento.id !== id)))
      .catch((error) => console.error('[orcamentos] Falha ao excluir orçamento no banco de dados:', error))
    setDeleteTarget(null)
  }

  function printOrcamento(orcamento, format) {
    const subtotal = orcamentoSubtotal(orcamento)
    const installmentPlan = computeInstallmentPlan(subtotal, orcamento.installments)
    const cashDiscount = computeCashDiscount(subtotal, orcamento.cashDiscountType, orcamento.cashDiscountValue)

    printOrcamentoWindow({
      storeSettings: settings,
      format,
      width: 80,
      code: orcamento.code,
      clientName: orcamento.clientName,
      clientPhone: orcamento.clientPhone,
      dateTimeLabel: dateTimeFormatter.format(new Date(orcamento.createdAt)),
      validUntilLabel: dateFormatter.format(new Date(orcamento.validUntil)),
      items: orcamento.items.map((item) => ({
        name: item.name,
        qty: item.qty,
        unitPrice: item.price,
        subtotal: item.price * item.qty,
      })),
      subtotal,
      discount: 0,
      total: subtotal,
      installmentsCount: installmentPlan.count,
      installmentValue: installmentPlan.value,
      cashTotal: Math.max(0, subtotal - cashDiscount),
      notes: orcamento.notes,
      footerMessage: settings.receiptFooter,
    })
  }

  function convertToSale(orcamento) {
    setPendingSale(orcamento.items.map((item) => ({ id: item.id, name: item.name, price: item.price, qty: item.qty })))
    setOrcamentos((prev) =>
      prev.map((item) => (item.id === orcamento.id ? { ...item, converted: true } : item)),
    )
    orcamentosRepo
      .markConverted(orcamento.id)
      .catch((error) => console.error('[orcamentos] Falha ao marcar orçamento como convertido:', error))
    setConvertedMessage(true)
    setTimeout(() => setConvertedMessage(false), 2500)
    onGoToVendas?.()
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Orçamentos</h1>
          <p className="text-sm text-slate-500">Monte, imprima e converta orçamentos comerciais em vendas</p>
        </div>
        <button
          type="button"
          onClick={openNewBuilder}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
        >
          <Plus size={18} />
          Novo Orçamento
        </button>
      </header>

      {convertedMessage && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 size={15} />
          Orçamento enviado para o carrinho de Vendas.
        </div>
      )}

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Código</th>
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">Validade</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orcamentos.map((orcamento) => {
              const expired = !orcamento.converted && new Date(orcamento.validUntil) < new Date()
              return (
                <tr key={orcamento.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-700">{orcamento.code}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{orcamento.clientName || 'Cliente não informado'}</p>
                    {orcamento.clientPhone && <p className="text-xs text-slate-400">{orcamento.clientPhone}</p>}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-500">
                    {dateFormatter.format(new Date(orcamento.validUntil))}
                  </td>
                  <td className="px-5 py-3 font-semibold tabular-nums text-slate-800">
                    {formatCurrency(orcamentoSubtotal(orcamento))}
                  </td>
                  <td className="px-5 py-3">
                    {orcamento.converted ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Convertido em Venda
                      </span>
                    ) : expired ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                        Expirado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                        Em aberto
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditBuilder(orcamento)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Editar orçamento"
                        title="Ver / Editar"
                      >
                        <FileText size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => printOrcamento(orcamento, 'bobina')}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        aria-label="Imprimir bobina"
                        title="Imprimir Bobina (80mm)"
                      >
                        <Printer size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => printOrcamento(orcamento, 'a4')}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        aria-label="Imprimir A4"
                        title="Imprimir A4"
                      >
                        <FileText size={15} />
                      </button>
                      {!orcamento.converted && (
                        <button
                          type="button"
                          onClick={() => convertToSale(orcamento)}
                          className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                          title="Transformar Orçamento em Venda"
                        >
                          <ArrowRightCircle size={14} />
                          Transformar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => requestDelete(orcamento)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Excluir orçamento"
                        title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {orcamentos.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-slate-400">
            <ClipboardList size={28} strokeWidth={1.5} />
            <p className="text-sm">Nenhum orçamento cadastrado</p>
          </div>
        )}
      </div>

      {/* Modal: montagem de orçamento */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Editar Orçamento' : 'Novo Orçamento'}
              </h2>
              <button
                type="button"
                onClick={closeBuilder}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={saveDraft} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <User size={12} />
                    Cliente
                  </label>
                  <input
                    type="text"
                    value={draft.clientName}
                    onChange={(event) => setDraft((prev) => ({ ...prev, clientName: event.target.value }))}
                    placeholder="Nome do cliente"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Phone size={12} />
                    Telefone / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={draft.clientPhone}
                    onChange={(event) => setDraft((prev) => ({ ...prev, clientPhone: event.target.value }))}
                    placeholder="(11) 90000-0000"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="mt-3 w-40">
                <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <CalendarClock size={12} />
                  Validade (dias)
                </label>
                <input
                  type="number"
                  min="1"
                  value={draft.validityDays}
                  onChange={(event) => setDraft((prev) => ({ ...prev, validityDays: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="relative mt-4">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar produto para adicionar ao orçamento…"
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                {filteredCatalog.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                    {filteredCatalog.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => addProductToDraft(product)}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-blue-50"
                        >
                          <span className="text-slate-800">{product.name}</span>
                          <span className="font-semibold text-slate-500">{formatCurrency(product.price)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                {draft.items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-8 text-slate-400">
                    <ClipboardList size={26} strokeWidth={1.5} />
                    <p className="text-sm">Nenhum item adicionado</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {draft.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                          <p className="text-xs text-slate-400">{formatCurrency(item.price)} / un.</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-md border border-slate-200">
                          <button
                            type="button"
                            onClick={() => updateDraftQty(item.id, -1)}
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
                            onClick={() => updateDraftQty(item.id, 1)}
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
                          onClick={() => removeDraftItem(item.id)}
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

              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Total do Orçamento</p>
                <p className="text-2xl font-black tabular-nums text-slate-900">{formatCurrency(draftSubtotal)}</p>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Condições de Pagamento Personalizadas
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <Layers size={12} />
                      Parcelamento
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="24"
                        value={draft.installments}
                        onChange={(event) => setDraft((prev) => ({ ...prev, installments: event.target.value }))}
                        className="w-20 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                      <span className="text-sm text-slate-500">parcela(s)</span>
                    </div>
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="font-bold text-slate-900">
                        {draftInstallmentPlan.count}x de {formatCurrency(draftInstallmentPlan.value)}
                      </span>
                      <span className="block text-xs text-slate-400">
                        Total parcelado: {formatCurrency(draftSubtotal)}
                      </span>
                    </p>
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                      <Percent size={12} />
                      Desconto à Vista (PIX/Dinheiro)
                    </label>
                    <div className="mt-1 flex gap-2">
                      <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-300">
                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, cashDiscountType: 'percent' }))}
                          className={clsx(
                            'px-3 text-sm font-semibold transition-colors',
                            draft.cashDiscountType === 'percent'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-500 hover:bg-slate-50',
                          )}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, cashDiscountType: 'value' }))}
                          className={clsx(
                            'border-l border-slate-300 px-3 text-sm font-semibold transition-colors',
                            draft.cashDiscountType === 'value'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-500 hover:bg-slate-50',
                          )}
                        >
                          R$
                        </button>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.cashDiscountValue}
                        onChange={(event) => setDraft((prev) => ({ ...prev, cashDiscountValue: event.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                      />
                    </div>
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm">
                      <span className="font-bold text-emerald-700">{formatCurrency(draftCashTotal)}</span>
                      <span className="ml-1 text-xs text-emerald-600">à vista</span>
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <StickyNote size={12} />
                    Observações e Termos da Proposta
                  </label>
                  <textarea
                    rows={3}
                    value={draft.notes}
                    onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                    placeholder="Ex: Validade da proposta, condições de frete, garantia…"
                    className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeBuilder}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={draft.items.length === 0}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Salvar Orçamento
                </button>
              </div>
            </form>
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
                <h2 className="text-lg font-bold text-slate-900">Excluir orçamento?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  O orçamento <span className="font-medium text-slate-700">{deleteTarget.code}</span> será removido
                  permanentemente.
                </p>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
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
    </div>
  )
}
