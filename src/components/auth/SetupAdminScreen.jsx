import { useState } from 'react'
import { ShieldCheck, UserCog, AlertTriangle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import HeaderLogo from '../common/HeaderLogo'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useOperators } from '../../context/OperatorsContext'
import { useSession } from '../../context/SessionContext'

function onlyDigits(value) {
  return value.replace(/\D/g, '').slice(0, 4)
}

/**
 * Tela de Primeiro Acesso: exibida no boot (ver App.jsx) sempre que o
 * cadastro de usuários (`usuarios`, ver OperatorsContext/usuariosRepo) ainda
 * está vazio — nenhuma instalação do sistema pode operar sem pelo menos um
 * usuário Gerente/Admin. Cadastra a primeira linha com `perfil = 'admin'`
 * (acesso total) e já efetua o login dessa sessão, sem precisar passar pela
 * Tela de Login logo em seguida. O PIN cadastrado aqui também vira o PIN do
 * Gerente/Admin (`settings.adminPin`) usado para desbloquear as áreas
 * restritas (Relatórios, Configurações, Funcionários) — ver AccessControlContext.
 */
export default function SetupAdminScreen() {
  const { settings, updateSettings } = useStoreSettings()
  const { createOperator } = useOperators()
  const { login } = useSession()
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim().length >= 2 && /^\d{4}$/.test(pin) && pin === confirmPin

  async function handleSubmit(event) {
    event.preventDefault()
    if (!canSubmit || busy) return
    if (pin !== confirmPin) {
      setError('Os dois PINs digitados são diferentes.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const admin = await createOperator({ name: name.trim(), role: 'admin', pin, status: 'ativo' })
      await updateSettings({ adminPin: pin })
      login(admin)
    } catch (err) {
      console.error('[setup] Falha ao criar o usuário Administrador:', err)
      setError('Não foi possível criar o usuário. Tente novamente.')
      setBusy(false)
    }
  }

  return (
    <div className="flex h-svh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-black p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center gap-4 text-center">
          <HeaderLogo
            name={settings.fantasyName.trim() || undefined}
            logoUrl={settings.logoDataUrl}
          />
          <div>
            <h1 className="flex items-center justify-center gap-2 text-base font-bold text-slate-900">
              <UserCog size={17} className="text-blue-600" />
              Criar Usuário Administrador
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Primeiro acesso: cadastre o Dono/Gerente responsável por este sistema. Esse usuário
              terá acesso total, incluindo relatórios, financeiro e configurações.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div>
            <label htmlFor="setup-name" className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Nome do Administrador
            </label>
            <input
              id="setup-name"
              type="text"
              autoFocus
              autoComplete="off"
              disabled={busy}
              value={name}
              onChange={(event) => {
                setError('')
                setName(event.target.value)
              }}
              placeholder="Ex.: Maria da Silva"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="setup-pin" className="text-xs font-medium uppercase tracking-wide text-slate-500">
                PIN (4 dígitos)
              </label>
              <input
                id="setup-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                disabled={busy}
                value={pin}
                onChange={(event) => {
                  setError('')
                  setPin(onlyDigits(event.target.value))
                }}
                placeholder="0000"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-3 text-center text-lg font-bold tracking-[0.4em] text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="setup-pin-confirm"
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Confirmar PIN
              </label>
              <input
                id="setup-pin-confirm"
                type="password"
                inputMode="numeric"
                maxLength={4}
                disabled={busy}
                value={confirmPin}
                onChange={(event) => {
                  setError('')
                  setConfirmPin(onlyDigits(event.target.value))
                }}
                placeholder="0000"
                className={clsx(
                  'mt-1 w-full rounded-lg border bg-slate-50 px-3 py-3 text-center text-lg font-bold tracking-[0.4em] text-slate-800 outline-none focus:ring-2 disabled:opacity-60',
                  confirmPin && confirmPin !== pin
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
                    : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500/30',
                )}
              />
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle size={13} className="shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {busy ? 'Criando…' : 'Criar Administrador e Entrar'}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-400">
          Depois de criado, use Funcionários → Novo Funcionário para cadastrar Operadores de Caixa
          com acesso restrito.
        </p>
      </div>
    </div>
  )
}
