import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { produtosRepo } from '../services/db'

const CATEGORIES_STORAGE_KEY = 'pdv-sistema-2026:categories'

// Catálogo de produtos e categorias compartilhado — vive num contexto (e não mais
// como estado local de EstoqueMain) para que outras telas, como Configurações
// (exportação em CSV, backup), também tenham acesso ao catálogo atual.
//
// Persistência: os produtos são carregados de `produtosRepo` (SQLite local via
// Tauri, ou o fallback em localStorage — ver src/services/db.js) no primeiro
// carregamento. Dali em diante, o contexto continua expondo o mesmo par
// `[products, setProducts]` que EstoqueMain sempre usou — nenhuma tela precisa
// conhecer o banco de dados — mas cada mudança de `products` é reconciliada
// contra o último snapshot sincronizado e vira uma chamada real de
// INSERT/UPDATE/DELETE no banco. Produtos novos entram com um id local
// temporário (gerado pela própria tela); assim que o INSERT retorna o id
// definitivo do banco, o id local é substituído silenciosamente no estado.
//
// Categorias não fazem parte do schema pedido para a Etapa 3 (são só um valor
// livre na coluna `categoria` de cada produto) — continuam em localStorage,
// como já eram antes desta etapa.
function buildInitialCategoryList(products) {
  const distinct = Array.from(new Set(products.map((product) => product.category).filter(Boolean)))
  return distinct.map((name, index) => ({ id: index + 1, name }))
}

function loadInitialCategories() {
  try {
    const raw = window.localStorage.getItem(CATEGORIES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const ProductsContext = createContext(null)

export function ProductsProvider({ children }) {
  const [products, setProducts] = useState([])
  const [categoryList, setCategoryList] = useState(loadInitialCategories)
  const [isLoaded, setIsLoaded] = useState(false)

  // Último estado confirmado no banco, por id — usado para descobrir, a cada
  // mudança de `products`, quais linhas são novas (INSERT), quais mudaram
  // (UPDATE) e quais sumiram (DELETE).
  const syncedSnapshotRef = useRef(new Map())
  const isApplyingRemoteIdsRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    produtosRepo
      .list()
      .then((list) => {
        if (cancelled) return
        syncedSnapshotRef.current = new Map(list.map((product) => [product.id, product]))
        setProducts(list)
        setCategoryList((prev) => (prev.length > 0 ? prev : buildInitialCategoryList(list)))
        setIsLoaded(true)
      })
      .catch((error) => {
        // `syncedSnapshotRef` fica vazio (só é populado no `.then` acima) —
        // como o efeito de reconciliação logo abaixo só apaga do banco os
        // ids que sumiram de `products` *em relação a esse snapshot*, com os
        // dois vazios ele não dispara nenhum DELETE indevido. Só destrava
        // `isLoaded` pra não deixar a tela presa esperando uma Promise que
        // nunca resolve.
        console.error('[products] Falha ao carregar produtos do banco de dados:', error)
        if (cancelled) return
        setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoryList))
  }, [categoryList])

  useEffect(() => {
    if (!isLoaded || isApplyingRemoteIdsRef.current) return

    const synced = syncedSnapshotRef.current
    const currentIds = new Set(products.map((product) => product.id))
    const removedIds = [...synced.keys()].filter((id) => !currentIds.has(id))

    async function reconcile() {
      for (const id of removedIds) {
        await produtosRepo.remove(id)
        synced.delete(id)
      }

      const idRemap = []
      for (const product of products) {
        const previous = synced.get(product.id)
        if (!previous) {
          const created = await produtosRepo.create(product)
          synced.set(created.id, created)
          if (created.id !== product.id) idRemap.push([product.id, created.id])
          continue
        }
        if (JSON.stringify(previous) !== JSON.stringify(product)) {
          const updated = await produtosRepo.update(product.id, product)
          synced.set(product.id, updated)
        }
      }

      if (idRemap.length > 0) {
        isApplyingRemoteIdsRef.current = true
        setProducts((prev) =>
          prev.map((product) => {
            const remap = idRemap.find(([oldId]) => oldId === product.id)
            return remap ? { ...product, id: remap[1] } : product
          }),
        )
        queueMicrotask(() => {
          isApplyingRemoteIdsRef.current = false
        })
      }
    }

    reconcile().catch((error) => {
      console.error('[products] Falha ao sincronizar produtos com o banco de dados:', error)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, isLoaded])

  /**
   * Aplica no estado local um produto já persistido no banco por outra
   * operação (ex.: baixa de estoque de uma venda, feita por `vendasRepo.
   * registerSale`) — atualiza o snapshot sincronizado e o estado visível sem
   * disparar um novo INSERT/UPDATE na reconciliação acima.
   */
  function applyExternalUpdate(product) {
    syncedSnapshotRef.current.set(product.id, product)
    setProducts((prev) => prev.map((item) => (item.id === product.id ? product : item)))
  }

  return (
    <ProductsContext.Provider
      value={{ products, setProducts, categoryList, setCategoryList, applyExternalUpdate, isLoaded }}
    >
      {children}
    </ProductsContext.Provider>
  )
}

export function useProducts() {
  const context = useContext(ProductsContext)
  if (!context) {
    throw new Error('useProducts must be used within a ProductsProvider')
  }
  return context
}
