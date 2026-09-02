import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getConfig, setConfig } from '../services/db'

const CashRegisterContext = createContext(null)

const EMPTY_SESSION = { isOpen: false, openedAt: null, openingAmount: 0 }

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10)
}

// A Abertura de Caixa é persistida na tabela `configuracoes` (chaves
// `caixa_status`, `caixa_valor_abertura`, `caixa_data_abertura`) em vez de
// uma tabela própria — o schema da Etapa 3 não previu uma tabela dedicada de
// caixa, e a sessão é só um pequeno registro chave/valor, o mesmo uso para o
// qual `configuracoes` existe. O caixa permanece aberto entre recarregamentos
// do app (mesmo dia); se o app for reaberto num dia diferente da abertura
// registrada, a sessão expira e a Abertura de Caixa volta a ser solicitada.
export function CashRegisterProvider({ children }) {
  const [movements, setMovements] = useState([])
  const [session, setSession] = useState(EMPTY_SESSION)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getConfig('caixa_status', 'fechado'),
      getConfig('caixa_valor_abertura', '0'),
      getConfig('caixa_data_abertura', null),
    ])
      .then(([status, openingAmount, openedAt]) => {
        if (cancelled) return
        const stillSameDay = openedAt && dayKey(openedAt) === dayKey(new Date())
        setSession(
          status === 'aberto' && stillSameDay
            ? { isOpen: true, openedAt, openingAmount: Number(openingAmount) || 0 }
            : EMPTY_SESSION,
        )
        setIsLoaded(true)
      })
      .catch((error) => {
        // Sem este `.catch`, uma falha aqui (SQLite indisponível, IPC do
        // Tauri instável etc.) deixava `isLoaded` travado em `false` pra
        // sempre — e é exatamente esse estado que App.jsx usa pra decidir
        // se mostra a tela de carregamento ou o app. Cai pro caixa fechado
        // (comportamento seguro: pede Abertura de Caixa de novo) em vez de
        // travar o boot indefinidamente.
        console.error('[cash-register] Falha ao carregar a sessão de caixa:', error)
        if (cancelled) return
        setSession(EMPTY_SESSION)
        setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function openCash(openingAmount) {
    const openedAt = new Date().toISOString()
    setSession({ isOpen: true, openedAt, openingAmount })
    Promise.all([
      setConfig('caixa_status', 'aberto'),
      setConfig('caixa_valor_abertura', String(openingAmount)),
      setConfig('caixa_data_abertura', openedAt),
    ]).catch((error) => console.error('[cash-register] Falha ao salvar abertura de caixa:', error))
  }

  function closeCash() {
    setSession(EMPTY_SESSION)
    setConfig('caixa_status', 'fechado').catch((error) =>
      console.error('[cash-register] Falha ao salvar fechamento de caixa:', error),
    )
  }

  /**
   * `method` (dinheiro/pix/cartao) só se aplica a movimentações do tipo
   * 'recebimento' (baixa de crediário quitada em Clientes → Receber
   * Pagamento) — usado pelo Fechamento de Caixa para somar o valor certo em
   * 'Esperado em Caixa' (só a parcela em dinheiro afeta a gaveta física) e
   * nos Totais por Forma de Pagamento. Sangria/Suprimento continuam sempre
   * em dinheiro, sem precisar informar `method`.
   */
  function addMovement(type, amount, description, method = null) {
    setMovements((prev) => [
      ...prev,
      {
        id: prev.length ? Math.max(...prev.map((movement) => movement.id)) + 1 : 1,
        type,
        amount,
        description,
        method,
        time: new Date(),
      },
    ])
  }

  function clearMovements() {
    setMovements([])
  }

  const suprimentosTotal = useMemo(
    () =>
      movements
        .filter((movement) => movement.type === 'suprimento')
        .reduce((sum, movement) => sum + movement.amount, 0),
    [movements],
  )
  const sangriasTotal = useMemo(
    () =>
      movements
        .filter((movement) => movement.type === 'sangria')
        .reduce((sum, movement) => sum + movement.amount, 0),
    [movements],
  )

  return (
    <CashRegisterContext.Provider
      value={{
        movements,
        addMovement,
        clearMovements,
        suprimentosTotal,
        sangriasTotal,
        isOpen: session.isOpen,
        isLoaded,
        openedAt: session.openedAt ? new Date(session.openedAt) : null,
        openingAmount: session.openingAmount,
        openCash,
        closeCash,
      }}
    >
      {children}
    </CashRegisterContext.Provider>
  )
}

export function useCashRegister() {
  const context = useContext(CashRegisterContext)
  if (!context) {
    throw new Error('useCashRegister must be used within a CashRegisterProvider')
  }
  return context
}
