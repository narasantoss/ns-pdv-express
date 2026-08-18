import { useState } from 'react'
import { Plus, X, Pencil, KeyRound, Trash2, AlertTriangle, Lock } from 'lucide-react'
import clsx from 'clsx'
import { useOperators, ROLE_META, isSupervisorRole } from '../../context/OperatorsContext'
import { useSession } from '../../context/SessionContext'

const lastAccessFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatLastAccess(isoString) {
  return lastAccessFormatter.format(new Date(isoString))
}

function initialsFor(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

function onlyDigits(value) {
  return value.replace(/\D/g, '').slice(0, 4)
}

const EMPTY_FORM = { name: '', username: '', role: 'operador', pin: '', status: 'ativo' }

export default function OperadoresMain() {
  const { operators, setOperators } = useOperators()
  const { currentOperator } = useSession()
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [pinTouched, setPinTouched] = useState(true)
  const [pinModalTarget, setPinModalTarget] = useState(null)
  const [pinDraft, setPinDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Só quem já é Gerente/Admin (ou o próprio funcionário) pode ver/editar o
  // PIN em texto puro no modal — ver requisito de mascarar PIN alheio na
  // listagem/edição. Qualquer outro operador só troca o PIN de terceiros
  // pela modal dedicada "Trocar PIN" (nunca vê o valor atual).
  function canRevealPin(operator) {
    return isSupervisorRole(currentOperator) || operator?.id === currentOperator?.id
  }

  const pinRequiresValidPattern = !editingId || pinTouched
  const canSubmit =
    form.name.trim() && form.username.trim() && (pinRequiresValidPattern ? /^\d{4}$/.test(form.pin) : true)

  function openCreateModal() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setPinTouched(true)
    setShowModal(true)
  }

  function openEditModal(operator) {
    const revealPin = canRevealPin(operator)
    setEditingId(operator.id)
    setForm({
      name: operator.name,
      username: operator.username,
      role: operator.role,
      pin: revealPin ? operator.pin : '',
      status: operator.status,
    })
    setPinTouched(revealPin)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
  }

  function updateField(field, value) {
    if (field === 'pin') setPinTouched(true)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return

    if (editingId) {
      setOperators((prev) =>
        prev.map((operator) =>
          operator.id === editingId
            ? {
                ...operator,
                name: form.name.trim(),
                username: form.username.trim(),
                role: form.role,
                // PIN não tocado (campo ficou mascarado/vazio, sem edição) mantém o valor atual do funcionário.
                pin: pinTouched ? form.pin : operator.pin,
                status: form.status,
              }
            : operator,
        ),
      )
    } else {
      setOperators((prev) => [
        ...prev,
        {
          id: prev.length ? Math.max(...prev.map((operator) => operator.id)) + 1 : 1,
          name: form.name.trim(),
          username: form.username.trim(),
          role: form.role,
          pin: form.pin,
          status: form.status,
          lastAccess: new Date().toISOString(),
        },
      ])
    }
    setShowModal(false)
  }

  function openPinModal(operator) {
    setPinModalTarget(operator)
    setPinDraft('')
  }

  function closePinModal() {
    setPinModalTarget(null)
  }

  function submitPinChange(event) {
    event.preventDefault()
    if (pinDraft.length !== 4) return

    setOperators((prev) =>
      prev.map((operator) =>
        operator.id === pinModalTarget.id ? { ...operator, pin: pinDraft } : operator,
      ),
    )
    setPinModalTarget(null)
  }

  function openDeleteModal(operator) {
    setDeleteTarget(operator)
  }

  function closeDeleteModal() {
    setDeleteTarget(null)
  }

  function toggleTargetStatus() {
    setOperators((prev) =>
      prev.map((operator) =>
        operator.id === deleteTarget.id
          ? { ...operator, status: operator.status === 'ativo' ? 'inativo' : 'ativo' }
          : operator,
      ),
    )
    setDeleteTarget(null)
  }

  function confirmDelete() {
    setOperators((prev) => prev.filter((operator) => operator.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Funcionários</h1>
          <p className="text-sm text-slate-500">Gerencie funcionários, cargos e permissões de acesso</p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700"
        >
          <Plus size={18} />
          Novo Funcionário
        </button>
      </header>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3">Funcionário</th>
              <th className="px-5 py-3">Cargo</th>
              <th className="px-5 py-3">PIN</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Último acesso</th>
              <th className="px-5 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {operators.map((operator) => {
              const roleMeta = ROLE_META[operator.role]
              return (
                <tr key={operator.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={clsx(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                          roleMeta.avatar,
                        )}
                      >
                        {initialsFor(operator.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{operator.name}</p>
                        <p className="truncate text-xs text-slate-400">@{operator.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                        roleMeta.badge,
                      )}
                    >
                      {roleMeta.label}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-1.5 font-mono text-sm tracking-widest text-slate-400">
                      <Lock size={12} className="shrink-0" />
                      ••••
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                        operator.status === 'ativo'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-500',
                      )}
                    >
                      <span
                        className={clsx(
                          'h-1.5 w-1.5 rounded-full',
                          operator.status === 'ativo' ? 'bg-emerald-500' : 'bg-slate-400',
                        )}
                      />
                      {operator.status === 'ativo' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-500">
                    {formatLastAccess(operator.lastAccess)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEditModal(operator)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        aria-label={`Editar ${operator.name}`}
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openPinModal(operator)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                        aria-label={`Trocar PIN de ${operator.name}`}
                        title="Trocar PIN/Senha"
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteModal(operator)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Excluir ${operator.name}`}
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
      </div>

      {/* Modal: novo / editar funcionário */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editingId ? 'Editar Funcionário' : 'Novo Funcionário'}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="operator-name"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Nome Completo
                </label>
                <input
                  id="operator-name"
                  type="text"
                  autoFocus
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Nome completo"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="operator-username"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Nome de Usuário
                </label>
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    @
                  </span>
                  <input
                    id="operator-username"
                    type="text"
                    value={form.username}
                    onChange={(event) => updateField('username', event.target.value)}
                    placeholder="usuario"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-8 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="operator-role"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Cargo / Perfil
                </label>
                <select
                  id="operator-role"
                  value={form.role}
                  onChange={(event) => updateField('role', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                >
                  {Object.entries(ROLE_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="operator-pin"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  PIN de Acesso Rápido (4 dígitos)
                </label>
                <input
                  id="operator-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={form.pin}
                  onChange={(event) => updateField('pin', onlyDigits(event.target.value))}
                  placeholder={editingId && !pinTouched ? '••••' : '0000'}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-center text-lg font-bold tracking-[0.4em] text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
                {editingId && !pinTouched && (
                  <p className="mt-1 text-xs text-slate-400">
                    PIN oculto por segurança. Deixe em branco para manter o atual ou digite um novo para
                    substituí-lo.
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Status</p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateField('status', 'ativo')}
                    className={clsx(
                      'rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                      form.status === 'ativo'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}
                  >
                    Ativo
                  </button>
                  <button
                    type="button"
                    onClick={() => updateField('status', 'inativo')}
                    className={clsx(
                      'rounded-lg border-2 py-2 text-sm font-semibold transition-colors',
                      form.status === 'inativo'
                        ? 'border-slate-500 bg-slate-100 text-slate-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300',
                    )}
                  >
                    Inativo
                  </button>
                </div>
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: trocar PIN/senha de acesso rápido */}
      {pinModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <KeyRound size={18} className="text-amber-600" />
                Trocar PIN
              </h2>
              <button
                type="button"
                onClick={closePinModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="mb-4 text-sm text-slate-500">
              Defina um novo PIN de acesso rápido para{' '}
              <span className="font-semibold text-slate-700">{pinModalTarget.name}</span>.
            </p>

            <form className="space-y-4" onSubmit={submitPinChange}>
              <div>
                <label
                  htmlFor="new-pin"
                  className="text-xs font-medium uppercase tracking-wide text-slate-500"
                >
                  Novo PIN (4 dígitos)
                </label>
                <input
                  id="new-pin"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={4}
                  value={pinDraft}
                  onChange={(event) => setPinDraft(onlyDigits(event.target.value))}
                  placeholder="0000"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-center text-2xl font-bold tracking-[0.5em] text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={closePinModal}
                  className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pinDraft.length !== 4}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  Salvar PIN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: excluir ou inativar funcionário */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Remover Funcionário</h2>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p>
                O que deseja fazer com <span className="font-semibold">{deleteTarget.name}</span>?
                Inativar bloqueia o acesso e mantém o histórico; excluir remove o cadastro
                permanentemente.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={toggleTargetStatus}
                className="rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                {deleteTarget.status === 'ativo' ? 'Inativar Usuário' : 'Reativar Usuário'}
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="flex items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Trash2 size={16} />
                Excluir Definitivamente
              </button>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
