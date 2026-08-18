import { createContext, useContext, useState } from 'react'

// Ponte leve entre módulos que "empurram" itens para o carrinho de Vendas
// (ex.: Orçamentos → Transformar em Venda) sem precisar levantar o estado
// do carrinho do PDVMain para um contexto global.
const PendingSaleContext = createContext(null)

export function PendingSaleProvider({ children }) {
  const [pendingSale, setPendingSale] = useState(null)

  function consumePendingSale() {
    setPendingSale(null)
  }

  return (
    <PendingSaleContext.Provider value={{ pendingSale, setPendingSale, consumePendingSale }}>
      {children}
    </PendingSaleContext.Provider>
  )
}

export function usePendingSale() {
  const context = useContext(PendingSaleContext)
  if (!context) {
    throw new Error('usePendingSale must be used within a PendingSaleProvider')
  }
  return context
}
