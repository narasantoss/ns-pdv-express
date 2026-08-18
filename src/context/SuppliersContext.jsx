import { createContext, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'pdv-sistema-2026:suppliers'

// Fornecedores cadastrados — compartilhado entre a tela de Fornecedores
// (cadastro completo + boletos) e o vínculo opcional no cadastro de Produtos.
const DEFAULT_SUPPLIERS = [
  {
    id: 1,
    razaoSocial: 'Distribuidora Boa Compra Ltda',
    cnpj: '12.345.678/0001-90',
    whatsapp: '(11) 98888-1234',
    email: 'comercial@boacompra.com.br',
    contatoNome: 'Marcos Vinícius',
    bills: [
      {
        id: 1,
        description: 'Boleto NF 4521',
        amount: 3250.0,
        dueDate: '2026-08-20',
        status: 'pendente',
      },
      {
        id: 2,
        description: 'Boleto NF 4498',
        amount: 1890.5,
        dueDate: '2026-08-05',
        status: 'pago',
      },
    ],
  },
  {
    id: 2,
    razaoSocial: 'Atacadão Vestuário e Moda S.A.',
    cnpj: '98.765.432/0001-21',
    whatsapp: '(11) 97777-5678',
    email: 'financeiro@atacadaomoda.com.br',
    contatoNome: 'Juliana Prado',
    bills: [
      {
        id: 3,
        description: 'Boleto Pedido 8871',
        amount: 5400.0,
        dueDate: '2026-08-28',
        status: 'pendente',
      },
    ],
  },
]

function loadInitialSuppliers() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SUPPLIERS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SUPPLIERS
  } catch {
    return DEFAULT_SUPPLIERS
  }
}

const SuppliersContext = createContext(null)

export function SuppliersProvider({ children }) {
  const [suppliers, setSuppliers] = useState(loadInitialSuppliers)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers))
  }, [suppliers])

  return (
    <SuppliersContext.Provider value={{ suppliers, setSuppliers }}>
      {children}
    </SuppliersContext.Provider>
  )
}

export function useSuppliers() {
  const context = useContext(SuppliersContext)
  if (!context) {
    throw new Error('useSuppliers must be used within a SuppliersProvider')
  }
  return context
}
