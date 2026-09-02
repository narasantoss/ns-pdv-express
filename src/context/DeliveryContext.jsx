import { createContext, useContext, useEffect, useState } from 'react'
import { deliveryRepo, motoboysRepo } from '../services/db'

const DeliveryContext = createContext(null)

// Pedidos de Delivery e Entregadores (motoboys), persistidos via
// `deliveryRepo`/`motoboysRepo` (SQLite local no Tauri, fallback em
// localStorage no navegador — ver src/services/db.js). Cada mutação chama o
// repositório diretamente (criar pedido, avançar status, atribuir motoboy)
// em vez de reconciliar um array inteiro — o mesmo estilo usado em
// OrcamentosMain, já que um pedido é uma sequência de operações explícitas,
// não um cadastro simples.
export function DeliveryProvider({ children }) {
  const [orders, setOrders] = useState([])
  const [motoboys, setMotoboys] = useState([])
  const [isLoaded, setIsLoaded] = useState(false)
  // Itens do carrinho do PDV aguardando pré-preenchimento no modal de Novo Pedido do Delivery
  const [pendingCartItems, setPendingCartItems] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([deliveryRepo.list(), motoboysRepo.list()])
      .then(([orderList, motoboyList]) => {
        if (cancelled) return
        setOrders(orderList)
        setMotoboys(motoboyList)
        setIsLoaded(true)
      })
      .catch((error) => {
        console.error('[delivery] Falha ao carregar pedidos/entregadores do banco de dados:', error)
        if (cancelled) return
        setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function sendCartToDelivery(items) {
    setPendingCartItems(items)
  }

  function consumePendingCartItems() {
    setPendingCartItems(null)
  }

  async function createOrder(order) {
    const created = await deliveryRepo.create(order)
    setOrders((prev) => [created, ...prev])
    return created
  }

  async function advanceStatus(orderId, nextStatus) {
    const updated = await deliveryRepo.updateStatus(orderId, nextStatus)
    if (!updated) return
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)))
  }

  async function assignMotoboy(orderId, motoboyId) {
    const motoboy = motoboys.find((item) => item.id === Number(motoboyId)) ?? null
    const updated = await deliveryRepo.assignMotoboy(orderId, motoboy?.id ?? null, motoboy?.name ?? null)
    if (!updated) return
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)))
  }

  /** Quitação de um pedido "Receber na Entrega" (Histórico de Vendas) — `vendaId` vem de `vendasRepo.registerSettlement`, já lançado antes desta chamada. */
  async function settlePayment(orderId, paymentMethod, vendaId) {
    const updated = await deliveryRepo.settlePayment(orderId, { paymentMethod, vendaId })
    if (!updated) return null
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)))
    return updated
  }

  /** Anexa o id da venda já criada para um pedido que nasceu pago (Opção A do F2). */
  async function linkVenda(orderId, vendaId) {
    const updated = await deliveryRepo.linkVenda(orderId, vendaId)
    if (!updated) return null
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)))
    return updated
  }

  /** Cancela/estorna um pedido de Delivery (Histórico de Vendas) — devolução de estoque/estorno financeiro é feita por quem chama, antes desta atualização de status. */
  async function cancelOrder(orderId, reason) {
    const updated = await deliveryRepo.cancel(orderId, reason)
    if (!updated) return null
    setOrders((prev) => prev.map((order) => (order.id === orderId ? { ...order, ...updated } : order)))
    return updated
  }

  async function addMotoboy(motoboy) {
    const created = await motoboysRepo.create(motoboy)
    setMotoboys((prev) => [...prev, created])
    return created
  }

  async function updateMotoboy(id, motoboy) {
    const updated = await motoboysRepo.update(id, motoboy)
    if (!updated) return
    setMotoboys((prev) => prev.map((item) => (item.id === id ? updated : item)))
    setOrders((prev) => prev.map((order) => (order.motoboyId === id ? { ...order, motoboyName: updated.name } : order)))
  }

  async function removeMotoboy(id) {
    await motoboysRepo.remove(id)
    setMotoboys((prev) => prev.filter((item) => item.id !== id))
    setOrders((prev) =>
      prev.map((order) => (order.motoboyId === id ? { ...order, motoboyId: null, motoboyName: null } : order)),
    )
  }

  return (
    <DeliveryContext.Provider
      value={{
        orders,
        motoboys,
        isLoaded,
        pendingCartItems,
        sendCartToDelivery,
        consumePendingCartItems,
        createOrder,
        advanceStatus,
        assignMotoboy,
        settlePayment,
        linkVenda,
        cancelOrder,
        addMotoboy,
        updateMotoboy,
        removeMotoboy,
      }}
    >
      {children}
    </DeliveryContext.Provider>
  )
}

export function useDelivery() {
  const context = useContext(DeliveryContext)
  if (!context) {
    throw new Error('useDelivery must be used within a DeliveryProvider')
  }
  return context
}
