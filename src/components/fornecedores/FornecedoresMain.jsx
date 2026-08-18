import { Fragment, useMemo, useState } from 'react'
import {
  Plus,
  X,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Truck,
  Phone,
  IdCard,
  Mail,
  User,
  Receipt,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react'
import { useSuppliers } from '../../context/SuppliersContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import { formatCurrency } from '../../utils/format'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

const EMPTY_SUPPLIER_FORM = { razaoSocial: '', cnpj: '', whatsapp: '', email: '', contatoNome: '' }
const EMPTY_BILL_FORM = { description: '', amount: '', dueDate: '' }

function isOverdue(bill) {
  return bill.status === 'pendente' && new Date(bill.dueDate) < new Date(new Date().toDateString())
}

export default function FornecedoresMain() {
  const { suppliers, setSuppliers } = useSuppliers()
  const { requestAuthorization } = useManagerAuth()
  const [expandedIds, setExpandedIds] = useState(() => new Set())

  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [supplierForm, setSupplierForm] = useState(EMPTY_SUPPLIER_FORM)

  const [billTargetSupplierId, setBillTargetSupplierId] = useState(null)
  const [billForm, setBillForm] = useState(EMPTY_BILL_FORM)

  const [deleteTarget, setDeleteTarget] = useState(null)

  const summary = useMemo(() => {
    let pending = 0
    let overdue = 0
    suppliers.forEach((supplier) => {
      supplier.bills.forEach((bill) => {
        if (bill.status !== 'pendente') return
        pending += bill.amount
        if (isOverdue(bill)) overdue += bill.amount
      })
    })
    return { pending, overdue }
  }, [suppliers])

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openNewSupplierModal() {
    setEditingSupplierId(null)
    setSupplierForm(EMPTY_SUPPLIER_FORM)
    setShowSupplierModal(true)
  }

  function openEditSupplierModal(supplier) {
    setEditingSupplierId(supplier.id)
    setSupplierForm({
      razaoSocial: supplier.razaoSocial,
      cnpj: supplier.cnpj,
      whatsapp: supplier.whatsapp,
      email: supplier.email,
      contatoNome: supplier.contatoNome,
    })
    setShowSupplierModal(true)
  }

  function updateSupplierField(field, value) {
    setSupplierForm((prev) => ({ ...prev, [field]: value }))
  }

  const canSubmitSupplier = supplierForm.razaoSocial.trim() && supplierForm.cnpj.trim()

  function handleSupplierSubmit(event) {
    event.preventDefault()
    if (!canSubmitSupplier) return

    if (editingSupplierId) {
      setSuppliers((prev) =>
        prev.map((supplier) =>
          supplier.id === editingSupplierId
            ? {
                ...supplier,
                razaoSocial: supplierForm.razaoSocial.trim(),
                cnpj: supplierForm.cnpj.trim(),
                whatsapp: supplierForm.whatsapp.trim(),
                email: supplierForm.email.trim(),
                contatoNome: supplierForm.contatoNome.trim(),
              }
            : supplier,
        ),
      )
    } else {
      const nextId = suppliers.length ? Math.max(...suppliers.map((supplier) => supplier.id)) + 1 : 1
      setSuppliers((prev) => [
        ...prev,
        {
          id: nextId,
          razaoSocial: supplierForm.razaoSocial.trim(),
          cnpj: supplierForm.cnpj.trim(),
          whatsapp: supplierForm.whatsapp.trim(),
          email: supplierForm.email.trim(),
          contatoNome: supplierForm.contatoNome.trim(),
          bills: [],
        },
      ])
    }
    setShowSupplierModal(false)
  }

  function requestDeleteSupplier(supplier) {
    setDeleteTarget(supplier)
  }

  function confirmDeleteSupplier() {
    const id = deleteTarget.id
    const name = deleteTarget.razaoSocial
    setDeleteTarget(null)
    requestAuthorization({
      tipoAcao: MANAGER_ACTIONS.EXCLUSAO_FORNECEDOR,
      title: 'Autorizar Exclusão de Fornecedor',
      description: 'Excluir um fornecedor exige o PIN do Supervisor.',
      detailLabel: name,
      onAuthorized: () => {
        setSuppliers((prev) => prev.filter((supplier) => supplier.id !== id))
      },
    })
  }

  function openBillModal(supplierId) {
    setBillTargetSupplierId(supplierId)
    setBillForm(EMPTY_BILL_FORM)
  }

  function closeBillModal() {
    setBillTargetSupplierId(null)
  }

  const canSubmitBill = billForm.description.trim() && Number.parseFloat(billForm.amount) > 0 && billForm.dueDate

  function handleBillSubmit(event) {
    event.preventDefault()
    if (!canSubmitBill) return

    setSuppliers((prev) =>
      prev.map((supplier) => {
        if (supplier.id !== billTargetSupplierId) return supplier
        const nextId = supplier.bills.length ? Math.max(...supplier.bills.map((bill) => bill.id)) + 1 : 1
        return {
          ...supplier,
          bills: [
            ...supplier.bills,
            {
              id: nextId,
              description: billForm.description.trim(),
              amount: Number.parseFloat(billForm.amount) || 0,
              dueDate: billForm.dueDate,
              status: 'pendente',
            },
          ],
        }
      }),
    )
    setExpandedIds((prev) => new Set(prev).add(billTargetSupplierId))
    setBillTargetSupplierId(null)
  }

  function toggleBillStatus(supplierId, billId) {
    setSuppliers((prev) =>
      prev.map((supplier) =>
        supplier.id !== supplierId
          ? supplier
          : {
              ...supplier,
              bills: supplier.bills.map((bill) =>
                bill.id === billId
                  ? { ...bill, status: bill.status === 'pendente' ? 'pago' : 'pendente' }
                  : bill,
              ),
            },
      ),
    )
  }

  function removeBill(supplierId, billId) {
    setSuppliers((prev) =>
      prev.map((supplier) =>
        supplier.id !== supplierId
          ? supplier
          : { ...supplier, bills: supplier.bills.filter((bill) => bill.id !== billId) },
      ),
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Fornecedores</h1>
          <p className="text-sm text-slate-500">Cadastro, boletos e compromissos de contas a pagar</p>
        </div>
        <button
          type="button"
          onClick={openNewSupplierModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
        >
          <Plus size={18} />
          Novo Fornecedor
        </button>
      </header>

      <div className="flex shrink-0 flex-wrap gap-3">
        <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Pendente</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{formatCurrency(summary.pending)}</p>
        </div>
        <div className="flex-1 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Vencidos</p>
          <p className="mt-1 text-2xl font-black tabular-nums text-red-700">{formatCurrency(summary.overdue)}</p>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-9 px-2 py-3" />
              <th className="px-2 py-3">Fornecedor</th>
              <th className="px-5 py-3">CNPJ</th>
              <th className="px-5 py-3">WhatsApp</th>
              <th className="px-5 py-3">Boletos em Aberto</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((supplier) => {
              const isExpanded = expandedIds.has(supplier.id)
              const openBills = supplier.bills.filter((bill) => bill.status === 'pendente')
              const hasOverdue = openBills.some(isOverdue)

              return (
                <Fragment key={supplier.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleExpand(supplier.id)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label={isExpanded ? 'Recolher boletos' : 'Expandir boletos'}
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-medium text-slate-800">{supplier.razaoSocial}</p>
                      {supplier.contatoNome && (
                        <p className="flex items-center gap-1 text-xs text-slate-400">
                          <User size={11} />
                          {supplier.contatoNome}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-500">{supplier.cnpj}</td>
                    <td className="px-5 py-3 text-slate-500">{supplier.whatsapp || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums font-medium text-slate-700">{openBills.length}</span>
                        {hasOverdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            <AlertTriangle size={12} />
                            Vencido
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openBillModal(supplier.id)}
                          className="rounded-md p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                          aria-label="Novo boleto"
                          title="Adicionar boleto/compromisso"
                        >
                          <Receipt size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditSupplierModal(supplier)}
                          className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          aria-label="Editar fornecedor"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDeleteSupplier(supplier)}
                          className="rounded-md p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                          aria-label="Excluir fornecedor"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-5 py-3">
                        {supplier.bills.length === 0 ? (
                          <p className="py-2 text-center text-xs text-slate-400">
                            Nenhum boleto ou compromisso cadastrado
                          </p>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-slate-400">
                                <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Descrição</th>
                                <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Vencimento</th>
                                <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Valor</th>
                                <th className="py-1.5 pr-3 font-semibold uppercase tracking-wide">Status</th>
                                <th className="py-1.5 pr-3 text-right font-semibold uppercase tracking-wide">
                                  Ações
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {supplier.bills.map((bill) => (
                                <tr key={bill.id}>
                                  <td className="py-2 pr-3 font-medium text-slate-700">{bill.description}</td>
                                  <td className="py-2 pr-3 tabular-nums text-slate-600">
                                    {dateFormatter.format(new Date(bill.dueDate))}
                                  </td>
                                  <td className="py-2 pr-3 tabular-nums text-slate-600">
                                    {formatCurrency(bill.amount)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {bill.status === 'pago' ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                                        <CheckCircle2 size={11} />
                                        Pago
                                      </span>
                                    ) : isOverdue(bill) ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-600">
                                        <AlertTriangle size={11} />
                                        Vencido
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                                        <CalendarClock size={11} />
                                        Pendente
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() => toggleBillStatus(supplier.id, bill.id)}
                                        className="rounded p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                                        title={bill.status === 'pago' ? 'Marcar como pendente' : 'Marcar como pago'}
                                      >
                                        <CheckCircle2 size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeBill(supplier.id, bill.id)}
                                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                        title="Remover"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {suppliers.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-slate-400">
            <Truck size={28} strokeWidth={1.5} />
            <p className="text-sm">Nenhum fornecedor cadastrado</p>
          </div>
        )}
      </div>

      {/* Modal: novo / editar fornecedor */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingSupplierId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h2>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSupplierSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Razão Social *</label>
                <input
                  type="text"
                  autoFocus
                  value={supplierForm.razaoSocial}
                  onChange={(event) => updateSupplierField('razaoSocial', event.target.value)}
                  placeholder="Distribuidora Boa Compra Ltda"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <IdCard size={12} />
                    CNPJ *
                  </label>
                  <input
                    type="text"
                    value={supplierForm.cnpj}
                    onChange={(event) => updateSupplierField('cnpj', event.target.value)}
                    placeholder="00.000.000/0001-00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Phone size={12} />
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={supplierForm.whatsapp}
                    onChange={(event) => updateSupplierField('whatsapp', event.target.value)}
                    placeholder="(11) 90000-0000"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <User size={12} />
                    Contato
                  </label>
                  <input
                    type="text"
                    value={supplierForm.contatoNome}
                    onChange={(event) => updateSupplierField('contatoNome', event.target.value)}
                    placeholder="Nome do vendedor/representante"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <Mail size={12} />
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(event) => updateSupplierField('email', event.target.value)}
                    placeholder="contato@fornecedor.com.br"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitSupplier}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: novo boleto/compromisso */}
      {billTargetSupplierId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Receipt size={18} className="text-emerald-600" />
                Novo Boleto / Compromisso
              </h2>
              <button
                type="button"
                onClick={closeBillModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBillSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Descrição</label>
                <input
                  type="text"
                  autoFocus
                  value={billForm.description}
                  onChange={(event) => setBillForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Ex: Boleto NF 4521"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={billForm.amount}
                    onChange={(event) => setBillForm((prev) => ({ ...prev, amount: event.target.value }))}
                    placeholder="0,00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Vencimento</label>
                  <input
                    type="date"
                    value={billForm.dueDate}
                    onChange={(event) => setBillForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={closeBillModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitBill}
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: excluir fornecedor */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Trash2 size={22} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Excluir fornecedor?</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-medium text-slate-700">{deleteTarget.razaoSocial}</span> e seus boletos
                  serão removidos permanentemente.
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
                onClick={confirmDeleteSupplier}
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
