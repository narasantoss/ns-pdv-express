import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { clientesRepo } from '../services/db'

// Cadastro de clientes (crédito/fiado) compartilhado entre as telas de
// Clientes e Vendas — antes desta etapa, cada uma mantinha sua própria cópia
// local de `MOCK_CLIENTS`, então um cliente cadastrado no PDV não aparecia em
// Clientes e vice-versa. Agora ambos leem/gravam o mesmo cadastro, persistido
// via `clientesRepo` (SQLite local no Tauri, fallback em localStorage no
// navegador — ver src/services/db.js).
//
// Mesma estratégia de reconciliação usada em ProductsContext: as telas
// continuam só chamando `setClients(prev => ...)`; a cada mudança, o
// contexto compara com o último snapshot sincronizado e dispara
// INSERT/UPDATE/DELETE reais no banco. Clientes novos entram com um id local
// temporário até o INSERT devolver o id definitivo do banco.
const ClientsContext = createContext(null)

export function ClientsProvider({ children }) {
  const [clients, setClients] = useState([])
  const [isLoaded, setIsLoaded] = useState(false)

  const syncedSnapshotRef = useRef(new Map())
  const isApplyingRemoteIdsRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    clientesRepo
      .list()
      .then((list) => {
        if (cancelled) return
        syncedSnapshotRef.current = new Map(list.map((client) => [client.id, client]))
        setClients(list)
        setIsLoaded(true)
      })
      .catch((error) => {
        // Mesmo raciocínio de ProductsContext: `syncedSnapshotRef` continua
        // vazio, então a reconciliação abaixo não apaga nada do banco por
        // engano — só evita deixar `isLoaded` travado pra sempre.
        console.error('[clients] Falha ao carregar clientes do banco de dados:', error)
        if (cancelled) return
        setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isLoaded || isApplyingRemoteIdsRef.current) return

    const synced = syncedSnapshotRef.current
    const currentIds = new Set(clients.map((client) => client.id))
    const removedIds = [...synced.keys()].filter((id) => !currentIds.has(id))

    async function reconcile() {
      for (const id of removedIds) {
        await clientesRepo.remove(id)
        synced.delete(id)
      }

      const idRemap = []
      for (const client of clients) {
        const previous = synced.get(client.id)
        if (!previous) {
          const created = await clientesRepo.create(client)
          synced.set(created.id, created)
          if (created.id !== client.id) idRemap.push([client.id, created.id])
          continue
        }
        if (JSON.stringify(previous) !== JSON.stringify(client)) {
          const updated = await clientesRepo.update(client.id, client)
          synced.set(client.id, updated)
        }
      }

      if (idRemap.length > 0) {
        isApplyingRemoteIdsRef.current = true
        setClients((prev) =>
          prev.map((client) => {
            const remap = idRemap.find(([oldId]) => oldId === client.id)
            return remap ? { ...client, id: remap[1] } : client
          }),
        )
        queueMicrotask(() => {
          isApplyingRemoteIdsRef.current = false
        })
      }
    }

    reconcile().catch((error) => {
      console.error('[clients] Falha ao sincronizar clientes com o banco de dados:', error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, isLoaded])

  /**
   * Lança uma compra fiado ou um pagamento diretamente no banco (saldo +
   * histórico), sem depender da reconciliação genérica — usado quando a
   * mudança precisa ficar consistente mesmo se o estado local já tiver sido
   * alterado por outra tela na mesma sessão (ex.: pagamento recebido em
   * Clientes enquanto uma venda fiado é fechada no PDV).
   */
  async function registerMovement(clientId, { type, amount, description, date }) {
    const updated = await clientesRepo.registerMovement(clientId, { type, amount, description, date })
    if (!updated) return null
    syncedSnapshotRef.current.set(updated.id, updated)
    setClients((prev) => prev.map((client) => (client.id === updated.id ? updated : client)))
    return updated
  }

  /**
   * Cria um cliente e devolve a linha já com o id definitivo do banco. Usada
   * nos fluxos em que a tela precisa selecionar o cliente recém-criado no
   * mesmo instante (ex.: "Novo Cliente" durante uma venda no PDV) — criar via
   * `setClients` normal funciona, mas o id local só vira o id do banco depois
   * que a reconciliação assíncrona roda, o que é tarde demais se a tela já
   * quer referenciar esse cliente por id no passo seguinte.
   */
  async function createClient(client) {
    const created = await clientesRepo.create(client)
    syncedSnapshotRef.current.set(created.id, created)
    setClients((prev) => [...prev, created])
    return created
  }

  /**
   * Aplica no estado local um cliente já persistido no banco por outra
   * operação (ex.: `registerMovement`, ou o débito de crediário feito por
   * `vendasRepo.registerSale`) — atualiza o snapshot sincronizado e o estado
   * visível sem disparar um novo UPDATE na reconciliação acima.
   */
  function applyExternalUpdate(client) {
    syncedSnapshotRef.current.set(client.id, client)
    setClients((prev) => prev.map((item) => (item.id === client.id ? client : item)))
  }

  return (
    <ClientsContext.Provider
      value={{ clients, setClients, registerMovement, createClient, applyExternalUpdate }}
    >
      {children}
    </ClientsContext.Provider>
  )
}

export function useClients() {
  const context = useContext(ClientsContext)
  if (!context) {
    throw new Error('useClients must be used within a ClientsProvider')
  }
  return context
}
