// Cliente HTTP do PC Balcão para o servidor local do PC Mestre (Rede Local
// Multi-PC — ver src-tauri/src/server.rs, o servidor embutido que só fica de
// pé quando o modo de operação daquele outro PC é "mestre"). Usado por
// src/services/db.js (produtos/clientes/vendas) e src/lib/database.js
// (comandas) quando este PC está configurado como "PC Cliente / Balcão" e tem
// um IP de Mestre válido salvo em Configurações — ver `getLanTarget` nesses
// dois arquivos.
import { rowToProduct, rowToClient, rowToVenda } from './db'
import { isValidIp } from '../utils/network'

const MASTER_PORT = 3333
const DEFAULT_TIMEOUT_MS = 4000
const WRITE_TIMEOUT_MS = 8000

function baseUrl(ip) {
  return `http://${ip.trim()}:${MASTER_PORT}`
}

/**
 * Faz a chamada HTTP e normaliza o resultado em `{ok:true, data}` ou
 * `{ok:false, reason}` — nunca lança, para que quem chama decida como reagir
 * (erro na tela, aviso de reconexão etc.) sem precisar de try/catch.
 */
async function requestJson(url, { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      return { ok: false, reason: `http-${response.status}`, detail }
    }
    const data = await response.json()
    return { ok: true, data }
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'unreachable', detail: String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/** GET /api/ping — usado tanto pelo teste de conexão em Configurações quanto pelo monitor de reconexão (NetworkSyncContext). */
export async function pingMaster(ip, timeoutMs) {
  if (!isValidIp(ip)) return { ok: false, reason: 'invalid-ip' }
  return requestJson(`${baseUrl(ip)}/api/ping`, { timeoutMs })
}

/** GET /api/produtos — já convertido para o formato de app via `rowToProduct` (mesma conversão usada pelo SQLite local). */
export async function fetchProdutosFromMaster(ip) {
  const result = await requestJson(`${baseUrl(ip)}/api/produtos`)
  if (!result.ok) return result
  return { ok: true, data: result.data.map(rowToProduct) }
}

/** GET /api/clientes — já convertido para o formato de app via `rowToClient`. */
export async function fetchClientesFromMaster(ip) {
  const result = await requestJson(`${baseUrl(ip)}/api/clientes`)
  if (!result.ok) return result
  return { ok: true, data: result.data.map(rowToClient) }
}

/**
 * POST /api/vendas — envia a venda fechada no Balcão para o Mestre debitar o
 * estoque e lançar o crediário na mesma transação. Devolve exatamente o
 * mesmo formato de `vendasRepo.registerSale` local (`{...venda, itens,
 * produtosAtualizados, clienteAtualizado}`), para que PDVMain use o
 * resultado sem precisar saber se a venda foi local ou remota.
 */
export async function postVendaToMaster(ip, payload) {
  const result = await requestJson(`${baseUrl(ip)}/api/vendas`, {
    method: 'POST',
    body: payload,
    timeoutMs: WRITE_TIMEOUT_MS,
  })
  if (!result.ok) return result
  const { venda, itens, produtosAtualizados, clienteAtualizado } = result.data
  return {
    ok: true,
    data: {
      ...rowToVenda(venda),
      itens,
      produtosAtualizados: (produtosAtualizados ?? []).map(rowToProduct),
      clienteAtualizado: clienteAtualizado ? rowToClient(clienteAtualizado) : null,
    },
  }
}

/** POST /api/comandas — envia o estado completo das 30 comandas para o Mestre gravar (mesmo modelo "substitui os itens" do `persistComandas` local). */
export async function postComandasToMaster(ip, comandas) {
  return requestJson(`${baseUrl(ip)}/api/comandas`, {
    method: 'POST',
    body: comandas,
    timeoutMs: WRITE_TIMEOUT_MS,
  })
}

/** GET /api/comandas — `getProductName` resolve o nome de cada item a partir do catálogo já carregado neste PC, igual ao `loadComandas` local. */
export async function fetchComandasFromMaster(ip, getProductName) {
  const result = await requestJson(`${baseUrl(ip)}/api/comandas`)
  if (!result.ok) return result
  const data = result.data.map((row) => ({
    id: row.id,
    status: row.status,
    openedAt: row.openedAt,
    items: (row.items ?? []).map((item) => ({
      id: item.productId,
      name: getProductName?.(item.productId) ?? `Produto #${item.productId}`,
      price: item.price,
      qty: item.qty,
    })),
  }))
  return { ok: true, data }
}
