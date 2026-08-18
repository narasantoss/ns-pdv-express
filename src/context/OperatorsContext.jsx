import { createContext, useContext, useEffect, useState } from 'react'
import { usuariosRepo } from '../services/db'

export const ROLE_META = {
  admin: {
    label: 'Gerente/Admin',
    badge: 'bg-violet-50 text-violet-700',
    avatar: 'bg-violet-100 text-violet-700',
  },
  operador: {
    label: 'Operador de Caixa',
    badge: 'bg-slate-100 text-slate-600',
    avatar: 'bg-slate-200 text-slate-600',
  },
}

// Papel com autoridade de supervisor — dispensado do PIN de autorização
// (ModalAutorizacaoGerente) e das travas de 'Relatórios'/'Configurações'/
// 'Funcionários'/'Logs' (ver ManagerAuthContext/AccessControlContext): quem
// está logado como 'admin' JÁ É a aprovação de nível superior que o PIN
// existe para exigir de um 'operador' comum.
export const SUPERVISOR_ROLES = ['admin']

export function isSupervisorRole(operator) {
  return !!operator && SUPERVISOR_ROLES.includes(operator.role)
}

// Operador Administrador padrão do sistema — usado só pelo AccessControlContext
// para rotular a sessão liberada ao alternar para o Modo Mestre com o PIN do
// Gerente/Admin (não é um usuário real do cadastro).
export const DEFAULT_ADMIN_OPERATOR = {
  name: 'Gerente Admin',
  role: 'admin',
}

const OperatorsContext = createContext(null)

/**
 * Cadastro de usuários do sistema (Controle de Acesso e Perfis — Gerente/Admin
 * vs. Operador), persistido no SQLite local via `usuariosRepo` (tabela
 * `usuarios`). Carrega a lista uma vez no boot; toda operação de escrita
 * (criar, editar, trocar PIN, ativar/inativar, excluir) grava no banco e
 * atualiza o estado local com o retorno do repositório, para nunca ficar
 * dessincronizado do que foi persistido de fato.
 *
 * `needsSetup` fica `true` quando o cadastro está vazio (nenhum usuário
 * ainda) — dispara a tela de Primeiro Acesso ("Criar Usuário Administrador"),
 * ver SetupAdminScreen.jsx/App.jsx.
 */
export function OperatorsProvider({ children }) {
  const [operators, setOperatorsState] = useState([])
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    usuariosRepo
      .list()
      .then((rows) => {
        if (!cancelled) setOperatorsState(rows)
      })
      .catch((error) => {
        console.error('[operators] Falha ao carregar usuários do sistema:', error)
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function refreshOperators() {
    const rows = await usuariosRepo.list()
    setOperatorsState(rows)
    return rows
  }

  /** Cria o primeiro usuário (Gerente/Admin) ou qualquer novo funcionário. */
  async function createOperator(usuario) {
    const created = await usuariosRepo.create(usuario)
    setOperatorsState((prev) => [...prev, created])
    return created
  }

  async function updateOperator(id, usuario) {
    const updated = await usuariosRepo.update(id, usuario)
    if (updated) setOperatorsState((prev) => prev.map((item) => (item.id === id ? updated : item)))
    return updated
  }

  async function updateOperatorPin(id, pin) {
    const updated = await usuariosRepo.updatePin(id, pin)
    if (updated) setOperatorsState((prev) => prev.map((item) => (item.id === id ? updated : item)))
    return updated
  }

  async function setOperatorStatus(id, status) {
    const updated = await usuariosRepo.setAtivo(id, status === 'ativo')
    if (updated) setOperatorsState((prev) => prev.map((item) => (item.id === id ? updated : item)))
    return updated
  }

  async function removeOperator(id) {
    await usuariosRepo.remove(id)
    setOperatorsState((prev) => prev.filter((item) => item.id !== id))
  }

  async function touchLastAccess(id) {
    await usuariosRepo.touchLastAccess(id)
    const now = new Date().toISOString()
    setOperatorsState((prev) => prev.map((item) => (item.id === id ? { ...item, lastAccess: now } : item)))
  }

  function findByPin(pin) {
    return operators.find((operator) => operator.pin === pin && operator.status === 'ativo') ?? null
  }

  const needsSetup = isLoaded && operators.length === 0

  return (
    <OperatorsContext.Provider
      value={{
        operators,
        isLoaded,
        needsSetup,
        refreshOperators,
        createOperator,
        updateOperator,
        updateOperatorPin,
        setOperatorStatus,
        removeOperator,
        touchLastAccess,
        findByPin,
      }}
    >
      {children}
    </OperatorsContext.Provider>
  )
}

export function useOperators() {
  const context = useContext(OperatorsContext)
  if (!context) {
    throw new Error('useOperators must be used within an OperatorsProvider')
  }
  return context
}
