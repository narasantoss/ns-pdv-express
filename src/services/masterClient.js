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

/** POST /api/produtos — cria um produto no banco do Mestre. `row` é o mesmo formato snake_case produzido por `productToRow` (src/services/db.js). Devolve o produto já em formato de app. */
export async function createProdutoOnMaster(ip, row) {
  const result = await requestJson(`${baseUrl(ip)}/api/produtos`, { method: 'POST', body: row, timeoutMs: WRITE_TIMEOUT_MS })
  if (!result.ok) return result
  return { ok: true, data: rowToProduct(result.data) }
}

/** PUT /api/produtos/:id — atualiza um produto no banco do Mestre. */
export async function updateProdutoOnMaster(ip, id, row) {
  const result = await requestJson(`${baseUrl(ip)}/api/produtos/${id}`, { method: 'PUT', body: row, timeoutMs: WRITE_TIMEOUT_MS })
  if (!result.ok) return result
  return { ok: true, data: rowToProduct(result.data) }
}

/** DELETE /api/produtos/:id — remove um produto do banco do Mestre. */
export async function removeProdutoOnMaster(ip, id) {
  return requestJson(`${baseUrl(ip)}/api/produtos/${id}`, { method: 'DELETE', timeoutMs: WRITE_TIMEOUT_MS })
}

/** POST /api/produtos/:id/ajuste-estoque — ajusta o estoque (agregado ou de uma variação) de um produto no Mestre, mesma regra de `produtosRepo.adjustStock`/`adjustVariationStock`. */
export async function adjustProdutoStockOnMaster(ip, id, deltaQuantidade, variationCode) {
  const result = await requestJson(`${baseUrl(ip)}/api/produtos/${id}/ajuste-estoque`, {
    method: 'POST',
    body: { deltaQuantidade, variationCode: variationCode ?? null },
    timeoutMs: WRITE_TIMEOUT_MS,
  })
  if (!result.ok) return result
  return { ok: true, data: result.data ? rowToProduct(result.data) : null }
}

/** GET /api/clientes — já convertido para o formato de app via `rowToClient`. */
export async function fetchClientesFromMaster(ip) {
  const result = await requestJson(`${baseUrl(ip)}/api/clientes`)
  if (!result.ok) return result
  return { ok: true, data: result.data.map(rowToClient) }
}

/** POST /api/clientes — cria um cliente no banco do Mestre. `row` é o mesmo formato snake_case produzido por `clientToRow`. */
export async function createClienteOnMaster(ip, row) {
  const result = await requestJson(`${baseUrl(ip)}/api/clientes`, { method: 'POST', body: row, timeoutMs: WRITE_TIMEOUT_MS })
  if (!result.ok) return result
  return { ok: true, data: rowToClient(result.data) }
}

/** PUT /api/clientes/:id — atualiza um cliente no banco do Mestre. */
export async function updateClienteOnMaster(ip, id, row) {
  const result = await requestJson(`${baseUrl(ip)}/api/clientes/${id}`, { method: 'PUT', body: row, timeoutMs: WRITE_TIMEOUT_MS })
  if (!result.ok) return result
  return { ok: true, data: rowToClient(result.data) }
}

/** DELETE /api/clientes/:id — remove um cliente do banco do Mestre. */
export async function removeClienteOnMaster(ip, id) {
  return requestJson(`${baseUrl(ip)}/api/clientes/${id}`, { method: 'DELETE', timeoutMs: WRITE_TIMEOUT_MS })
}

/** POST /api/clientes/:id/movimento — lança uma compra fiado ou um pagamento no Mestre, mesma regra de `clientesRepo.registerMovement`. */
export async function registerClienteMovementOnMaster(ip, id, { type, amount, description }) {
  const result = await requestJson(`${baseUrl(ip)}/api/clientes/${id}/movimento`, {
    method: 'POST',
    body: { type, amount, description },
    timeoutMs: WRITE_TIMEOUT_MS,
  })
  if (!result.ok) return result
  return { ok: true, data: rowToClient(result.data) }
}

/**
 * GET /api/vendas — histórico completo de vendas do Mestre, cada uma já com
 * seus itens (`itens_venda`) embutidos. Usado pelas telas de Vendas do Dia,
 * Financeiro e Trocas quando este PC está em modo Balcão. O nome de cada
 * item é resolvido no chamador (`getProductName`), igual ao que
 * `vendasRepo.listWithItems` já faz localmente.
 */
export async function fetchVendasFromMaster(ip) {
  const result = await requestJson(`${baseUrl(ip)}/api/vendas`)
  if (!result.ok) return result
  return {
    ok: true,
    data: result.data.map((row) => ({
      venda: rowToVenda(row),
      itens: (row.itens ?? []).map((item) => ({
        produtoId: item.produto_id,
        precoUnitario: Number(item.preco_unitario),
        quantidade: Number(item.quantidade),
        subtotal: Number(item.subtotal),
        variationCode: item.variacao_codigo ?? null,
      })),
    })),
  }
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

/** POST /api/vendas/:id/estorno — estorna uma venda no Mestre (devolve estoque, reverte crediário), mesma regra de `vendasRepo.voidSale`. */
export async function voidVendaOnMaster(ip, id, motivo) {
  const result = await requestJson(`${baseUrl(ip)}/api/vendas/${id}/estorno`, {
    method: 'POST',
    body: { motivo: motivo ?? '' },
    timeoutMs: WRITE_TIMEOUT_MS,
  })
  if (!result.ok) return result
  const { venda, produtosAtualizados, clienteAtualizado } = result.data
  return {
    ok: true,
    data: {
      venda: rowToVenda(venda),
      produtosAtualizados: (produtosAtualizados ?? []).map(rowToProduct),
      clienteAtualizado: clienteAtualizado ? rowToClient(clienteAtualizado) : null,
    },
  }
}

/** POST /api/vendas/:id/quitar — troca a forma de pagamento de uma venda crediário e baixa o saldo do cliente no Mestre, mesma regra de `vendasRepo.settlePayment`. */
export async function settleVendaOnMaster(ip, id, paymentMethod) {
  const result = await requestJson(`${baseUrl(ip)}/api/vendas/${id}/quitar`, {
    method: 'POST',
    body: { formaPagamento: paymentMethod },
    timeoutMs: WRITE_TIMEOUT_MS,
  })
  if (!result.ok) return result
  const { venda, clienteAtualizado } = result.data
  return {
    ok: true,
    data: { venda: rowToVenda(venda), clienteAtualizado: clienteAtualizado ? rowToClient(clienteAtualizado) : null },
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

/** GET /api/vouchers — vales-crédito emitidos no Mestre, linhas brutas (o chamador converte com `rowToVoucher`). */
export async function fetchVouchersFromMaster(ip) {
  return requestJson(`${baseUrl(ip)}/api/vouchers`)
}

/** POST /api/vouchers — emite um vale-crédito no Mestre. `row` é o mesmo formato snake_case usado localmente em `vouchersRepo.create`. */
export async function createVoucherOnMaster(ip, row) {
  return requestJson(`${baseUrl(ip)}/api/vouchers`, { method: 'POST', body: row, timeoutMs: WRITE_TIMEOUT_MS })
}

/** POST /api/vouchers/:id/usar — marca um vale-crédito como utilizado no Mestre. */
export async function markVoucherUsedOnMaster(ip, id) {
  return requestJson(`${baseUrl(ip)}/api/vouchers/${id}/usar`, { method: 'POST', timeoutMs: WRITE_TIMEOUT_MS })
}

/** GET /api/trocas — log de auditoria de Trocas (vales emitidos, estornos) do Mestre, linhas brutas. */
export async function fetchTrocasLogFromMaster(ip) {
  return requestJson(`${baseUrl(ip)}/api/trocas`)
}

/** POST /api/trocas — registra uma entrada no log de auditoria de Trocas no Mestre. */
export async function createTrocaLogOnMaster(ip, row) {
  return requestJson(`${baseUrl(ip)}/api/trocas`, { method: 'POST', body: row, timeoutMs: WRITE_TIMEOUT_MS })
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
