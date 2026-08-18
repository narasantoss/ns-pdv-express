// Camada de persistência local das Comandas/Mesas.
//
// Quando rodando dentro do app Tauri, os dados são gravados no SQLite local
// `pdv_express.db` (tabelas `comandas` e `itens_comanda`, criadas via migração
// em src-tauri/src/lib.rs) através do plugin `@tauri-apps/plugin-sql` — a
// mesma conexão compartilhada usada pelo restante do sistema em
// src/services/db.js (produtos, clientes, vendas, orçamentos etc.). Quando
// rodando apenas no navegador (ex.: `npm run dev` sem o shell do Tauri, usado
// durante o desenvolvimento da UI), não há acesso ao SQLite nativo — os dados
// caem para `localStorage`, preservando o mesmo formato, para que a tela
// continue funcional fora do app empacotado.

import { getConnection, isTauriRuntime, getConfig } from '../services/db'
import { fetchComandasFromMaster, postComandasToMaster } from '../services/masterClient'

const LOCAL_STORAGE_KEY = 'pdv-sistema-2026:comandas'
const TOTAL_COMANDAS = 30

async function getDatabase() {
  return getConnection()
}

/** Mesma regra de `getLanTarget` em src/services/db.js — IP do Mestre só quando este PC está em modo Balcão. */
async function getLanTarget() {
  const mode = await getConfig('modo_operacao', 'mestre')
  if (mode !== 'balcao') return null
  const ip = await getConfig('ip_mestre', '')
  return ip && ip.trim() ? ip.trim() : null
}

function emptyComandas() {
  return Array.from({ length: TOTAL_COMANDAS }, (_, index) => ({
    id: index + 1,
    status: 'livre',
    items: [],
    openedAt: null,
  }))
}

function loadFromLocalStorage() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return emptyComandas()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length !== TOTAL_COMANDAS) return emptyComandas()
    return parsed
  } catch {
    return emptyComandas()
  }
}

function persistToLocalStorage(comandas) {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(comandas))
  } catch (error) {
    console.error('[database] Falha ao salvar comandas no localStorage:', error)
  }
}

/**
 * Carrega o estado das 30 comandas. `getProductName(produtoId)` resolve o nome
 * exibido de cada item — a tabela `itens_comanda` guarda apenas produto_id/preço,
 * então o nome vem do catálogo de produtos já carregado no frontend.
 */
export async function loadComandas(getProductName) {
  const target = await getLanTarget()
  if (target) {
    const result = await fetchComandasFromMaster(target, getProductName)
    if (result.ok) return result.data
    console.error(`[database] Falha ao carregar comandas do Caixa Principal (${target}):`, result.reason)
    return emptyComandas()
  }

  const db = await getDatabase()
  if (!db) return loadFromLocalStorage()

  try {
    const comandaRows = await db.select(
      'SELECT id, numero, status, total_acumulado, data_abertura FROM comandas ORDER BY numero',
    )
    const itemRows = await db.select(
      'SELECT comanda_id, produto_id, quantidade, preco_unitario FROM itens_comanda',
    )

    const itemsByComandaId = new Map()
    for (const row of itemRows) {
      const list = itemsByComandaId.get(row.comanda_id) ?? []
      list.push({
        id: row.produto_id,
        name: getProductName?.(row.produto_id) ?? `Produto #${row.produto_id}`,
        price: row.preco_unitario,
        qty: row.quantidade,
      })
      itemsByComandaId.set(row.comanda_id, list)
    }

    return comandaRows.map((row) => ({
      id: row.numero,
      status: row.status,
      openedAt: row.data_abertura,
      items: itemsByComandaId.get(row.id) ?? [],
    }))
  } catch (error) {
    console.error('[database] Falha ao carregar comandas do SQLite:', error)
    return emptyComandas()
  }
}

/**
 * Sincroniza o estado completo das comandas com a persistência local.
 * Para o SQLite, substitui os itens de cada comanda (delete + reinsert) —
 * simples e correto para um único PC gravando localmente.
 */
export async function persistComandas(comandas) {
  const target = await getLanTarget()
  if (target) {
    const result = await postComandasToMaster(target, comandas)
    if (!result.ok) {
      console.error(`[database] Falha ao salvar comandas no Caixa Principal (${target}):`, result.reason)
    }
    return
  }

  const db = await getDatabase()
  if (!db) {
    persistToLocalStorage(comandas)
    return
  }

  try {
    for (const comanda of comandas) {
      const total = comanda.items.reduce((sum, item) => sum + item.price * item.qty, 0)

      await db.execute(
        'UPDATE comandas SET status = $1, total_acumulado = $2, data_abertura = $3 WHERE numero = $4',
        [comanda.status, total, comanda.openedAt, comanda.id],
      )

      const [{ id: comandaDbId }] = await db.select('SELECT id FROM comandas WHERE numero = $1', [
        comanda.id,
      ])

      await db.execute('DELETE FROM itens_comanda WHERE comanda_id = $1', [comandaDbId])

      for (const item of comanda.items) {
        await db.execute(
          `INSERT INTO itens_comanda (comanda_id, produto_id, quantidade, preco_unitario, subtotal)
           VALUES ($1, $2, $3, $4, $5)`,
          [comandaDbId, item.productId ?? item.id, item.qty, item.price, item.price * item.qty],
        )
      }
    }
  } catch (error) {
    console.error('[database] Falha ao salvar comandas no SQLite:', error)
  }
}

const BACKUP_KEY_PREFIX = 'pdv-sistema-2026:'

/**
 * Monta um snapshot dos dados locais do sistema (configurações, operadores,
 * fornecedores, comandas etc. persistidos em localStorage, mais as tabelas
 * SQLite quando rodando no app Tauri) para o backup baixável em Configurações.
 *
 * Não existe acesso de arquivo nativo (.db/.zip) a partir do navegador, então
 * o backup é um JSON com todo o estado local reconstituível — suficiente para
 * restaurar o sistema neste PC ou auditar os dados.
 */
export async function buildSystemBackup() {
  const snapshot = {
    exportedAt: new Date().toISOString(),
    localStorage: {},
    sqlite: null,
  }

  try {
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (key && key.startsWith(BACKUP_KEY_PREFIX)) {
        snapshot.localStorage[key] = window.localStorage.getItem(key)
      }
    }
  } catch (error) {
    console.error('[database] Falha ao ler localStorage para backup:', error)
  }

  const db = await getDatabase()
  if (db) {
    try {
      const comandas = await db.select('SELECT * FROM comandas ORDER BY numero')
      const itensComanda = await db.select('SELECT * FROM itens_comanda')
      snapshot.sqlite = { comandas, itens_comanda: itensComanda }
    } catch (error) {
      console.error('[database] Falha ao ler SQLite para backup:', error)
    }
  }

  return snapshot
}

/**
 * Lê os bytes brutos do arquivo SQLite local (via comando Rust `read_database_file`,
 * que resolve o caminho em `app_config_dir`, o mesmo diretório usado pelo
 * `tauri-plugin-sql`). Só funciona dentro do app Tauri — não há arquivo real
 * para ler quando a UI roda apenas no navegador (`npm run dev`).
 */
export async function downloadDatabaseFile() {
  if (!isTauriRuntime()) {
    return { ok: false, reason: 'not-tauri' }
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const bytes = await invoke('read_database_file')
    return { ok: true, bytes: new Uint8Array(bytes) }
  } catch (error) {
    console.error('[database] Falha ao ler o arquivo do banco de dados:', error)
    return { ok: false, reason: String(error) }
  }
}

/**
 * Substitui o arquivo SQLite local pelos bytes informados (comando Rust
 * `write_database_file`). Fecha a conexão ativa do plugin antes de gravar,
 * para evitar corrupção/arquivo travado — a página deve ser recarregada logo
 * em seguida para reabrir uma conexão limpa com o banco restaurado.
 */
export async function restoreDatabaseFile(bytes) {
  if (!isTauriRuntime()) {
    return { ok: false, reason: 'not-tauri' }
  }

  try {
    const db = await getDatabase()
    if (db) {
      await db.close()
    }
    databasePromise = null

    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('write_database_file', { bytes: Array.from(bytes) })
    return { ok: true }
  } catch (error) {
    console.error('[database] Falha ao restaurar o banco de dados:', error)
    return { ok: false, reason: String(error) }
  }
}

/**
 * Restaura um snapshot JSON portátil (gerado por `buildSystemBackup`): grava
 * de volta todas as chaves de `localStorage` do app (configurações,
 * operadores, fornecedores, produtos, comandas de fallback etc.) e, se o
 * snapshot trouxer dados de `sqlite` e o app estiver rodando no Tauri,
 * também sincroniza as comandas com o banco local — assim um backup .json
 * feito no navegador pode ser restaurado depois dentro do app desktop.
 */
export async function restoreFromJsonBackup(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.localStorage !== 'object') {
    return { ok: false, reason: 'invalid-snapshot' }
  }

  try {
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index)
      if (key && key.startsWith(BACKUP_KEY_PREFIX)) {
        window.localStorage.removeItem(key)
      }
    }
    Object.entries(snapshot.localStorage).forEach(([key, value]) => {
      window.localStorage.setItem(key, value)
    })
  } catch (error) {
    console.error('[database] Falha ao restaurar dados locais do snapshot:', error)
    return { ok: false, reason: String(error) }
  }

  if (snapshot.sqlite?.comandas) {
    const db = await getDatabase()
    if (db) {
      try {
        const itemsByComandaId = new Map()
        for (const row of snapshot.sqlite.itens_comanda ?? []) {
          const list = itemsByComandaId.get(row.comanda_id) ?? []
          list.push({ id: row.produto_id, name: '', price: row.preco_unitario, qty: row.quantidade })
          itemsByComandaId.set(row.comanda_id, list)
        }
        const comandas = snapshot.sqlite.comandas.map((row) => ({
          id: row.numero,
          status: row.status,
          openedAt: row.data_abertura,
          items: itemsByComandaId.get(row.id) ?? [],
        }))
        await persistComandas(comandas)
      } catch (error) {
        console.error('[database] Falha ao restaurar comandas do snapshot no SQLite:', error)
      }
    }
  }

  return { ok: true }
}
