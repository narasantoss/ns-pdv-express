import { createContext, useContext, useState } from 'react'
import { useOperators } from './OperatorsContext'

const SESSION_STORAGE_KEY = 'ns-pdv-express:session-operator-id'

function readStoredOperatorId() {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const id = Number.parseInt(raw, 10)
    return Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

// Sessão do operador logado no terminal. Persiste em localStorage (só o id —
// o registro completo sempre vem fresco de OperatorsContext) para que um F5
// ou fechar/reabrir o navegador não force um novo login nem interrompa o
// caixa já aberto (ver App.jsx, que só exige a Tela de Login quando não há
// nenhum operador válido restaurado). Some/expira sozinha se o operador for
// desativado ou removido enquanto a sessão estava aberta.
const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const { operators } = useOperators()
  const [currentOperator, setCurrentOperator] = useState(() => {
    const storedId = readStoredOperatorId()
    if (storedId == null) return null
    return operators.find((operator) => operator.id === storedId && operator.status === 'ativo') ?? null
  })

  function login(operator) {
    setCurrentOperator(operator)
    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, String(operator.id))
    } catch {
      // localStorage indisponível (modo privado etc.) — o login continua
      // funcionando nesta sessão, só não sobrevive a um F5/reload.
    }
  }

  function logout() {
    setCurrentOperator(null)
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // Idem acima.
    }
  }

  return (
    <SessionContext.Provider value={{ currentOperator, login, logout }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
