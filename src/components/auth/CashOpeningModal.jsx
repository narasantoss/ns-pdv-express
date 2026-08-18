import { useState } from 'react'
import { Banknote, LogOut } from 'lucide-react'
import HeaderLogo from '../common/HeaderLogo'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useSession } from '../../context/SessionContext'
import { useCashRegister } from '../../context/CashRegisterContext'
import { formatCurrency } from '../../utils/format'

const QUICK_AMOUNTS = [50, 100, 150, 200]

function parseAmount(value) {
  const parsed = Number.parseFloat((value ?? '').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export default function CashOpeningModal() {
  const { settings } = useStoreSettings()
  const { currentOperator, logout } = useSession()
  const { openCash } = useCashRegister()
  const [amount, setAmount] = useState('')

  const parsedAmount = parseAmount(amount)
  const canSubmit = amount.trim() !== '' && parsedAmount >= 0

  function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit) return
    openCash(parsedAmount)
  }

  return (
    <div className="flex h-svh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <HeaderLogo
            name={settings.fantasyName.trim() || undefined}
            logoUrl={settings.logoDataUrl}
          />
          <div>
            <h1 className="flex items-center justify-center gap-2 text-base font-bold text-slate-900">
              <Banknote size={17} className="text-emerald-600" />
              Abertura de Caixa
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Bem-vindo(a), <span className="font-semibold text-slate-700">{currentOperator?.name}</span>.
              Informe o troco inicial para começar o dia.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6">
          <label
            htmlFor="opening-amount"
            className="text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Valor do Troco Inicial (R$)
          </label>
          <input
            id="opening-amount"
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0,00"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-2xl font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(value.toFixed(2))}
                className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                {formatCurrency(value)}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-6 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            Abrir Caixa e Iniciar Atendimento
          </button>

          <button
            type="button"
            onClick={logout}
            className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600"
          >
            <LogOut size={13} />
            Trocar operador
          </button>
        </form>
      </div>
    </div>
  )
}
