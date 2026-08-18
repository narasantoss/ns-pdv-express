// Servidor HTTP Local (Rede Local Multi-PC — Mestre/Balcão).
//
// Quando este PC está configurado como "Mestre" (ver `modo_operacao` em
// `configuracoes`, tela Configurações), a interface liga este micro-servidor
// HTTP embutido via os comandos `start_local_server`/`stop_local_server`
// (chamados pelo lado JS em `src/context/NetworkSyncContext.jsx`, reagindo a
// mudanças de `settings.operationMode`). PCs "Balcão" da mesma rede consomem
// essa API (ver `src/services/masterClient.js`) para ler produtos/clientes e
// registrar vendas/comandas direto no banco do Mestre, em vez de manter uma
// cópia local isolada.
//
// O acesso ao SQLite aqui usa `rusqlite` (conexão própria, independente do
// pool `sqlx` usado pelo `tauri-plugin-sql` do lado JS) apontando para o
// mesmo arquivo físico (`app_config_dir/pdv_express.db`) — por isso todo
// `open_conn` liga WAL + busy_timeout, para o SQLite tolerar bem os dois
// lados escrevendo/lendo concorrentemente no mesmo arquivo.
use axum::{
  extract::State,
  http::StatusCode,
  routing::{get, post},
  Json, Router,
};
use chrono::SecondsFormat;
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;

const DB_FILE_NAME: &str = "pdv_express.db";
const PORT: u16 = 3333;
const VERSAO: &str = "1.0.7";

static SERVER_SHUTDOWN: OnceLock<Mutex<Option<oneshot::Sender<()>>>> = OnceLock::new();
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);

fn shutdown_cell() -> &'static Mutex<Option<oneshot::Sender<()>>> {
  SERVER_SHUTDOWN.get_or_init(|| Mutex::new(None))
}

#[derive(Clone)]
struct AppState {
  db_path: PathBuf,
}

/// Liga o servidor HTTP local na porta 3333 (`http://0.0.0.0:3333`). Chamado
/// pelo lado JS quando `operationMode === 'mestre'`. Idempotente: se já
/// estiver rodando, apenas confirma a porta em uso.
#[tauri::command]
pub async fn start_local_server(app: tauri::AppHandle) -> Result<u16, String> {
  if SERVER_RUNNING.load(Ordering::SeqCst) {
    return Ok(PORT);
  }

  let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
  let db_path = dir.join(DB_FILE_NAME);

  let (tx, rx) = oneshot::channel::<()>();
  {
    let mut guard = shutdown_cell().lock().map_err(|_| "Falha ao travar o estado do servidor.".to_string())?;
    *guard = Some(tx);
  }

  let state = AppState { db_path };
  let router = Router::new()
    .route("/api/ping", get(ping))
    .route("/api/produtos", get(get_produtos))
    .route("/api/clientes", get(get_clientes))
    .route("/api/vendas", post(post_vendas))
    .route("/api/comandas", get(get_comandas).post(post_comandas))
    .layer(CorsLayer::permissive())
    .with_state(state);

  let listener = tokio::net::TcpListener::bind(("0.0.0.0", PORT))
    .await
    .map_err(|error| format!("Não foi possível abrir a porta {}: {}", PORT, error))?;

  SERVER_RUNNING.store(true, Ordering::SeqCst);
  tauri::async_runtime::spawn(async move {
    let _ = axum::serve(listener, router)
      .with_graceful_shutdown(async {
        let _ = rx.await;
      })
      .await;
    SERVER_RUNNING.store(false, Ordering::SeqCst);
  });

  Ok(PORT)
}

/// Desliga o servidor HTTP local, se estiver rodando. Chamado pelo lado JS
/// quando `operationMode` deixa de ser `'mestre'`.
#[tauri::command]
pub fn stop_local_server() -> Result<(), String> {
  let mut guard = shutdown_cell().lock().map_err(|_| "Falha ao travar o estado do servidor.".to_string())?;
  if let Some(tx) = guard.take() {
    let _ = tx.send(());
  }
  SERVER_RUNNING.store(false, Ordering::SeqCst);
  Ok(())
}

#[tauri::command]
pub fn is_local_server_running() -> bool {
  SERVER_RUNNING.load(Ordering::SeqCst)
}

// ---------------------------------------------------------------------------
// Acesso ao SQLite — conexão própria (rusqlite) por requisição, apontando
// para o mesmo arquivo físico usado pelo `tauri-plugin-sql` do lado JS.
// ---------------------------------------------------------------------------

fn open_conn(db_path: &Path) -> Result<Connection, String> {
  let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
  conn.busy_timeout(Duration::from_secs(5)).map_err(|error| error.to_string())?;
  conn
    .pragma_update(None, "journal_mode", "WAL")
    .map_err(|error| error.to_string())?;
  Ok(conn)
}

fn value_to_json(value: rusqlite::types::Value) -> Value {
  use rusqlite::types::Value as V;
  match value {
    V::Null => Value::Null,
    V::Integer(i) => Value::from(i),
    V::Real(f) => Value::from(f),
    V::Text(s) => Value::String(s),
    V::Blob(b) => Value::String(format!("<blob:{} bytes>", b.len())),
  }
}

fn row_to_json(row: &rusqlite::Row, columns: &[String]) -> Value {
  let mut map = serde_json::Map::new();
  for (index, column) in columns.iter().enumerate() {
    let value: rusqlite::types::Value = row.get(index).unwrap_or(rusqlite::types::Value::Null);
    map.insert(column.clone(), value_to_json(value));
  }
  Value::Object(map)
}

fn query_all<P: rusqlite::Params>(conn: &Connection, sql: &str, params: P) -> Result<Vec<Value>, String> {
  let mut stmt = conn.prepare(sql).map_err(|error| error.to_string())?;
  let columns: Vec<String> = stmt.column_names().iter().map(|name| name.to_string()).collect();
  let rows = stmt
    .query_map(params, move |row| Ok(row_to_json(row, &columns)))
    .map_err(|error| error.to_string())?;
  rows.collect::<Result<Vec<_>, _>>().map_err(|error| error.to_string())
}

fn query_one_map_opt<P: rusqlite::Params>(conn: &Connection, sql: &str, params: P) -> Result<Option<Value>, String> {
  let mut stmt = conn.prepare(sql).map_err(|error| error.to_string())?;
  let columns: Vec<String> = stmt.column_names().iter().map(|name| name.to_string()).collect();
  let mut rows = stmt.query(params).map_err(|error| error.to_string())?;
  match rows.next().map_err(|error| error.to_string())? {
    Some(row) => Ok(Some(row_to_json(row, &columns))),
    None => Ok(None),
  }
}

fn query_one_map<P: rusqlite::Params>(conn: &Connection, sql: &str, params: P) -> Result<Value, String> {
  query_one_map_opt(conn, sql, params)?.ok_or_else(|| "Registro não encontrado.".to_string())
}

fn now_iso() -> String {
  chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn round_currency(value: f64) -> f64 {
  (value * 100.0).round() / 100.0
}

fn internal_error(message: String) -> (StatusCode, String) {
  (StatusCode::INTERNAL_SERVER_ERROR, message)
}

// ---------------------------------------------------------------------------
// GET /api/ping
// ---------------------------------------------------------------------------

async fn ping() -> Json<Value> {
  Json(json!({ "status": "online", "role": "mestre", "versao": VERSAO }))
}

// ---------------------------------------------------------------------------
// GET /api/produtos, GET /api/clientes — linhas brutas do SQLite (mesmo
// formato de coluna usado pelo schema); o lado JS reaproveita `rowToProduct`/
// `rowToClient` (src/services/db.js) para converter para o formato de app.
// ---------------------------------------------------------------------------

async fn query_list(db_path: PathBuf, sql: &'static str) -> Result<Json<Value>, (StatusCode, String)> {
  let result = tokio::task::spawn_blocking(move || -> Result<Value, String> {
    let conn = open_conn(&db_path)?;
    Ok(Value::Array(query_all(&conn, sql, rusqlite::params![])?))
  })
  .await
  .map_err(|error| internal_error(error.to_string()))?;
  result.map(Json).map_err(internal_error)
}

async fn get_produtos(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, String)> {
  query_list(state.db_path, "SELECT * FROM produtos ORDER BY nome").await
}

async fn get_clientes(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, String)> {
  query_list(state.db_path, "SELECT * FROM clientes ORDER BY nome").await
}

// ---------------------------------------------------------------------------
// POST /api/vendas — grava a venda efetuada no Balcão, desconta o estoque
// (produto agregado ou variação tamanho/cor, espelhando
// `produtosRepo.adjustVariationStock` em src/services/db.js) e lança o débito
// no cliente quando `formaPagamento === 'crediario'`, tudo numa única
// transação SQLite.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VendaItemPayload {
  produto_id: Option<i64>,
  quantidade: f64,
  preco_unitario: f64,
  variation_code: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct VendaPayload {
  cliente_id: Option<i64>,
  #[serde(default)]
  operador: String,
  itens: Vec<VendaItemPayload>,
  total_bruto: f64,
  #[serde(default)]
  desconto: f64,
  total_liquido: f64,
  #[serde(default)]
  forma_pagamento: String,
  status: Option<String>,
  troco: Option<f64>,
  amount_received: Option<f64>,
  split_payments: Option<Value>,
}

async fn post_vendas(
  State(state): State<AppState>,
  Json(payload): Json<VendaPayload>,
) -> Result<Json<Value>, (StatusCode, String)> {
  let result = tokio::task::spawn_blocking(move || handle_post_vendas(&state.db_path, payload))
    .await
    .map_err(|error| internal_error(error.to_string()))?;
  result.map(Json).map_err(internal_error)
}

fn handle_post_vendas(db_path: &Path, payload: VendaPayload) -> Result<Value, String> {
  let mut conn = open_conn(db_path)?;
  let tx = conn.transaction().map_err(|error| error.to_string())?;

  let status = payload.status.unwrap_or_else(|| "concluida".to_string());
  let data_venda = now_iso();
  let dados_extra = json!({
    "troco": payload.troco,
    "amountReceived": payload.amount_received,
    "splitPayments": payload.split_payments,
  })
  .to_string();

  tx.execute(
    "INSERT INTO vendas (cliente_id, operador, total_bruto, desconto, total_liquido, forma_pagamento, status, data_venda, dados_extra)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
    rusqlite::params![
      payload.cliente_id,
      payload.operador,
      payload.total_bruto,
      payload.desconto,
      payload.total_liquido,
      payload.forma_pagamento,
      status,
      data_venda,
      dados_extra,
    ],
  )
  .map_err(|error| error.to_string())?;
  let venda_id = tx.last_insert_rowid();

  let mut itens_criados = Vec::new();
  let mut produtos_atualizados = Vec::new();

  for item in &payload.itens {
    let subtotal = round_currency(item.quantidade * item.preco_unitario);
    tx.execute(
      "INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal, variacao_codigo)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      rusqlite::params![
        venda_id,
        item.produto_id,
        item.quantidade,
        item.preco_unitario,
        subtotal,
        item.variation_code,
      ],
    )
    .map_err(|error| error.to_string())?;
    let item_id = tx.last_insert_rowid();
    itens_criados.push(query_one_map(&tx, "SELECT * FROM itens_venda WHERE id = ?1", rusqlite::params![item_id])?);

    if let Some(produto_id) = item.produto_id {
      if let Some(produto) = adjust_stock(&tx, produto_id, -item.quantidade, item.variation_code.as_deref())? {
        produtos_atualizados.push(produto);
      }
    }
  }

  let mut cliente_atualizado: Option<Value> = None;
  if let Some(cliente_id) = payload.cliente_id {
    if payload.forma_pagamento == "crediario" {
      let descricao = format!("Venda #{} - Frente de Caixa (Balcão)", venda_id);
      cliente_atualizado = Some(register_movement(&tx, cliente_id, "compra", payload.total_liquido, &descricao)?);
    }
  }

  let venda_row = query_one_map(&tx, "SELECT * FROM vendas WHERE id = ?1", rusqlite::params![venda_id])?;

  tx.commit().map_err(|error| error.to_string())?;

  Ok(json!({
    "venda": venda_row,
    "itens": itens_criados,
    "produtosAtualizados": produtos_atualizados,
    "clienteAtualizado": cliente_atualizado,
  }))
}

/// Baixa `delta_quantidade` (negativo numa venda) do estoque do produto
/// `produto_id`. Quando `variation_code` bate com alguma variação
/// (`size__color`) guardada em `produtos.dados_extra.variations`, ajusta só
/// aquela variação e recalcula `estoque_atual` como a soma de todas — mesma
/// regra de `produtosRepo.adjustVariationStock` (src/services/db.js).
fn adjust_stock(
  tx: &Connection,
  produto_id: i64,
  delta_quantidade: f64,
  variation_code: Option<&str>,
) -> Result<Option<Value>, String> {
  let Some(row) = query_one_map_opt(tx, "SELECT * FROM produtos WHERE id = ?1", rusqlite::params![produto_id])? else {
    return Ok(None);
  };

  let dados_extra_str = row.get("dados_extra").and_then(|v| v.as_str()).unwrap_or("{}").to_string();
  let mut extra: Value = serde_json::from_str(&dados_extra_str).unwrap_or_else(|_| json!({}));
  let mut applied_to_variation = false;

  if let Some(code) = variation_code {
    if let Some(variations) = extra.get_mut("variations").and_then(|v| v.as_array_mut()) {
      let mut found = false;
      for variation in variations.iter_mut() {
        let size = variation.get("size").and_then(|v| v.as_str()).unwrap_or("");
        let color = variation.get("color").and_then(|v| v.as_str()).unwrap_or("");
        if format!("{}__{}", size, color) == code {
          let current = variation.get("stock").and_then(|v| v.as_f64()).unwrap_or(0.0);
          variation["stock"] = json!(current + delta_quantidade);
          found = true;
        }
      }
      if found {
        let novo_total: f64 = variations.iter().map(|v| v.get("stock").and_then(|s| s.as_f64()).unwrap_or(0.0)).sum();
        let extra_str = serde_json::to_string(&extra).map_err(|error| error.to_string())?;
        tx.execute(
          "UPDATE produtos SET estoque_atual = ?1, dados_extra = ?2 WHERE id = ?3",
          rusqlite::params![novo_total, extra_str, produto_id],
        )
        .map_err(|error| error.to_string())?;
        applied_to_variation = true;
      }
    }
  }

  if !applied_to_variation {
    let atual = row.get("estoque_atual").and_then(|v| v.as_f64()).unwrap_or(0.0);
    tx.execute(
      "UPDATE produtos SET estoque_atual = ?1 WHERE id = ?2",
      rusqlite::params![atual + delta_quantidade, produto_id],
    )
    .map_err(|error| error.to_string())?;
  }

  Ok(Some(query_one_map(tx, "SELECT * FROM produtos WHERE id = ?1", rusqlite::params![produto_id])?))
}

/// Lança uma compra fiado (`tipo = "compra"`) ou um pagamento (`tipo =
/// "pagamento"`) no saldo/histórico do cliente — mesma regra de
/// `clientesRepo.registerMovement` (src/services/db.js).
fn register_movement(tx: &Connection, cliente_id: i64, tipo: &str, valor: f64, descricao: &str) -> Result<Value, String> {
  let row = query_one_map(tx, "SELECT * FROM clientes WHERE id = ?1", rusqlite::params![cliente_id])?;
  let historico_str = row.get("historico").and_then(|v| v.as_str()).unwrap_or("[]").to_string();
  let mut historico: Vec<Value> = serde_json::from_str(&historico_str).unwrap_or_default();

  let delta = if tipo == "pagamento" { -valor } else { valor };
  let saldo_atual = row.get("saldo_devedor").and_then(|v| v.as_f64()).unwrap_or(0.0);
  let novo_saldo = (saldo_atual + delta).max(0.0);
  let proximo_id = historico
    .iter()
    .filter_map(|entry| entry.get("id").and_then(|v| v.as_i64()))
    .max()
    .unwrap_or(0)
    + 1;

  historico.push(json!({
    "id": proximo_id,
    "date": now_iso().get(0..10).unwrap_or("").to_string(),
    "type": tipo,
    "amount": valor,
    "description": descricao,
  }));

  let historico_json = serde_json::to_string(&historico).map_err(|error| error.to_string())?;
  tx.execute(
    "UPDATE clientes SET saldo_devedor = ?1, historico = ?2 WHERE id = ?3",
    rusqlite::params![novo_saldo, historico_json, cliente_id],
  )
  .map_err(|error| error.to_string())?;

  query_one_map(tx, "SELECT * FROM clientes WHERE id = ?1", rusqlite::params![cliente_id])
}

// ---------------------------------------------------------------------------
// GET/POST /api/comandas — mesmo modelo "substitui os itens da comanda"
// usado localmente por `loadComandas`/`persistComandas` (src/lib/database.js).
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ComandaItemPayload {
  #[serde(rename = "productId", alias = "id")]
  product_id: Option<i64>,
  price: f64,
  qty: f64,
}

#[derive(Deserialize)]
struct ComandaPayload {
  id: i64,
  status: String,
  #[serde(rename = "openedAt")]
  opened_at: Option<String>,
  #[serde(default)]
  items: Vec<ComandaItemPayload>,
}

async fn get_comandas(State(state): State<AppState>) -> Result<Json<Value>, (StatusCode, String)> {
  let result = tokio::task::spawn_blocking(move || handle_get_comandas(&state.db_path))
    .await
    .map_err(|error| internal_error(error.to_string()))?;
  result.map(Json).map_err(internal_error)
}

fn handle_get_comandas(db_path: &Path) -> Result<Value, String> {
  let conn = open_conn(db_path)?;
  build_comandas_snapshot(&conn)
}

fn build_comandas_snapshot(conn: &Connection) -> Result<Value, String> {
  let comandas = query_all(
    conn,
    "SELECT id, numero, status, total_acumulado, data_abertura FROM comandas ORDER BY numero",
    rusqlite::params![],
  )?;
  let itens = query_all(
    conn,
    "SELECT comanda_id, produto_id, quantidade, preco_unitario FROM itens_comanda",
    rusqlite::params![],
  )?;

  let mut result = Vec::with_capacity(comandas.len());
  for comanda in &comandas {
    let comanda_db_id = comanda.get("id").and_then(|v| v.as_i64());
    let items: Vec<Value> = itens
      .iter()
      .filter(|item| item.get("comanda_id").and_then(|v| v.as_i64()) == comanda_db_id)
      .map(|item| {
        json!({
          "productId": item.get("produto_id"),
          "price": item.get("preco_unitario"),
          "qty": item.get("quantidade"),
        })
      })
      .collect();

    result.push(json!({
      "id": comanda.get("numero"),
      "status": comanda.get("status"),
      "openedAt": comanda.get("data_abertura"),
      "items": items,
    }));
  }

  Ok(Value::Array(result))
}

async fn post_comandas(
  State(state): State<AppState>,
  Json(payload): Json<Vec<ComandaPayload>>,
) -> Result<Json<Value>, (StatusCode, String)> {
  let result = tokio::task::spawn_blocking(move || handle_post_comandas(&state.db_path, payload))
    .await
    .map_err(|error| internal_error(error.to_string()))?;
  result.map(Json).map_err(internal_error)
}

fn handle_post_comandas(db_path: &Path, payload: Vec<ComandaPayload>) -> Result<Value, String> {
  let mut conn = open_conn(db_path)?;
  let tx = conn.transaction().map_err(|error| error.to_string())?;

  for comanda in &payload {
    let total: f64 = comanda.items.iter().map(|item| item.price * item.qty).sum();
    tx.execute(
      "UPDATE comandas SET status = ?1, total_acumulado = ?2, data_abertura = ?3 WHERE numero = ?4",
      rusqlite::params![comanda.status, total, comanda.opened_at, comanda.id],
    )
    .map_err(|error| error.to_string())?;

    let comanda_db_id: i64 = tx
      .query_row(
        "SELECT id FROM comandas WHERE numero = ?1",
        rusqlite::params![comanda.id],
        |row| row.get(0),
      )
      .map_err(|error| format!("Comanda #{} não encontrada: {}", comanda.id, error))?;

    tx.execute(
      "DELETE FROM itens_comanda WHERE comanda_id = ?1",
      rusqlite::params![comanda_db_id],
    )
    .map_err(|error| error.to_string())?;

    for item in &comanda.items {
      tx.execute(
        "INSERT INTO itens_comanda (comanda_id, produto_id, quantidade, preco_unitario, subtotal)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![comanda_db_id, item.product_id, item.qty, item.price, item.price * item.qty],
      )
      .map_err(|error| error.to_string())?;
    }
  }

  let snapshot = build_comandas_snapshot(&tx)?;
  tx.commit().map_err(|error| error.to_string())?;
  Ok(snapshot)
}
