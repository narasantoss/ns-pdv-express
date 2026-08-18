import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'pdv-sistema-2026:operators'

export const ROLE_META = {
  admin: {
    label: 'Administrador',
    badge: 'bg-violet-50 text-violet-700',
    avatar: 'bg-violet-100 text-violet-700',
  },
  gerente: {
    label: 'Gerente',
    badge: 'bg-blue-50 text-blue-700',
    avatar: 'bg-blue-100 text-blue-700',
  },
  operador: {
    label: 'Operador de Caixa',
    badge: 'bg-slate-100 text-slate-600',
    avatar: 'bg-slate-200 text-slate-600',
  },
}

// Papéis com autoridade de supervisor — dispensados do PIN de autorização
// (ModalAutorizacaoGerente) e das travas de 'Relatórios'/'Logs & Diagnóstico'
// (ver ManagerAuthContext/AccessControlContext): eles JÁ SÃO a aprovação de
// nível superior que o PIN existe para exigir de um 'operador' comum.
export const SUPERVISOR_ROLES = ['admin', 'gerente']

export function isSupervisorRole(operator) {
  return !!operator && SUPERVISOR_ROLES.includes(operator.role)
}

// Operador Administrador padrão do sistema — credencial de fábrica (PIN 1234),
// também usada pelo AccessControlContext para liberar o Modo Mestre.
export const DEFAULT_OPERATORS = [
  {
    id: 1,
    name: 'Gerente Admin',
    username: 'gerente.admin',
    role: 'admin',
    pin: '1234',
    status: 'ativo',
    lastAccess: '2026-08-04T08:12:00',
  },
  {
    id: 2,
    name: 'Ana Beatriz Souza',
    username: 'ana.souza',
    role: 'admin',
    pin: '9012',
    status: 'ativo',
    lastAccess: '2026-08-04T08:12:00',
  },
  {
    id: 3,
    name: 'Carlos Eduardo Lima',
    username: 'carlos.lima',
    role: 'gerente',
    pin: '2345',
    status: 'ativo',
    lastAccess: '2026-08-03T19:45:00',
  },
  {
    id: 4,
    name: 'Fernanda Alves',
    username: 'fernanda.alves',
    role: 'operador',
    pin: '3456',
    status: 'inativo',
    lastAccess: '2026-07-28T14:30:00',
  },
  {
    id: 5,
    name: 'João Pedro Martins',
    username: 'joao.martins',
    role: 'operador',
    pin: '4567',
    status: 'ativo',
    lastAccess: '2026-08-04T07:50:00',
  },
]

function loadInitialOperators() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_OPERATORS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_OPERATORS
  } catch {
    return DEFAULT_OPERATORS
  }
}

const OperatorsContext = createContext(null)

export function OperatorsProvider({ children }) {
  const [operators, setOperators] = useState(loadInitialOperators)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(operators))
  }, [operators])

  function findByPin(pin) {
    return operators.find((operator) => operator.pin === pin && operator.status === 'ativo') ?? null
  }

  return (
    <OperatorsContext.Provider value={{ operators, setOperators, findByPin }}>
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
