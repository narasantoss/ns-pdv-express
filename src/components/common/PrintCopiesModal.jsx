import { Printer, X } from 'lucide-react'

const COPY_OPTIONS = [1, 2, 3]

// Seletor de quantidade de vias exibido antes de imprimir um cupom/via de
// entrega — usado tanto pelo PDV (envio direto para o Delivery) quanto pela
// tela de Delivery (botão "Imprimir via do motoboy"), para não duplicar o
// mesmo mini-modal nos dois lugares.
export default function PrintCopiesModal({ title = 'Impressão de Cupom', description, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Printer size={18} className="text-blue-600" />
            {title}
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

        <p className="mb-4 text-sm text-slate-500">
          {description ?? 'Quantas vias deseja imprimir?'}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {COPY_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => onSelect(count)}
              className="flex flex-col items-center gap-1 rounded-xl border-2 border-slate-200 p-3 text-slate-600 transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700"
            >
              <span className="text-2xl font-black tabular-nums">{count}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {count === 1 ? 'Via' : 'Vias'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
