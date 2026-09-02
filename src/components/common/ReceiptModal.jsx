import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import clsx from 'clsx'
import ReceiptDocument from './ReceiptDocument'
import { printReceiptWindow } from '../../utils/printReceiptWindow'

const WIDTH_OPTIONS = [
  { id: 80, label: '80mm' },
  { id: 58, label: '58mm' },
]

export default function ReceiptModal({ open, onClose, receipt }) {
  const [width, setWidth] = useState(80)

  if (!open || !receipt) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:hidden">
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Visualizar Cupom</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {WIDTH_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setWidth(option.id)}
              className={clsx(
                'rounded-lg border-2 py-1.5 text-xs font-semibold transition-colors',
                width === option.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-slate-200 text-slate-500 hover:border-slate-300',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded-lg border border-dashed border-slate-300 bg-slate-100 py-4">
          <ReceiptDocument {...receipt} width={width} />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => printReceiptWindow({ ...receipt, width })}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Printer size={15} />
            Imprimir Cupom
          </button>
        </div>
      </div>
    </div>
  )
}
