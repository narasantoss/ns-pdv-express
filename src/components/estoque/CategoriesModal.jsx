import { useState } from 'react'
import { X, Plus, Pencil, Trash2, Check, FolderTree, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

export default function CategoriesModal({ open, categories, productCounts, onClose, onCreate, onRename, onDelete }) {
  const [newCategory, setNewCategory] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingValue, setEditingValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  if (!open) return null

  function handleCreate(event) {
    event.preventDefault()
    const value = newCategory.trim()
    if (!value) return
    onCreate(value)
    setNewCategory('')
  }

  function startEditing(category) {
    setEditingId(category.id)
    setEditingValue(category.name)
  }

  function confirmEditing() {
    const value = editingValue.trim()
    if (value) onRename(editingId, value)
    setEditingId(null)
    setEditingValue('')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FolderTree size={18} className="text-blue-600" />
            Gerenciar Categorias
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="Nova categoria (ex: Bebidas)"
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="submit"
            disabled={!newCategory.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Plus size={16} />
            Adicionar
          </button>
        </form>

        <div className="custom-scrollbar mt-4 max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          {categories.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Nenhuma categoria cadastrada</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center gap-2 px-3 py-2.5">
                  {editingId === category.id ? (
                    <>
                      <input
                        type="text"
                        autoFocus
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            confirmEditing()
                          }
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full rounded-md border border-blue-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                      <button
                        type="button"
                        onClick={confirmEditing}
                        className="shrink-0 rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50"
                        aria-label="Confirmar"
                      >
                        <Check size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {category.name}
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        {productCounts[category.name] ?? 0} {productCounts[category.name] === 1 ? 'produto' : 'produtos'}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditing(category)}
                        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        aria-label={`Renomear ${category.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(category)}
                        className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Excluir ${category.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {deleteTarget && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Excluir <span className="font-semibold">{deleteTarget.name}</span>
                {productCounts[deleteTarget.name] > 0 && (
                  <>
                    {' '}
                    não altera os {productCounts[deleteTarget.name]} produto(s) já cadastrados com ela — eles
                    mantêm o texto da categoria, só deixa de aparecer na lista de seleção.
                  </>
                )}
              </span>
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className={clsx(
                  'flex-1 rounded-lg border border-slate-300 bg-white py-2 text-xs font-medium text-slate-700 hover:bg-slate-50',
                )}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(deleteTarget.id)
                  setDeleteTarget(null)
                }}
                className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Excluir Categoria
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
