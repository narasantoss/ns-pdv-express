import { useMemo, useState } from 'react'
import {
  UserPlus,
  HandCoins,
  Eye,
  Pencil,
  Trash2,
  X,
  Phone,
  AlertTriangle,
  ShieldAlert,
  Search,
  Wallet,
  Users,
  CreditCard,
  Receipt,
  CheckCircle2,
} from 'lucide-react'
import clsx from 'clsx'
import { onlyDigits } from '../../data/clients'
import { useClients } from '../../context/ClientsContext'
import { useCashRegister } from '../../context/CashRegisterContext'
import { PAYMENT_METHODS } from '../../data/paymentMethods'

const RECEIPT_PAYMENT_METHODS = PAYMENT_METHODS.filter((method) => method.id !== 'crediario')

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatCurrency(value) {
  return currency.format(Number.isFinite(value) ? value : 0)
}

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function formatDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00`))
}

function usageTone(percent) {
  if (percent >= 100) return { bar: 'bg-red-500', text: 'text-red-600' }
  if (percent >= 60) return { bar: 'bg-amber-500', text: 'text-amber-600' }
  return { bar: 'bg-emerald-500', text: 'text-emerald-600' }
}

const STATUS_FILTERS = [
  { id: 'todos', label: 'Todos os Clientes' },
  { id: 'devedores', label: 'Devedores (Fiado)' },
  { id: 'quitados', label: 'Quitados' },
]

const EMPTY_CLIENT_FORM = {
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

function fieldClasses(invalid) {
  return clsx(
    'mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2.5 text-sm outline-none focus:ring-2',
    invalid
      ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
      : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/30',
  )
}

function StatCard({ label, value, subtitle, icon: Icon, tone }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tone.iconBg)}>
        <Icon size={20} className={tone.iconText} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={clsx('text-xl font-bold tabular-nums', tone.value)}>{value}</p>
        {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
      </div>
    </div>
  )
}

function ReceiptBarcode({ code }) {
  const bars = code.split('').map((char, index) => ({
    isBar: index % 2 === 0,
    width: 2 + (char.charCodeAt(0) % 4),
  }))

  return (
    <div className="mt-3 flex h-12 items-stretch gap-px bg-white p-2">
      {bars.map((bar, index) => (
        <div key={index} className={bar.isBar ? 'bg-slate-900' : 'bg-white'} style={{ width: `${bar.width}px` }} />
      ))}
    </div>
  )
}

export default function ClientesMain() {
  const { clients, setClients, registerMovement } = useClients()
  const { addMovement: addCashMovement, isOpen: isCashOpen } = useCashRegister()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')

  const [showNewModal, setShowNewModal] = useState(false)
  const [editingClientId, setEditingClientId] = useState(null)
  const [form, setForm] = useState(EMPTY_CLIENT_FORM)
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)

  const [paymentClient, setPaymentClient] = useState(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('dinheiro')

  const [historyClient, setHistoryClient] = useState(null)
  const [showReceipt, setShowReceipt] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)

  function showToast(message) {
    setToastMessage(message)
    window.setTimeout(() => setToastMessage(null), 3000)
  }

  const isNameInvalid = attemptedSubmit && !form.name.trim()
  // CPF/CNPJ e telefone são opcionais no cadastro — só o nome é obrigatório
  // (ver requisito de correção do cadastro de clientes: salvar mesmo com
  // esses campos em branco).
  const canSubmit = form.name.trim().length > 0

  const totals = useMemo(() => {
    const totalReceivable = clients.reduce((sum, client) => sum + client.balance, 0)
    const debtorsCount = clients.filter((client) => client.balance > 0).length
    const totalCreditGranted = clients.reduce((sum, client) => sum + client.creditLimit, 0)
    return { totalReceivable, debtorsCount, totalCreditGranted }
  }, [clients])

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const termDigits = onlyDigits(searchTerm)

    return clients.filter((client) => {
      const matchesSearch =
        !term ||
        client.name.toLowerCase().includes(term) ||
        (termDigits.length > 0 &&
          (onlyDigits(client.cpfCnpj).includes(termDigits) || onlyDigits(client.phone).includes(termDigits)))

      const matchesStatus =
        statusFilter === 'todos' ||
        (statusFilter === 'devedores' && client.balance > 0) ||
        (statusFilter === 'quitados' && client.balance === 0)

      return matchesSearch && matchesStatus
    })
  }, [clients, searchTerm, statusFilter])

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function openNewModal() {
    setEditingClientId(null)
    setForm(EMPTY_CLIENT_FORM)
    setAttemptedSubmit(false)
    setShowNewModal(true)
  }

  function openEditModal(client) {
    setEditingClientId(client.id)
    setForm({
      cpfCnpj: client.cpfCnpj,
      name: client.name,
      phone: client.phone,
      cep: client.address?.cep ?? '',
      street: client.address?.street ?? '',
      number: client.address?.number ?? '',
      neighborhood: client.address?.neighborhood ?? '',
      city: client.address?.city ?? '',
      creditLimit: String(client.creditLimit),
    })
    setAttemptedSubmit(false)
    setShowNewModal(true)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) {
      setAttemptedSubmit(true)
      return
    }

    const addressData = {
      cep: form.cep.trim(),
      street: form.street.trim(),
      number: form.number.trim(),
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
    }

    if (editingClientId) {
      setClients((prev) =>
        prev.map((client) =>
          client.id === editingClientId
            ? {
                ...client,
                cpfCnpj: form.cpfCnpj.trim(),
                name: form.name.trim(),
                phone: form.phone.trim(),
                creditLimit: Number.parseFloat(form.creditLimit) || 0,
                address: addressData,
              }
            : client,
        ),
      )
    } else {
      setClients((prev) => [
        ...prev,
        {
          id: prev.length ? Math.max(...prev.map((client) => client.id)) + 1 : 1,
          cpfCnpj: form.cpfCnpj.trim(),
          name: form.name.trim(),
          phone: form.phone.trim(),
          creditLimit: Number.parseFloat(form.creditLimit) || 0,
          balance: 0,
          address: addressData,
          history: [],
        },
      ])
    }

    setShowNewModal(false)
    showToast(editingClientId ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!')
  }

  function openPaymentModal(client) {
    setPaymentAmount('')
    setPaymentMethod('dinheiro')
    setPaymentClient(client)
  }

  function closePaymentModal() {
    setPaymentClient(null)
  }

  function handleReceivePayment(event) {
    event.preventDefault()
    const amount = Number.parseFloat(paymentAmount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0 || !paymentClient) return

    const methodLabel = RECEIPT_PAYMENT_METHODS.find((method) => method.id === paymentMethod)?.label ?? paymentMethod

    registerMovement(paymentClient.id, {
      type: 'pagamento',
      amount,
      description: `Pagamento recebido no caixa (${methodLabel})`,
    })
      .then(() => {
        // Compõe o "Esperado em Caixa" do Fechamento do Dia com a forma de
        // pagamento realmente recebida — sem isso, a baixa de crediário
        // ficava só no saldo do cliente e nunca aparecia na conferência do
        // caixa (ver CashClosingModal.jsx).
        if (isCashOpen) {
          addCashMovement(
            'recebimento',
            amount,
            `${paymentClient.name} - Recebimento de Crediário`,
            paymentMethod,
          )
        }
      })
      .catch((error) => console.error('[clientes] Falha ao registrar pagamento recebido:', error))
    setPaymentClient(null)
  }

  function openHistoryModal(client) {
    setShowReceipt(false)
    setHistoryClient(client)
  }

  function closeHistoryModal() {
    setHistoryClient(null)
    setShowReceipt(false)
  }

  function requestDelete(client) {
    setDeleteTarget(client)
  }

  function cancelDelete() {
    setDeleteTarget(null)
  }

  function confirmDelete() {
    if (!deleteTarget || deleteTarget.balance > 0) return
    const id = deleteTarget.id
    setClients((prev) => prev.filter((client) => client.id !== id))
    setDeleteTarget(null)
  }

  const dueDateLabel = useMemo(() => {
    const due = new Date()
    due.setDate(due.getDate() + 15)
    return dateFormatter.format(due)
  }, [])

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500">Limite de crédito e saldo devedor (fiado)</p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
        >
          <UserPlus size={18} />
          Novo Cliente
        </button>
      </header>

      <div className="grid shrink-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total a Receber (Fiado)"
          value={formatCurrency(totals.totalReceivable)}
          icon={Wallet}
          tone={{ iconBg: 'bg-red-50', iconText: 'text-red-600', value: 'text-red-600' }}
        />
        <StatCard
          label="Clientes Devedores"
          value={totals.debtorsCount}
          subtitle={`de ${clients.length} clientes cadastrados`}
          icon={Users}
          tone={{ iconBg: 'bg-amber-50', iconText: 'text-amber-600', value: 'text-slate-900' }}
        />
        <StatCard
          label="Limite Total Concedido"
          value={formatCurrency(totals.totalCreditGranted)}
          icon={CreditCard}
          tone={{ iconBg: 'bg-blue-50', iconText: 'text-blue-600', value: 'text-slate-900' }}
        />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="relative min-w-[240px] max-w-sm flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ ou telefone…"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                statusFilter === id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'border border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Cliente</th>
              <th className="px-5 py-3">CPF/CNPJ</th>
              <th className="px-5 py-3">Limite de Crédito</th>
              <th className="px-5 py-3">Saldo Devedor</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClients.map((client) => {
              const percent = client.creditLimit > 0 ? (client.balance / client.creditLimit) * 100 : 0
              const tone = usageTone(percent)
              return (
                <tr key={client.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{client.name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <Phone size={11} />
                      {client.phone}
                    </p>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">
                    {client.cpfCnpj || '—'}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">
                    {formatCurrency(client.creditLimit)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="w-40">
                      <div className="flex items-baseline justify-between">
                        <span className={clsx('text-sm font-semibold tabular-nums', tone.text)}>
                          {formatCurrency(client.balance)}
                        </span>
                        <span className="text-xs text-slate-400">
                          {Math.min(percent, 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={clsx('h-full rounded-full', tone.bar)}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openPaymentModal(client)}
                        disabled={client.balance === 0}
                        className="rounded-md p-2 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:text-slate-300"
                        aria-label="Receber pagamento"
                        title="Receber Pagamento"
                      >
                        <HandCoins size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openHistoryModal(client)}
                        className="rounded-md p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        aria-label="Ver histórico"
                        title="Histórico"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(client)}
                        className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Editar cliente"
                        title="Editar"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => requestDelete(client)}
                        className="rounded-md p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Excluir cliente"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filteredClients.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-10 text-slate-400">
            <Search size={28} strokeWidth={1.5} />
            <p className="text-sm">Nenhum cliente encontrado</p>
          </div>
        )}
      </div>

      {/* Modal: novo/editar cliente */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingClientId ? 'Editar Cliente' : 'Novo Cliente'}
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

            <form className="space-y-4" onSubmit={handleSubmit} noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="client-cpf" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    CPF / CNPJ (opcional)
                  </label>
                  <input
                    id="client-cpf"
                    type="text"
                    autoFocus
                    value={form.cpfCnpj}
                    onChange={(event) => updateField('cpfCnpj', event.target.value)}
                    placeholder="000.000.000-00"
                    className={fieldClasses(false)}
                  />
                </div>
                <div>
                  <label htmlFor="client-phone" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Telefone / WhatsApp (opcional)
                  </label>
                  <input
                    id="client-phone"
                    type="text"
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    placeholder="(11) 90000-0000"
                    className={fieldClasses(false)}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="client-name" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nome Completo / Razão Social *
                </label>
                <input
                  id="client-name"
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Nome completo ou razão social"
                  className={fieldClasses(isNameInvalid)}
                />
                {isNameInvalid && (
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
                    <label htmlFor="client-cep" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      CEP
                    </label>
                    <input
                      id="client-cep"
                      type="text"
                      value={form.cep}
                      onChange={(event) => updateField('cep', event.target.value)}
                      placeholder="00000-000"
                      className={fieldClasses(false)}
                    />
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="client-street" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Logradouro
                    </label>
                    <input
                      id="client-street"
                      type="text"
                      value={form.street}
                      onChange={(event) => updateField('street', event.target.value)}
                      placeholder="Rua, Avenida…"
                      className={fieldClasses(false)}
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="client-number" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Número
                    </label>
                    <input
                      id="client-number"
                      type="text"
                      value={form.number}
                      onChange={(event) => updateField('number', event.target.value)}
                      placeholder="123"
                      className={fieldClasses(false)}
                    />
                  </div>
                  <div>
                    <label htmlFor="client-neighborhood" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Bairro
                    </label>
                    <input
                      id="client-neighborhood"
                      type="text"
                      value={form.neighborhood}
                      onChange={(event) => updateField('neighborhood', event.target.value)}
                      placeholder="Bairro"
                      className={fieldClasses(false)}
                    />
                  </div>
                  <div>
                    <label htmlFor="client-city" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Cidade
                    </label>
                    <input
                      id="client-city"
                      type="text"
                      value={form.city}
                      onChange={(event) => updateField('city', event.target.value)}
                      placeholder="Cidade - UF"
                      className={fieldClasses(false)}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="client-limit" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Limite de Crédito (R$)
                </label>
                <input
                  id="client-limit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.creditLimit}
                  onChange={(event) => updateField('creditLimit', event.target.value)}
                  placeholder="0,00"
                  className={fieldClasses(false)}
                />
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {editingClientId ? 'Salvar Alterações' : 'Salvar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: receber pagamento */}
      {paymentClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Receber Pagamento</h2>
              <button
                type="button"
                onClick={closePaymentModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm">
              <p className="font-medium text-slate-800">{paymentClient.name}</p>
              <div className="mt-1 flex justify-between text-slate-500">
                <span>Saldo devedor atual</span>
                <span className="font-semibold text-red-600">
                  {formatCurrency(paymentClient.balance)}
                </span>
              </div>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleReceivePayment}>
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="payment-amount" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Valor recebido
                  </label>
                  <button
                    type="button"
                    onClick={() => setPaymentAmount(String(paymentClient.balance))}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Pagar valor total
                  </button>
                </div>
                <input
                  id="payment-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  max={paymentClient.balance}
                  autoFocus
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  placeholder="0,00"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-base font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Baixa parcial ou total — o valor não pode exceder o saldo devedor.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Recebido em
                </label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {RECEIPT_PAYMENT_METHODS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPaymentMethod(id)}
                      className={clsx(
                        'flex flex-col items-center gap-1 rounded-lg border-2 py-2 text-xs font-semibold transition-colors',
                        paymentMethod === id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                      )}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                {!isCashOpen && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-600">
                    <AlertTriangle size={12} className="shrink-0" />
                    Caixa fechado — este recebimento não vai compor o Fechamento do Dia.
                  </p>
                )}
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Confirmar Recebimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: histórico / extrato */}
      {historyClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="custom-scrollbar max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Histórico do Cliente</h2>
                <p className="text-sm text-slate-500">{historyClient.name}</p>
              </div>
              <button
                type="button"
                onClick={closeHistoryModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            {!showReceipt ? (
              <>
                <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 text-sm">
                  <span className="text-slate-500">Saldo devedor atual</span>
                  <span className="font-semibold text-red-600">{formatCurrency(historyClient.balance)}</span>
                </div>

                {historyClient.history.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">Nenhuma movimentação registrada</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {[...historyClient.history].reverse().map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div>
                          <p className="font-medium text-slate-800">{entry.description}</p>
                          <p className="text-xs text-slate-400">{formatDate(entry.date)}</p>
                        </div>
                        <span
                          className={clsx(
                            'font-semibold tabular-nums',
                            entry.type === 'compra' ? 'text-red-600' : 'text-emerald-600',
                          )}
                        >
                          {entry.type === 'compra' ? '+ ' : '- '}
                          {formatCurrency(entry.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => setShowReceipt(true)}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Receipt size={16} />
                  Simular Carnê / Recibo de Débito
                </button>
              </>
            ) : (
              <div>
                <div className="rounded-xl border-2 border-dashed border-slate-300 p-4">
                  <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400">
                    Recibo de Débito
                  </p>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cliente</span>
                      <span className="font-medium text-slate-800">{historyClient.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">CPF/CNPJ</span>
                      <span className="font-mono text-slate-800">{historyClient.cpfCnpj}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Vencimento</span>
                      <span className="text-slate-800">{dueDateLabel}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
                      <span>Valor Devido</span>
                      <span className="tabular-nums text-red-600">{formatCurrency(historyClient.balance)}</span>
                    </div>
                  </div>
                  <ReceiptBarcode code={`${onlyDigits(historyClient.cpfCnpj)}${Math.round(historyClient.balance * 100)}`} />
                  <p className="mt-2 text-center text-[10px] text-slate-400">
                    Documento simulado — sem valor fiscal
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowReceipt(false)}
                  className="mt-4 w-full rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Voltar ao Extrato
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: excluir cliente */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            {deleteTarget.balance > 0 ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                  <ShieldAlert size={22} />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Não é possível excluir</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Não é possível excluir cliente com débitos pendentes.{' '}
                    <span className="font-medium text-slate-700">{deleteTarget.name}</span> possui saldo devedor de{' '}
                    <span className="font-semibold text-red-600">{formatCurrency(deleteTarget.balance)}</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelDelete}
                  className="mt-2 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Entendi
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <Trash2 size={22} />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Deseja excluir este cliente?</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    <span className="font-medium text-slate-700">{deleteTarget.name}</span> será removido
                    permanentemente.
                  </p>
                </div>
                <div className="mt-2 flex w-full gap-2">
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
            )}
          </div>
        </div>
      )}

      {/* Toast: confirmação de salvamento */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />
          {toastMessage}
        </div>
      )}
    </div>
  )
}
