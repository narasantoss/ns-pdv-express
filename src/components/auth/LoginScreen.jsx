import { useEffect, useState } from 'react'
import { Delete, AlertTriangle, LogIn } from 'lucide-react'
import clsx from 'clsx'
import HeaderLogo from '../common/HeaderLogo'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useOperators } from '../../context/OperatorsContext'
import { useSession } from '../../context/SessionContext'

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'del'],
]

export default function LoginScreen() {
  const { settings } = useStoreSettings()
  const { findByPin, touchLastAccess } = useOperators()
  const { login } = useSession()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  function attemptLogin(candidate) {
    const operator = findByPin(candidate)
    if (!operator) {
      setError(true)
      setPin('')
      return
    }
    touchLastAccess(operator.id).catch((err) =>
      console.error('[login] Falha ao registrar o último acesso do operador:', err),
    )
    login(operator)
  }

  useEffect(() => {
    if (pin.length === 4) attemptLogin(pin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin])

  function pressKey(key) {
    setError(false)
    if (key === 'del') {
      setPin((prev) => prev.slice(0, -1))
    } else if (key === 'clear') {
      setPin('')
    } else {
      setPin((prev) => (prev.length >= 4 ? prev : prev + key))
    }
  }

  function handleInputChange(event) {
    setError(false)
    setPin(event.target.value.replace(/\D/g, '').slice(0, 4))
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
              <LogIn size={17} className="text-blue-600" />
              Login do Operador
            </h1>
            <p className="mt-1 text-sm text-slate-500">Digite seu PIN de acesso (4 dígitos)</p>
          </div>
        </div>

        <div className="mt-6">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={handleInputChange}
            aria-label="PIN do operador"
            placeholder="••••"
            className={clsx(
              'w-full rounded-lg border bg-white px-3 py-3 text-center text-3xl font-black tracking-[0.6em] text-slate-900 placeholder:text-slate-400 outline-none focus:ring-1',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-500',
            )}
          />
          {error && (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle size={13} />
              PIN não reconhecido
            </p>
          )}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {KEYPAD_ROWS.flat().map((key, index) => {
            if (key === 'del') {
              return (
                <button
                  key={`key-${index}`}
                  type="button"
                  onClick={() => pressKey('del')}
                  className="flex items-center justify-center rounded-lg border border-slate-200 py-3 text-slate-500 transition-colors hover:bg-slate-50"
                  aria-label="Apagar dígito"
                >
                  <Delete size={18} />
                </button>
              )
            }
            if (key === 'clear') {
              return (
                <button
                  key={`key-${index}`}
                  type="button"
                  onClick={() => pressKey('clear')}
                  className="rounded-lg border border-slate-200 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:bg-slate-50"
                >
                  Limpar
                </button>
              )
            }
            return (
              <button
                key={`key-${index}`}
                type="button"
                onClick={() => pressKey(key)}
                className="rounded-lg border border-slate-200 py-3 text-lg font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {key}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
