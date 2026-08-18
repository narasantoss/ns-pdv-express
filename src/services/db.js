// Camada de serviço do Banco de Dados Local — NS PDV Express 2026 (Etapa 3).
//
// Dentro do app Tauri, os dados são gravados no SQLite local `pdv_express.db`
// (schema/migrations em `src-tauri/src/lib.rs`, via `@tauri-apps/plugin-sql`).
// Quando a UI roda apenas no navegador (`npm run dev`, sem o shell Tauri —
// usado durante o desenvolvimento da interface), não há acesso ao SQLite
// nativo: os dados caem para um fallback estruturado em JSON no
// `localStorage`, espelhando exatamente o mesmo schema de tabelas/colunas,
// para que toda tela funcione de forma idêntica dentro e fora do app
// empacotado.
//
// Sobre "migrations estilo Kysely": a Etapa 3 pede migrations/estruturação
// nesse estilo. O driver real (`tauri-plugin-sql`) roda só dentro da WebView
// do Tauri via IPC, sem um dialect Kysely oficial disponível para ele — e o
// fallback de navegador não é SQL nenhum. Em vez de forçar uma dependência
// que não serviria a nenhum dos dois ambientes, este arquivo define o schema
// como uma tabela `TABLES` única (nomes de tabela + colunas + valores
// padrão) que é a fonte da verdade para ambos os backends, e o histórico de
// mudanças de schema vive em `BROWSER_MIGRATIONS`: uma lista ordenada de
// passos `{ version, run(state) }`, aplicada e versionada no fallback de
// JSON exatamente como uma migration runner (Kysely incluso) faria — cada
// passo roda uma única vez, na ordem, e o progresso fica registrado. O lado
// SQLite usa o mesmo conceito, só que via `Migration`/`MigrationKind` do
// próprio `tauri-plugin-sql` (ver `src-tauri/src/lib.rs`), que é o mecanismo
// nativo equivalente nesse ambiente.

const DB_URL = 'sqlite:pdv_express.db'
const LS_PREFIX = 'pdv-express-db:'
const LS_SCHEMA_VERSION_KEY = `${LS_PREFIX}_schema_version`

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let connectionPromise = null

/**
 * Conexão única e compartilhada com o SQLite local. Retorna `null` fora do
 * Tauri (navegador) — nesse caso todo o módulo cai para o fallback JSON.
 */
export async function getConnection() {
  if (!isTauriRuntime()) return null
  if (!connectionPromise) {
    connectionPromise = import('@tauri-apps/plugin-sql')
      .then(({ default: Database }) => Database.load(DB_URL))
      .catch((error) => {
        console.error('[db] Falha ao conectar no SQLite local:', error)
        connectionPromise = null
        return null
      })
  }
  return connectionPromise
}

// ---------------------------------------------------------------------------
// Schema — fonte única da verdade para nomes de tabela/coluna, usada tanto
// para montar SQL parametrizado (Tauri) quanto para validar/inicializar
// registros no fallback de JSON (navegador).
// ---------------------------------------------------------------------------

export const TABLES = {
  produtos: {
    columns: [
      'codigo_barras',
      'nome',
      'categoria',
      'preco_custo',
      'preco_venda',
      'estoque_atual',
      'estoque_minimo',
      'unidade_medida',
      'pesavel',
      'codigo_balanca',
      'dados_extra',
    ],
    defaults: () => ({
      codigo_barras: '',
      nome: '',
      categoria: '',
      preco_custo: 0,
      preco_venda: 0,
      estoque_atual: 0,
      estoque_minimo: 0,
      unidade_medida: 'UN',
      pesavel: 0,
      codigo_balanca: '',
      dados_extra: '{}',
      criado_em: new Date().toISOString(),
    }),
  },
  clientes: {
    columns: ['nome', 'telefone', 'cpf_cnpj', 'limite_credito', 'saldo_devedor', 'endereco', 'historico'],
    defaults: () => ({
      nome: '',
      telefone: '',
      cpf_cnpj: '',
      limite_credito: 0,
      saldo_devedor: 0,
      endereco: '{}',
      historico: '[]',
      criado_em: new Date().toISOString(),
    }),
  },
  vendas: {
    columns: [
      'cliente_id',
      'operador',
      'total_bruto',
      'desconto',
      'total_liquido',
      'forma_pagamento',
      'status',
      'data_venda',
      'dados_extra',
    ],
    defaults: () => ({
      cliente_id: null,
      operador: '',
      total_bruto: 0,
      desconto: 0,
      total_liquido: 0,
      forma_pagamento: '',
      status: 'concluida',
      data_venda: new Date().toISOString(),
      dados_extra: '{}',
    }),
  },
  itens_venda: {
    columns: ['venda_id', 'produto_id', 'quantidade', 'preco_unitario', 'subtotal', 'variacao_codigo'],
    defaults: () => ({
      venda_id: null,
      produto_id: null,
      quantidade: 0,
      preco_unitario: 0,
      subtotal: 0,
      variacao_codigo: null,
    }),
  },
  comandas: {
    columns: ['numero', 'status', 'total_acumulado', 'data_abertura'],
    defaults: () => ({ numero: 0, status: 'livre', total_acumulado: 0, data_abertura: null }),
  },
  itens_comanda: {
    columns: ['comanda_id', 'produto_id', 'quantidade', 'preco_unitario', 'subtotal'],
    defaults: () => ({ comanda_id: null, produto_id: null, quantidade: 0, preco_unitario: 0, subtotal: 0 }),
  },
  orcamentos: {
    columns: [
      'cliente_id',
      'operador',
      'total_bruto',
      'desconto',
      'total_liquido',
      'parcelas',
      'desconto_a_vista',
      'status',
      'data_orcamento',
      'validade',
      'dados_extra',
    ],
    defaults: () => ({
      cliente_id: null,
      operador: '',
      total_bruto: 0,
      desconto: 0,
      total_liquido: 0,
      parcelas: 1,
      desconto_a_vista: 0,
      status: 'aberto',
      data_orcamento: new Date().toISOString(),
      validade: null,
      dados_extra: '{}',
    }),
  },
  itens_orcamento: {
    columns: ['orcamento_id', 'produto_id', 'quantidade', 'preco_unitario', 'subtotal'],
    defaults: () => ({ orcamento_id: null, produto_id: null, quantidade: 0, preco_unitario: 0, subtotal: 0 }),
  },
  licenca_local: {
    columns: ['chave_rsa', 'hwid_maquina', 'data_ativacao', 'status'],
    defaults: () => ({ chave_rsa: '', hwid_maquina: '', data_ativacao: null, status: 'inativa' }),
  },
  // Controle de Acesso e Perfis (v1.0.5): cadastro de usuários do sistema —
  // `perfil` só admite 'admin' (Gerente/Dono, acesso total) ou 'operador'
  // (acesso restrito à Frente de Caixa/consultas básicas). Tabela vazia por
  // padrão: `usuariosRepo.count() === 0` dispara a tela de Primeiro Acesso
  // ("Criar Usuário Administrador") — ver OperatorsContext.jsx.
  usuarios: {
    columns: ['nome', 'pin_senha', 'perfil', 'ativo', 'criado_em', 'ultimo_acesso'],
    defaults: () => ({
      nome: '',
      pin_senha: '',
      perfil: 'operador',
      ativo: 1,
      criado_em: new Date().toISOString(),
      ultimo_acesso: null,
    }),
  },
  // Etapa 4: Delivery, Trocas e Financeiro migrados de dados mockados para o
  // banco local — cada tela ganha sua própria tabela de domínio, seguindo o
  // mesmo padrão do restante do schema (ver migration `create_delivery_
  // trocas_financeiro_schema` em src-tauri/src/lib.rs).
  motoboys: {
    columns: ['nome', 'cpf', 'telefone', 'placa'],
    defaults: () => ({ nome: '', cpf: '', telefone: '', placa: '' }),
  },
  pedidos_delivery: {
    columns: [
      'codigo',
      'status',
      'cliente_id',
      'cliente_nome',
      'cliente_telefone',
      'endereco',
      'ponto_referencia',
      'taxa_entrega',
      'forma_pagamento',
      'troco_para',
      'motoboy_id',
      'motoboy_nome',
      'criado_em',
      'dados_extra',
    ],
    defaults: () => ({
      codigo: '',
      status: 'pendente',
      cliente_id: null,
      cliente_nome: '',
      cliente_telefone: '',
      endereco: '{}',
      ponto_referencia: '',
      taxa_entrega: 0,
      forma_pagamento: 'dinheiro',
      troco_para: null,
      motoboy_id: null,
      motoboy_nome: null,
      criado_em: new Date().toISOString(),
      dados_extra: '{}',
    }),
  },
  itens_pedido_delivery: {
    columns: ['pedido_id', 'produto_id', 'nome', 'preco_unitario', 'quantidade'],
    defaults: () => ({ pedido_id: null, produto_id: null, nome: '', preco_unitario: 0, quantidade: 0 }),
  },
  vales_credito: {
    columns: ['codigo', 'cliente_nome', 'valor', 'emitido_em', 'expira_em', 'usado_em', 'status'],
    defaults: () => ({
      codigo: '',
      cliente_nome: '',
      valor: 0,
      emitido_em: new Date().toISOString(),
      expira_em: null,
      usado_em: null,
      status: 'ativo',
    }),
  },
  sacolas_condicionais: {
    columns: [
      'cliente_id',
      'cliente_nome',
      'cliente_telefone',
      'cliente_cpf_cnpj',
      'emprestado_em',
      'prazo_em',
      'resolucao',
      'decisoes',
    ],
    defaults: () => ({
      cliente_id: null,
      cliente_nome: '',
      cliente_telefone: '',
      cliente_cpf_cnpj: '',
      emprestado_em: new Date().toISOString(),
      prazo_em: null,
      resolucao: null,
      decisoes: '{}',
    }),
  },
  itens_sacola: {
    columns: ['sacola_id', 'produto_id', 'nome', 'preco_unitario', 'quantidade'],
    defaults: () => ({ sacola_id: null, produto_id: null, nome: '', preco_unitario: 0, quantidade: 0 }),
  },
  trocas_log: {
    columns: ['tipo', 'cliente_nome', 'valor', 'itens', 'criado_em'],
    defaults: () => ({ tipo: '', cliente_nome: '', valor: 0, itens: '[]', criado_em: new Date().toISOString() }),
  },
  // Módulo de Autorização/Trava por PIN do Gerente (ver ModalAutorizacaoGerente
  // e ManagerAuthContext): registro de auditoria de toda autorização concedida
  // com o PIN do Gerente — estorno de venda/pedido, desconto acima de 10%,
  // sangria de caixa e ajuste manual de estoque.
  autorizacoes_gerente: {
    columns: ['tipo_acao', 'motivo', 'operador', 'detalhes', 'criado_em'],
    defaults: () => ({
      tipo_acao: '',
      motivo: '',
      operador: '',
      detalhes: '{}',
      criado_em: new Date().toISOString(),
    }),
  },
  // Log de eventos/erros persistido da tela de Logs & Diagnóstico (ver
  // src/utils/appLog.js e src/components/logs/LogsMain.jsx) — sobrevive a
  // F5/reinício do app, diferente do buffer em memória usado só para exibição
  // instantânea antes da primeira consulta ao banco.
  logs_sistema: {
    columns: ['nivel', 'mensagem', 'detalhe', 'criado_em'],
    defaults: () => ({
      nivel: 'info',
      mensagem: '',
      detalhe: null,
      criado_em: new Date().toISOString(),
    }),
  },
}

// `configuracoes` é chave/valor puro (chave TEXT PRIMARY KEY) — tratada à
// parte do restante, que segue o padrão `id INTEGER PRIMARY KEY AUTOINCREMENT`.
const CONFIG_TABLE = 'configuracoes'

// ---------------------------------------------------------------------------
// Seed inicial — 5 produtos de exemplo (vestuário/geral) e as configurações
// de primeiro acesso. Espelha a migration `seed_produtos_e_configuracoes_iniciais`
// de `src-tauri/src/lib.rs`, usada quando o app roda dentro do Tauri; aqui é
// o mesmo seed aplicado ao fallback de navegador.
// ---------------------------------------------------------------------------

export const SEED_PRODUCTS = [
  {
    codigo_barras: '7891500100301',
    nome: 'Camiseta Polo Piquet',
    categoria: 'Vestuário',
    preco_custo: 15.0,
    preco_venda: 35.0,
    estoque_atual: 29,
    estoque_minimo: 15,
    unidade_medida: 'UN',
    dados_extra: '{}',
  },
  {
    codigo_barras: '7891500200940',
    nome: 'Tênis Esportivo Runner',
    categoria: 'Calçados',
    preco_custo: 95.0,
    preco_venda: 189.9,
    estoque_atual: 32,
    estoque_minimo: 10,
    unidade_medida: 'PAR',
    dados_extra: '{}',
  },
  {
    codigo_barras: '7891500300100',
    nome: 'Calça Jeans Slim',
    categoria: 'Vestuário',
    preco_custo: 45.0,
    preco_venda: 89.9,
    estoque_atual: 20,
    estoque_minimo: 8,
    unidade_medida: 'UN',
    dados_extra: '{}',
  },
  {
    codigo_barras: '7891000100103',
    nome: 'Arroz Branco 5kg',
    categoria: 'Mercearia',
    preco_custo: 16.5,
    preco_venda: 24.9,
    estoque_atual: 42,
    estoque_minimo: 10,
    unidade_medida: 'UN',
    dados_extra: '{}',
  },
  {
    codigo_barras: '7891000900456',
    nome: 'Refrigerante 2L',
    categoria: 'Bebidas',
    preco_custo: 5.5,
    preco_venda: 9.5,
    estoque_atual: 36,
    estoque_minimo: 12,
    unidade_medida: 'UN',
    dados_extra: '{}',
  },
]

export const SEED_CONFIG = {
  primeiro_acesso: 'true',
  nome_empresa: '',
  logo_empresa: '',
  ip_mestre: '',
  pin_gerente: '1234',
}

// ---------------------------------------------------------------------------
// Fallback de navegador — cada tabela vira uma chave JSON estruturada no
// localStorage: `{ rows: [...], seq: <próximo id> }`. `configuracoes` é o
// único caso à parte, gravado como um mapa `{ chave: valor }`.
// ---------------------------------------------------------------------------

function storageKey(table) {
  return `${LS_PREFIX}${table}`
}

function readTable(table) {
  try {
    const raw = window.localStorage.getItem(storageKey(table))
    if (!raw) return { rows: [], seq: 1 }
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.rows)) return { rows: [], seq: 1 }
    return { rows: parsed.rows, seq: Number.isFinite(parsed.seq) ? parsed.seq : parsed.rows.length + 1 }
  } catch {
    return { rows: [], seq: 1 }
  }
}

function writeTable(table, state) {
  try {
    window.localStorage.setItem(storageKey(table), JSON.stringify(state))
  } catch (error) {
    console.error(`[db] Falha ao salvar a tabela "${table}" no localStorage:`, error)
  }
}

function readConfigMap() {
  try {
    const raw = window.localStorage.getItem(storageKey(CONFIG_TABLE))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeConfigMap(map) {
  try {
    window.localStorage.setItem(storageKey(CONFIG_TABLE), JSON.stringify(map))
  } catch (error) {
    console.error('[db] Falha ao salvar configurações no localStorage:', error)
  }
}

// "Migration runner" do fallback de navegador — ver nota no topo do arquivo
// sobre por que essa lista assume o papel que caberia ao Kysely. Cada passo
// roda uma única vez (controlado por `LS_SCHEMA_VERSION_KEY`), na ordem.
const BROWSER_MIGRATIONS = [
  {
    version: 1,
    description: 'seed_produtos_e_configuracoes_iniciais',
    run() {
      const produtos = readTable('produtos')
      if (produtos.rows.length === 0) {
        for (const seedProduct of SEED_PRODUCTS) {
          browserInsert('produtos', seedProduct)
        }
      }
      const config = readConfigMap()
      writeConfigMap({ ...SEED_CONFIG, ...config })
    },
  },
  // Corrige o dado de teste "Camiseta Polo Piquet", seedado (migration acima)
  // com preço de custo/venda incorretos (R$28,00 / R$59,90), o que distorcia
  // os indicadores de margem no Dashboard. Ajusta instalações já seedadas
  // sem duplicar o produto nem afetar customizações feitas pelo usuário em
  // outros campos.
  {
    version: 2,
    description: 'corrige_preco_camiseta_polo_piquet',
    run() {
      const produtos = readTable('produtos')
      const produto = produtos.rows.find((row) => row.codigo_barras === '7891500100301')
      if (produto) {
        browserUpdate('produtos', produto.id, { preco_custo: 15.0, preco_venda: 35.0 })
      }
    },
  },
  // Suporte a produtos pesáveis/fracionados (Sacolão, Açougue, Feira): cada
  // produto ganha `pesavel` (booleano) e `codigo_balanca` (código interno de
  // 4-5 dígitos usado pela leitura de etiqueta de balança no PDV). Mesma
  // ideia de um `ALTER TABLE ... ADD COLUMN ... DEFAULT` — backfilla as linhas
  // já existentes, para bater com o schema novo sem duplicar produtos.
  {
    version: 3,
    description: 'add_pesavel_codigo_balanca_produtos',
    run() {
      const produtos = readTable('produtos')
      let changed = false
      produtos.rows = produtos.rows.map((row) => {
        if (row.pesavel !== undefined && row.codigo_balanca !== undefined) return row
        changed = true
        return { ...row, pesavel: row.pesavel ?? 0, codigo_balanca: row.codigo_balanca ?? '' }
      })
      if (changed) writeTable('produtos', produtos)
    },
  },
]

let browserMigrationsRan = false

function runBrowserMigrations() {
  if (browserMigrationsRan) return
  browserMigrationsRan = true
  try {
    const raw = window.localStorage.getItem(LS_SCHEMA_VERSION_KEY)
    const appliedVersion = raw ? Number.parseInt(raw, 10) || 0 : 0
    let latestVersion = appliedVersion
    for (const migration of BROWSER_MIGRATIONS) {
      if (migration.version <= appliedVersion) continue
      migration.run()
      latestVersion = migration.version
    }
    if (latestVersion !== appliedVersion) {
      window.localStorage.setItem(LS_SCHEMA_VERSION_KEY, String(latestVersion))
    }
  } catch (error) {
    console.error('[db] Falha ao rodar migrations do fallback local:', error)
  }
}

function browserList(table, { where, orderBy } = {}) {
  runBrowserMigrations()
  let rows = readTable(table).rows
  if (where) {
    rows = rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value))
  }
  if (orderBy) {
    const [column, direction] = orderBy.split(' ')
    const factor = direction?.toLowerCase() === 'desc' ? -1 : 1
    rows = [...rows].sort((a, b) => (a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) * factor)
  }
  return rows
}

function browserGet(table, id) {
  runBrowserMigrations()
  return readTable(table).rows.find((row) => row.id === id) ?? null
}

function browserInsert(table, data) {
  const schema = TABLES[table]
  const state = readTable(table)
  const row = { ...schema.defaults(), ...data, id: state.seq }
  state.rows.push(row)
  state.seq += 1
  writeTable(table, state)
  return row
}

function browserUpdate(table, id, patch) {
  const state = readTable(table)
  const index = state.rows.findIndex((row) => row.id === id)
  if (index === -1) return null
  state.rows[index] = { ...state.rows[index], ...patch, id }
  writeTable(table, state)
  return state.rows[index]
}

function browserDelete(table, id) {
  const state = readTable(table)
  state.rows = state.rows.filter((row) => row.id !== id)
  writeTable(table, state)
}

// ---------------------------------------------------------------------------
// SQLite (Tauri) — SQL parametrizado construído a partir do whitelist de
// colunas em `TABLES`, nunca a partir de chaves arbitrárias vindas do
// chamador.
// ---------------------------------------------------------------------------

async function tauriGet(conn, table, id) {
  const rows = await conn.select(`SELECT * FROM ${table} WHERE id = $1`, [id])
  return rows[0] ?? null
}

async function tauriList(conn, table, { where, orderBy } = {}) {
  let sql = `SELECT * FROM ${table}`
  const params = []
  if (where) {
    const clauses = Object.entries(where).map(([column, value], index) => {
      params.push(value)
      return `${column} = $${index + 1}`
    })
    if (clauses.length > 0) sql += ` WHERE ${clauses.join(' AND ')}`
  }
  if (orderBy) sql += ` ORDER BY ${orderBy}`
  return conn.select(sql, params)
}

async function tauriInsert(conn, table, data) {
  const schema = TABLES[table]
  const defaults = schema.defaults()
  const columns = schema.columns
  const values = columns.map((column) => (data[column] !== undefined ? data[column] : (defaults[column] ?? null)))
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
  const result = await conn.execute(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    values,
  )
  return tauriGet(conn, table, result.lastInsertId)
}

async function tauriUpdate(conn, table, id, patch) {
  const schema = TABLES[table]
  const columns = schema.columns.filter((column) => patch[column] !== undefined)
  if (columns.length === 0) return tauriGet(conn, table, id)
  const setClause = columns.map((column, index) => `${column} = $${index + 1}`).join(', ')
  const values = columns.map((column) => patch[column])
  values.push(id)
  await conn.execute(`UPDATE ${table} SET ${setClause} WHERE id = $${columns.length + 1}`, values)
  return tauriGet(conn, table, id)
}

async function tauriDelete(conn, table, id) {
  await conn.execute(`DELETE FROM ${table} WHERE id = $1`, [id])
}

// ---------------------------------------------------------------------------
// API genérica pública — despacha para SQLite (Tauri) ou para o fallback de
// JSON (navegador), com a mesma assinatura async nos dois casos.
// ---------------------------------------------------------------------------

export async function listRows(table, options) {
  const conn = await getConnection()
  if (conn) return tauriList(conn, table, options)
  return browserList(table, options)
}

export async function getRowById(table, id) {
  const conn = await getConnection()
  if (conn) return tauriGet(conn, table, id)
  return browserGet(table, id)
}

export async function insertRow(table, data) {
  const conn = await getConnection()
  if (conn) return tauriInsert(conn, table, data)
  return browserInsert(table, data)
}

export async function updateRow(table, id, patch) {
  const conn = await getConnection()
  if (conn) return tauriUpdate(conn, table, id, patch)
  return browserUpdate(table, id, patch)
}

export async function deleteRow(table, id) {
  const conn = await getConnection()
  if (conn) return tauriDelete(conn, table, id)
  return browserDelete(table, id)
}

// ---------------------------------------------------------------------------
// `configuracoes` — chave/valor simples (valor sempre string; quem consome
// decide como interpretar: `'true'`/`'false'`, JSON, texto livre etc.).
// ---------------------------------------------------------------------------

export async function getConfig(chave, fallback = null) {
  const conn = await getConnection()
  if (conn) {
    const rows = await conn.select(`SELECT valor FROM ${CONFIG_TABLE} WHERE chave = $1`, [chave])
    return rows[0]?.valor ?? fallback
  }
  runBrowserMigrations()
  const map = readConfigMap()
  return chave in map ? map[chave] : fallback
}

export async function setConfig(chave, valor) {
  const conn = await getConnection()
  if (conn) {
    await conn.execute(
      `INSERT INTO ${CONFIG_TABLE} (chave, valor) VALUES ($1, $2)
       ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
      [chave, valor],
    )
    return
  }
  runBrowserMigrations()
  const map = readConfigMap()
  map[chave] = valor
  writeConfigMap(map)
}

export async function getAllConfig() {
  const conn = await getConnection()
  if (conn) {
    const rows = await conn.select(`SELECT chave, valor FROM ${CONFIG_TABLE}`)
    return Object.fromEntries(rows.map((row) => [row.chave, row.valor]))
  }
  runBrowserMigrations()
  return readConfigMap()
}

export async function setManyConfig(entries) {
  await Promise.all(Object.entries(entries).map(([chave, valor]) => setConfig(chave, valor)))
}

// ---------------------------------------------------------------------------
// Repositórios de domínio — cada um expõe as operações que as telas
// realmente precisam, já cuidando de detalhes específicos da tabela (JSON
// embutido em `dados_extra`/`endereco`/`historico`, itens filhos de
// venda/orçamento, baixa de estoque etc.).
// ---------------------------------------------------------------------------

// Elimina dízimas de ponto flutuante (ex.: 0.1 + 0.2) no subtotal gravado de
// cada item de venda — importante sobretudo para produtos pesáveis, cuja
// quantidade é uma fração (0.350, 1.275) multiplicada pelo preço.
function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function parseJsonField(value, fallback) {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export const produtosRepo = {
  async list() {
    const rows = await listRows('produtos', { orderBy: 'nome' })
    return rows.map(rowToProduct)
  },
  async create(product) {
    const row = await insertRow('produtos', productToRow(product))
    return rowToProduct(row)
  },
  async update(id, product) {
    const row = await updateRow('produtos', id, productToRow(product))
    return row ? rowToProduct(row) : null
  },
  async remove(id) {
    await deleteRow('produtos', id)
  },
  /** Ajusta o estoque de um produto por delta (negativo em vendas, positivo em estornos/entradas/trocas). Retorna o produto já no formato de app (camelCase). */
  async adjustStock(id, deltaQuantidade) {
    const row = await getRowById('produtos', id)
    if (!row) return null
    const novoEstoque = Number(row.estoque_atual ?? 0) + deltaQuantidade
    const updated = await updateRow('produtos', id, { estoque_atual: novoEstoque })
    return updated ? rowToProduct(updated) : null
  },
  /**
   * Ajusta o estoque de uma variação (tamanho/cor) específica de um produto
   * com grade — debita/devolve `deltaQuantidade` na variação identificada por
   * `variationKey` (o par tamanho/cor, no formato `"<size>__<color>"" — ver
   * `variationStockKey` no PDVMain; não é o código de barras da variação,
   * que é opcional em EstoqueMain e costuma ficar em branco) dentro de
   * `dados_extra.variations`, e recalcula `estoque_atual` do produto-pai
   * como a soma exata de todas as variações (nunca um valor solto/
   * dessincronizado). Se a variação não for encontrada (produto sem grade,
   * ou par tamanho/cor não bate), cai para o ajuste simples do estoque
   * agregado do produto.
   */
  async adjustVariationStock(id, variationKey, deltaQuantidade) {
    const row = await getRowById('produtos', id)
    if (!row) return null
    const extra = parseJsonField(row.dados_extra, {})
    const variations = Array.isArray(extra.variations) ? extra.variations : []
    const index = variations.findIndex(
      (variation) => `${variation.size ?? ''}__${variation.color ?? ''}` === variationKey,
    )
    if (index === -1) {
      return this.adjustStock(id, deltaQuantidade)
    }

    const updatedVariations = variations.map((variation, i) =>
      i === index
        ? { ...variation, stock: (Number.parseInt(variation.stock, 10) || 0) + deltaQuantidade }
        : variation,
    )
    const novoEstoque = updatedVariations.reduce(
      (sum, variation) => sum + (Number.parseInt(variation.stock, 10) || 0),
      0,
    )
    const updated = await updateRow('produtos', id, {
      estoque_atual: novoEstoque,
      dados_extra: JSON.stringify({ ...extra, variations: updatedVariations }),
    })
    return updated ? rowToProduct(updated) : null
  },
}

function rowToProduct(row) {
  const extra = parseJsonField(row.dados_extra, {})
  return {
    id: row.id,
    code: row.codigo_barras ?? '',
    name: row.nome ?? '',
    category: row.categoria ?? '',
    costPrice: Number(row.preco_custo ?? 0),
    price: Number(row.preco_venda ?? 0),
    stock: Number(row.estoque_atual ?? 0),
    minStock: Number(row.estoque_minimo ?? 0),
    unit: row.unidade_medida ?? 'UN',
    weighable: Number(row.pesavel ?? 0) === 1 || row.pesavel === true,
    scaleCode: row.codigo_balanca ?? '',
    hasVariations: false,
    sizes: [],
    colors: [],
    variations: [],
    niche: '',
    nicheData: {},
    ...extra,
  }
}

function productToRow(product) {
  const { id: _id, code, name, category, costPrice, price, stock, minStock, unit, weighable, scaleCode, ...extra } =
    product
  return {
    codigo_barras: code ?? '',
    nome: name ?? '',
    categoria: category ?? '',
    preco_custo: Number(costPrice ?? 0),
    preco_venda: Number(price ?? 0),
    estoque_atual: Number(stock ?? 0),
    estoque_minimo: Number(minStock ?? 0),
    unidade_medida: unit ?? 'UN',
    pesavel: weighable ? 1 : 0,
    codigo_balanca: scaleCode ?? '',
    dados_extra: JSON.stringify(extra ?? {}),
  }
}

export const clientesRepo = {
  async list() {
    const rows = await listRows('clientes', { orderBy: 'nome' })
    return rows.map(rowToClient)
  },
  async create(client) {
    const row = await insertRow('clientes', clientToRow(client))
    return rowToClient(row)
  },
  async update(id, client) {
    const row = await updateRow('clientes', id, clientToRow(client))
    return row ? rowToClient(row) : null
  },
  async remove(id) {
    await deleteRow('clientes', id)
  },
  /** Lança uma compra fiado ou um pagamento, ajustando `saldo_devedor` e o histórico. */
  async registerMovement(id, { type, amount, description, date }) {
    const row = await getRowById('clientes', id)
    if (!row) return null
    const historico = parseJsonField(row.historico, [])
    const delta = type === 'pagamento' ? -amount : amount
    const novoSaldo = Math.max(0, Number(row.saldo_devedor ?? 0) + delta)
    const entry = {
      id: historico.length ? Math.max(...historico.map((item) => item.id)) + 1 : 1,
      date: date ?? new Date().toISOString().slice(0, 10),
      type,
      amount,
      description,
    }
    const updated = await updateRow('clientes', id, {
      saldo_devedor: novoSaldo,
      historico: JSON.stringify([...historico, entry]),
    })
    return rowToClient(updated)
  },
}

function rowToClient(row) {
  return {
    id: row.id,
    name: row.nome ?? '',
    phone: row.telefone ?? '',
    cpfCnpj: row.cpf_cnpj ?? '',
    creditLimit: Number(row.limite_credito ?? 0),
    balance: Number(row.saldo_devedor ?? 0),
    address: parseJsonField(row.endereco, {}),
    history: parseJsonField(row.historico, []),
  }
}

function clientToRow(client) {
  return {
    nome: client.name ?? '',
    telefone: client.phone ?? '',
    cpf_cnpj: client.cpfCnpj ?? '',
    limite_credito: Number(client.creditLimit ?? 0),
    saldo_devedor: Number(client.balance ?? 0),
    endereco: JSON.stringify(client.address ?? {}),
    historico: JSON.stringify(client.history ?? []),
  }
}

function rowToVenda(row) {
  const extra = parseJsonField(row.dados_extra, {})
  return {
    id: row.id,
    clienteId: row.cliente_id ?? null,
    operador: row.operador ?? '',
    totalBruto: Number(row.total_bruto ?? 0),
    desconto: Number(row.desconto ?? 0),
    totalLiquido: Number(row.total_liquido ?? 0),
    formaPagamento: row.forma_pagamento ?? '',
    status: row.status ?? 'concluida',
    dataVenda: row.data_venda,
    troco: extra.troco ?? null,
    amountReceived: extra.amountReceived ?? null,
    splitPayments: extra.splitPayments ?? null,
    estornoMotivo: extra.estornoMotivo ?? '',
    // Presente só nas vendas "sintéticas" criadas pela quitação de um pedido
    // de Delivery (ver `registerSettlement`) — usado pela tela de Histórico
    // de Vendas para não listar essa venda duas vezes (ela já aparece como o
    // próprio pedido de Delivery, agora marcado como pago).
    origemPedidoDeliveryId: extra.origemPedidoDeliveryId ?? null,
  }
}

export const vendasRepo = {
  async list() {
    const rows = await listRows('vendas', { orderBy: 'data_venda desc' })
    return rows.map(rowToVenda)
  },
  async itemsBySale(vendaId) {
    return listRows('itens_venda', { where: { venda_id: vendaId } })
  },
  /**
   * Todas as vendas com seus itens já resolvidos — usado pelo Financeiro
   * (dashboard, histórico, fechamento de caixa). Como `itens_venda` só
   * guarda `produto_id` (a Etapa 3 não previu snapshot de nome ali), o nome
   * de cada item é resolvido via `getProductName`, o mesmo mecanismo já
   * usado por `src/lib/database.js` para as comandas.
   */
  async listWithItems(getProductName) {
    const [vendaRows, itemRows] = await Promise.all([
      listRows('vendas', { orderBy: 'data_venda desc' }),
      listRows('itens_venda'),
    ])
    const itemsByVenda = new Map()
    for (const row of itemRows) {
      const list = itemsByVenda.get(row.venda_id) ?? []
      list.push({
        produtoId: row.produto_id,
        nome: getProductName?.(row.produto_id) ?? `Produto #${row.produto_id}`,
        precoUnitario: Number(row.preco_unitario),
        quantidade: Number(row.quantidade),
        subtotal: Number(row.subtotal),
        variationCode: row.variacao_codigo ?? null,
      })
      itemsByVenda.set(row.venda_id, list)
    }
    return vendaRows.map((row) => ({ ...rowToVenda(row), itens: itemsByVenda.get(row.id) ?? [] }))
  },
  /**
   * Registra uma venda completa (cabeçalho + itens), dá baixa no estoque de
   * cada produto vendido e, se for crediário vinculado a um cliente, lança o
   * débito no saldo do cliente. Retorna a venda criada com seus itens, mais
   * `produtosAtualizados`/`clienteAtualizado` (já no formato de app usado por
   * ProductsContext/ClientsContext) para quem chamou aplicar no estado local
   * via `applyExternalUpdate`, sem precisar recalcular o estoque/saldo na UI
   * nem disparar uma segunda escrita no banco.
   */
  async registerSale({
    clienteId,
    operador,
    itens,
    totalBruto,
    desconto,
    totalLiquido,
    formaPagamento,
    status,
    troco,
    amountReceived,
    splitPayments,
  }) {
    const venda = await insertRow('vendas', {
      cliente_id: clienteId ?? null,
      operador: operador ?? '',
      total_bruto: totalBruto,
      desconto: desconto ?? 0,
      total_liquido: totalLiquido,
      forma_pagamento: formaPagamento ?? '',
      status: status ?? 'concluida',
      data_venda: new Date().toISOString(),
      dados_extra: JSON.stringify({ troco: troco ?? null, amountReceived: amountReceived ?? null, splitPayments: splitPayments ?? null }),
    })

    const itensCriados = []
    const produtosAtualizados = []
    for (const item of itens) {
      const itemRow = await insertRow('itens_venda', {
        venda_id: venda.id,
        produto_id: item.produtoId ?? null,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        subtotal: roundCurrency(item.quantidade * item.precoUnitario),
        variacao_codigo: item.variationCode ?? null,
      })
      itensCriados.push(itemRow)
      if (item.produtoId != null) {
        const produto = item.variationCode
          ? await produtosRepo.adjustVariationStock(item.produtoId, item.variationCode, -item.quantidade)
          : await produtosRepo.adjustStock(item.produtoId, -item.quantidade)
        if (produto) produtosAtualizados.push(produto)
      }
    }

    let clienteAtualizado = null
    if (clienteId != null && formaPagamento === 'crediario') {
      clienteAtualizado = await clientesRepo.registerMovement(clienteId, {
        type: 'compra',
        amount: totalLiquido,
        description: `Venda #${venda.id} - Frente de Caixa`,
      })
    }

    return { ...rowToVenda(venda), itens: itensCriados, produtosAtualizados, clienteAtualizado }
  },
  /**
   * Estorna uma venda: devolve a quantidade de cada item ao estoque e, se
   * era um crediário, reverte o débito lançado no saldo do cliente. Não
   * apaga a venda — marca `status = 'estornada'`, mantendo o registro (e o
   * motivo informado pelo operador) para auditoria no Financeiro/Histórico.
   */
  async voidSale(id, reason) {
    const vendaRow = await getRowById('vendas', id)
    if (!vendaRow) return null

    const itens = await listRows('itens_venda', { where: { venda_id: id } })
    const produtosAtualizados = []
    for (const item of itens) {
      if (item.produto_id != null) {
        const produto = item.variacao_codigo
          ? await produtosRepo.adjustVariationStock(item.produto_id, item.variacao_codigo, Number(item.quantidade))
          : await produtosRepo.adjustStock(item.produto_id, Number(item.quantidade))
        if (produto) produtosAtualizados.push(produto)
      }
    }

    let clienteAtualizado = null
    if (vendaRow.cliente_id != null && vendaRow.forma_pagamento === 'crediario') {
      clienteAtualizado = await clientesRepo.registerMovement(vendaRow.cliente_id, {
        type: 'pagamento',
        amount: Number(vendaRow.total_liquido),
        description: `Estorno da Venda #${id}`,
      })
    }

    const extra = parseJsonField(vendaRow.dados_extra, {})
    const updated = await updateRow('vendas', id, {
      status: 'estornada',
      dados_extra: JSON.stringify({ ...extra, estornoMotivo: reason ?? '' }),
    })
    return { venda: rowToVenda(updated), produtosAtualizados, clienteAtualizado }
  },
  /**
   * Registra uma venda "de quitação": usada pelo Histórico de Vendas para
   * lançar no financeiro/caixa o pagamento recebido depois de um pedido de
   * Delivery ter saído como "Receber na Entrega". Diferente de
   * `registerSale`, só dá baixa no estoque quando `deductStock` é `true` —
   * o pedido de Delivery original pode já ter baixado o estoque na criação
   * (ver `stockDeducted` em `deliveryOrderToRow`), e dar baixa de novo aqui
   * duplicaria o desconto.
   */
  async registerSettlement({
    clienteId,
    operador,
    itens,
    totalBruto,
    desconto,
    totalLiquido,
    formaPagamento,
    deductStock,
    origemPedidoDeliveryId,
  }) {
    const venda = await insertRow('vendas', {
      cliente_id: clienteId ?? null,
      operador: operador ?? '',
      total_bruto: totalBruto,
      desconto: desconto ?? 0,
      total_liquido: totalLiquido,
      forma_pagamento: formaPagamento ?? '',
      status: 'concluida',
      data_venda: new Date().toISOString(),
      dados_extra: JSON.stringify({
        troco: null,
        amountReceived: null,
        splitPayments: null,
        origemPedidoDeliveryId: origemPedidoDeliveryId ?? null,
      }),
    })

    const itensCriados = []
    const produtosAtualizados = []
    for (const item of itens) {
      const itemRow = await insertRow('itens_venda', {
        venda_id: venda.id,
        produto_id: item.produtoId ?? null,
        quantidade: item.quantidade,
        preco_unitario: item.precoUnitario,
        subtotal: roundCurrency(item.quantidade * item.precoUnitario),
      })
      itensCriados.push(itemRow)
      if (deductStock && item.produtoId != null) {
        const produto = await produtosRepo.adjustStock(item.produtoId, -item.quantidade)
        if (produto) produtosAtualizados.push(produto)
      }
    }

    return { ...rowToVenda(venda), itens: itensCriados, produtosAtualizados }
  },
  /**
   * Quitação de uma venda Crediário: troca a forma de pagamento pela
   * realmente recebida e baixa o valor do saldo devedor do cliente — a
   * venda deixa de contar como "Crediário pendente" e passa a somar no
   * bucket de pagamento correto no Financeiro/Fechamento de Caixa.
   */
  async settlePayment(id, paymentMethod) {
    const vendaRow = await getRowById('vendas', id)
    if (!vendaRow) return null
    if (vendaRow.forma_pagamento !== 'crediario') {
      return { venda: rowToVenda(vendaRow), clienteAtualizado: null }
    }

    const updated = await updateRow('vendas', id, { forma_pagamento: paymentMethod })
    const clienteAtualizado =
      vendaRow.cliente_id != null
        ? await clientesRepo.registerMovement(vendaRow.cliente_id, {
            type: 'pagamento',
            amount: Number(vendaRow.total_liquido),
            description: `Quitação da Venda #${id}`,
          })
        : null

    return { venda: rowToVenda(updated), clienteAtualizado }
  },
  /** Localiza uma venda real pelo código impresso no cupom (ex.: "#123" ou "123"). */
  async findByCode(term) {
    const digits = String(term ?? '').replace(/\D/g, '')
    if (!digits) return null
    const id = Number.parseInt(digits, 10)
    if (!Number.isFinite(id)) return null
    const row = await getRowById('vendas', id)
    if (!row) return null
    const itemRows = await listRows('itens_venda', { where: { venda_id: id } })
    return {
      venda: rowToVenda(row),
      items: itemRows.map((r) => ({
        produtoId: r.produto_id,
        quantidade: Number(r.quantidade),
        precoUnitario: Number(r.preco_unitario),
        variationCode: r.variacao_codigo ?? null,
      })),
    }
  },
}

export const orcamentosRepo = {
  async list() {
    const rows = await listRows('orcamentos', { orderBy: 'data_orcamento desc' })
    const allItens = await listRows('itens_orcamento')
    const itensByOrcamento = new Map()
    for (const item of allItens) {
      const list = itensByOrcamento.get(item.orcamento_id) ?? []
      list.push(item)
      itensByOrcamento.set(item.orcamento_id, list)
    }
    return rows.map((row) => rowToOrcamento(row, itensByOrcamento.get(row.id) ?? []))
  },
  /** `orcamento` no formato de UI de OrcamentosMain (ver `rowToOrcamento`). Retorna o orçamento criado, já com `id`/`code` definitivos. */
  async create(orcamento) {
    const { row, itemNames } = orcamentoToRow(orcamento)
    const created = await insertRow('orcamentos', { ...row, dados_extra: JSON.stringify({ ...JSON.parse(row.dados_extra), itemNames }) })
    const itensCriados = await insertOrcamentoItems(created.id, orcamento.items)
    return rowToOrcamento(created, itensCriados)
  },
  async update(id, orcamento) {
    const { row, itemNames } = orcamentoToRow(orcamento)
    const updated = await updateRow('orcamentos', id, {
      ...row,
      dados_extra: JSON.stringify({ ...JSON.parse(row.dados_extra), itemNames }),
    })
    const existingItens = await listRows('itens_orcamento', { where: { orcamento_id: id } })
    await Promise.all(existingItens.map((item) => deleteRow('itens_orcamento', item.id)))
    const itensCriados = await insertOrcamentoItems(id, orcamento.items)
    return rowToOrcamento(updated, itensCriados)
  },
  async markConverted(id) {
    return updateRow('orcamentos', id, { status: 'convertido' })
  },
  async remove(id) {
    const itens = await listRows('itens_orcamento', { where: { orcamento_id: id } })
    await Promise.all(itens.map((item) => deleteRow('itens_orcamento', item.id)))
    await deleteRow('orcamentos', id)
  },
}

async function insertOrcamentoItems(orcamentoId, items) {
  const created = []
  for (const item of items) {
    created.push(
      await insertRow('itens_orcamento', {
        orcamento_id: orcamentoId,
        produto_id: item.id ?? null,
        quantidade: item.qty,
        preco_unitario: item.price,
        subtotal: item.qty * item.price,
      }),
    )
  }
  return created
}

function orcamentoSubtotalValue(items) {
  return items.reduce((sum, item) => sum + item.price * item.qty, 0)
}

function computeCashDiscountAmount(subtotal, type, rawValue) {
  const raw = Number.parseFloat((rawValue ?? '').toString().replace(',', '.'))
  const amount = type === 'percent' ? subtotal * ((Number.isFinite(raw) ? raw : 0) / 100) : Number.isFinite(raw) ? raw : 0
  return Math.min(subtotal, Math.max(0, amount))
}

// Converte o objeto no formato usado pela tela de Orçamentos (clientName,
// clientPhone, items com nome/preço já resolvidos, cashDiscountType/Value
// etc.) para as colunas estruturadas de `orcamentos` + o que sobra num JSON
// em `dados_extra` — mesmo tipo de divisão feita em produtos/clientes: só o
// que o schema da Etapa 3 pediu vira coluna própria, o resto (específico da
// UI) fica no blob. `itemNames` é preenchido por quem chama, com um
// snapshot de `{ [produtoId]: nome }` no momento da gravação, para que um
// orçamento antigo continue mostrando o nome do produto como era na época,
// mesmo que o cadastro mude depois.
function orcamentoToRow(orcamento) {
  const subtotal = orcamentoSubtotalValue(orcamento.items)
  const descontoAVista = computeCashDiscountAmount(subtotal, orcamento.cashDiscountType, orcamento.cashDiscountValue)
  return {
    row: {
      cliente_id: orcamento.clienteId ?? null,
      operador: orcamento.operador ?? '',
      total_bruto: subtotal,
      desconto: 0,
      total_liquido: subtotal,
      parcelas: Number.parseInt(orcamento.installments, 10) || 1,
      desconto_a_vista: descontoAVista,
      status: orcamento.converted ? 'convertido' : 'aberto',
      data_orcamento: orcamento.createdAt ?? new Date().toISOString(),
      validade: orcamento.validUntil ?? null,
      dados_extra: JSON.stringify({
        code: orcamento.code,
        clientName: orcamento.clientName ?? '',
        clientPhone: orcamento.clientPhone ?? '',
        cashDiscountType: orcamento.cashDiscountType ?? 'percent',
        cashDiscountValue: orcamento.cashDiscountValue ?? '',
        notes: orcamento.notes ?? '',
      }),
    },
    itemNames: Object.fromEntries(orcamento.items.map((item) => [item.id, item.name])),
  }
}

function rowToOrcamento(row, itens) {
  const extra = parseJsonField(row.dados_extra, {})
  return {
    id: row.id,
    code: extra.code ?? `#${String(row.id).padStart(4, '0')}`,
    clienteId: row.cliente_id ?? null,
    clientName: extra.clientName ?? '',
    clientPhone: extra.clientPhone ?? '',
    operador: row.operador ?? '',
    createdAt: row.data_orcamento,
    validUntil: row.validade,
    installments: String(row.parcelas ?? 1),
    cashDiscountType: extra.cashDiscountType ?? 'percent',
    cashDiscountValue: extra.cashDiscountValue ?? '',
    notes: extra.notes ?? '',
    converted: row.status === 'convertido',
    items: itens.map((item) => ({
      id: item.produto_id,
      name: extra.itemNames?.[item.produto_id] ?? `Produto #${item.produto_id}`,
      price: Number(item.preco_unitario),
      qty: Number(item.quantidade),
    })),
  }
}

export const licencaLocalRepo = {
  async get() {
    const rows = await listRows('licenca_local')
    return rows[0] ?? null
  },
  /** `true` quando existe uma linha em `licenca_local` com `status = 'ATIVADO'` — ver TelaAtivacaoLicenca.jsx/App.jsx. */
  async isActive() {
    const row = await this.get()
    return row?.status === 'ATIVADO'
  },
  async activate({ chaveRsa, hwidMaquina }) {
    const existing = await this.get()
    const data = {
      chave_rsa: chaveRsa,
      hwid_maquina: hwidMaquina,
      data_ativacao: new Date().toISOString(),
      status: 'ATIVADO',
    }
    if (existing) return updateRow('licenca_local', existing.id, data)
    return insertRow('licenca_local', data)
  },
}

// ---------------------------------------------------------------------------
// Delivery, Trocas e Financeiro — migrados de dados mockados (MOCK_CLIENTS/
// MOCK_SALES fixos, histórico de vendas gerado por PRNG) para o banco local.
// ---------------------------------------------------------------------------

function rowToMotoboy(row) {
  return { id: row.id, name: row.nome ?? '', cpf: row.cpf ?? '', phone: row.telefone ?? '', plate: row.placa ?? '' }
}

function motoboyToRow(motoboy) {
  return {
    nome: motoboy.name ?? '',
    cpf: motoboy.cpf ?? '',
    telefone: motoboy.phone ?? '',
    placa: motoboy.plate ?? '',
  }
}

export const motoboysRepo = {
  async list() {
    const rows = await listRows('motoboys', { orderBy: 'nome' })
    return rows.map(rowToMotoboy)
  },
  async create(motoboy) {
    const row = await insertRow('motoboys', motoboyToRow(motoboy))
    return rowToMotoboy(row)
  },
  async update(id, motoboy) {
    const row = await updateRow('motoboys', id, motoboyToRow(motoboy))
    return row ? rowToMotoboy(row) : null
  },
  async remove(id) {
    await deleteRow('motoboys', id)
  },
}

// `items` opcional: quando omitido (updateStatus/assignMotoboy), o objeto
// retornado não inclui a chave `items` — quem chama faz um merge raso sobre
// o pedido já carregado em memória, preservando os itens sem recarregá-los.
function rowToDeliveryOrder(row, items) {
  const extra = parseJsonField(row.dados_extra, {})
  const base = {
    id: row.id,
    code: row.codigo || `#D-${row.id}`,
    status: row.status ?? 'pendente',
    clientId: row.cliente_id ?? null,
    clientName: row.cliente_nome ?? '',
    clientPhone: row.cliente_telefone ?? '',
    address: parseJsonField(row.endereco, {}),
    referencePoint: row.ponto_referencia ?? '',
    deliveryFee: Number(row.taxa_entrega ?? 0),
    paymentMethod: row.forma_pagamento ?? 'dinheiro',
    changeFor: row.troco_para != null ? Number(row.troco_para) : null,
    motoboyId: row.motoboy_id ?? null,
    motoboyName: row.motoboy_nome ?? null,
    createdAt: new Date(row.criado_em),
    notes: extra.notes ?? '',
    expectedDeliveryDate: extra.expectedDeliveryDate ?? null,
    origin: extra.origin ?? null,
    // 'pago': liquidado no caixa no fechamento da venda (Opção A do F2) ou
    // quitado depois no Histórico de Vendas.
    // 'pendente': motoboy cobra na entrega (Opção B) — também o default para
    // pedidos antigos, criados antes deste campo existir, que sempre foram
    // "a cobrar na entrega".
    paymentStatus: extra.paymentStatus ?? 'pendente',
    // Se o estoque já foi baixado para este pedido — pedidos enviados pelo
    // PDV (F2) sempre baixam estoque na criação; pedidos cadastrados direto
    // aqui no Delivery não (`origin` fica vazio nesse caso), então o
    // Histórico de Vendas só dá baixa/estorna estoque quando corresponde.
    stockDeducted: extra.stockDeducted ?? extra.origin === 'pdv',
    // Id da venda "sintética" (ver `vendasRepo.registerSettlement`) criada
    // quando este pedido foi pago no caixa/quitado — usado para estornar o
    // lançamento financeiro correspondente ao cancelar o pedido.
    vendaId: extra.vendaId ?? null,
    cancelReason: extra.cancelReason ?? '',
  }
  if (items != null) base.items = items
  return base
}

function deliveryOrderToRow(order) {
  return {
    codigo: order.code ?? '',
    status: order.status ?? 'pendente',
    cliente_id: order.clientId ?? null,
    cliente_nome: order.clientName ?? '',
    cliente_telefone: order.clientPhone ?? '',
    endereco: JSON.stringify(order.address ?? {}),
    ponto_referencia: order.referencePoint ?? '',
    taxa_entrega: Number(order.deliveryFee ?? 0),
    forma_pagamento: order.paymentMethod ?? 'dinheiro',
    troco_para: order.changeFor ?? null,
    motoboy_id: order.motoboyId ?? null,
    motoboy_nome: order.motoboyName ?? null,
    criado_em: new Date().toISOString(),
    dados_extra: JSON.stringify({
      notes: order.notes ?? '',
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
      origin: order.origin ?? null,
      paymentStatus: order.paymentStatus ?? 'pendente',
      stockDeducted: order.stockDeducted ?? false,
      vendaId: order.vendaId ?? null,
    }),
  }
}

export const deliveryRepo = {
  async list() {
    const [orderRows, itemRows] = await Promise.all([
      listRows('pedidos_delivery', { orderBy: 'criado_em desc' }),
      listRows('itens_pedido_delivery'),
    ])
    const itemsByOrder = new Map()
    for (const item of itemRows) {
      const list = itemsByOrder.get(item.pedido_id) ?? []
      list.push({
        id: item.produto_id,
        name: item.nome ?? '',
        price: Number(item.preco_unitario),
        qty: Number(item.quantidade),
      })
      itemsByOrder.set(item.pedido_id, list)
    }
    return orderRows.map((row) => rowToDeliveryOrder(row, itemsByOrder.get(row.id) ?? []))
  },
  async create(order) {
    const created = await insertRow('pedidos_delivery', deliveryOrderToRow(order))
    for (const item of order.items) {
      await insertRow('itens_pedido_delivery', {
        pedido_id: created.id,
        produto_id: item.id ?? null,
        nome: item.name,
        preco_unitario: item.price,
        quantidade: item.qty,
      })
    }
    return rowToDeliveryOrder(created, order.items)
  },
  async updateStatus(id, status) {
    const row = await updateRow('pedidos_delivery', id, { status })
    return row ? rowToDeliveryOrder(row) : null
  },
  async assignMotoboy(id, motoboyId, motoboyName) {
    const row = await updateRow('pedidos_delivery', id, {
      motoboy_id: motoboyId ?? null,
      motoboy_nome: motoboyName ?? null,
    })
    return row ? rowToDeliveryOrder(row) : null
  },
  /**
   * Quitação de um pedido "Receber na Entrega": grava a forma de pagamento
   * realmente recebida e marca `paymentStatus: 'pago'`. `vendaId` (retornado
   * por `vendasRepo.registerSettlement`) fica salvo no pedido para que um
   * cancelamento posterior consiga estornar o lançamento financeiro
   * correspondente.
   */
  async settlePayment(id, { paymentMethod, vendaId }) {
    const row = await getRowById('pedidos_delivery', id)
    if (!row) return null
    const extra = parseJsonField(row.dados_extra, {})
    const updated = await updateRow('pedidos_delivery', id, {
      forma_pagamento: paymentMethod,
      dados_extra: JSON.stringify({
        ...extra,
        paymentStatus: 'pago',
        vendaId: vendaId ?? extra.vendaId ?? null,
        stockDeducted: true,
      }),
    })
    return updated ? rowToDeliveryOrder(updated) : null
  },
  /** Anexa o id da venda "sintética" já criada para um pedido — usado quando o pedido nasce já pago (Opção A do F2), sem passar pela quitação manual. */
  async linkVenda(id, vendaId) {
    const row = await getRowById('pedidos_delivery', id)
    if (!row) return null
    const extra = parseJsonField(row.dados_extra, {})
    const updated = await updateRow('pedidos_delivery', id, {
      dados_extra: JSON.stringify({ ...extra, vendaId, stockDeducted: true }),
    })
    return updated ? rowToDeliveryOrder(updated) : null
  },
  /** Cancela/estorna um pedido de Delivery, registrando o motivo informado pelo operador. A devolução de estoque/estorno financeiro é responsabilidade de quem chama (ver Histórico de Vendas), já que depende de `stockDeducted`/`vendaId`. */
  async cancel(id, reason) {
    const row = await getRowById('pedidos_delivery', id)
    if (!row) return null
    const extra = parseJsonField(row.dados_extra, {})
    const updated = await updateRow('pedidos_delivery', id, {
      status: 'cancelado',
      dados_extra: JSON.stringify({ ...extra, cancelReason: reason ?? '', canceledAt: new Date().toISOString() }),
    })
    return updated ? rowToDeliveryOrder(updated) : null
  },
}

function rowToVoucher(row) {
  return {
    id: row.id,
    code: row.codigo,
    customerName: row.cliente_nome ?? '',
    value: Number(row.valor ?? 0),
    issuedAt: row.emitido_em,
    expiresAt: row.expira_em,
    usedAt: row.usado_em,
    status: row.status ?? 'ativo',
  }
}

export const vouchersRepo = {
  async list() {
    const rows = await listRows('vales_credito', { orderBy: 'emitido_em desc' })
    return rows.map(rowToVoucher)
  },
  async create(voucher) {
    const row = await insertRow('vales_credito', {
      codigo: voucher.code,
      cliente_nome: voucher.customerName ?? '',
      valor: Number(voucher.value ?? 0),
      emitido_em: voucher.issuedAt,
      expira_em: voucher.expiresAt,
      usado_em: voucher.usedAt ?? null,
      status: voucher.status ?? 'ativo',
    })
    return rowToVoucher(row)
  },
  async markUsed(id) {
    const row = await updateRow('vales_credito', id, { status: 'utilizado', usado_em: new Date().toISOString().slice(0, 10) })
    return row ? rowToVoucher(row) : null
  },
}

function rowToBag(row, items) {
  const base = {
    id: row.id,
    client: {
      id: row.cliente_id,
      name: row.cliente_nome ?? '',
      phone: row.cliente_telefone ?? '',
      cpfCnpj: row.cliente_cpf_cnpj ?? '',
    },
    givenAt: row.emprestado_em,
    dueAt: row.prazo_em,
    resolution: row.resolucao,
    decisions: parseJsonField(row.decisoes, {}),
  }
  if (items != null) base.items = items
  return base
}

function bagToRow(bag) {
  return {
    cliente_id: bag.client?.id ?? null,
    cliente_nome: bag.client?.name ?? '',
    cliente_telefone: bag.client?.phone ?? '',
    cliente_cpf_cnpj: bag.client?.cpfCnpj ?? '',
    emprestado_em: bag.givenAt,
    prazo_em: bag.dueAt,
    resolucao: bag.resolution ?? null,
    decisoes: JSON.stringify(bag.decisions ?? {}),
  }
}

export const sacolasRepo = {
  async list() {
    const [bagRows, itemRows] = await Promise.all([
      listRows('sacolas_condicionais', { orderBy: 'emprestado_em desc' }),
      listRows('itens_sacola'),
    ])
    const itemsByBag = new Map()
    for (const item of itemRows) {
      const list = itemsByBag.get(item.sacola_id) ?? []
      list.push({
        id: item.produto_id,
        name: item.nome ?? '',
        price: Number(item.preco_unitario),
        qty: Number(item.quantidade),
      })
      itemsByBag.set(item.sacola_id, list)
    }
    return bagRows.map((row) => rowToBag(row, itemsByBag.get(row.id) ?? []))
  },
  async create(bag) {
    const created = await insertRow('sacolas_condicionais', bagToRow(bag))
    for (const item of bag.items) {
      await insertRow('itens_sacola', {
        sacola_id: created.id,
        produto_id: item.id ?? null,
        nome: item.name,
        preco_unitario: item.price,
        quantidade: item.qty,
      })
    }
    return rowToBag(created, bag.items)
  },
  /** Marca a sacola como acertada, gravando a decisão (`compra`/`estoque`) tomada para cada item. */
  async finalize(id, decisions) {
    const row = await updateRow('sacolas_condicionais', id, {
      resolucao: 'finalizada',
      decisoes: JSON.stringify(decisions),
    })
    return row ? rowToBag(row) : null
  },
}

function rowToTrocaLog(row) {
  return {
    id: row.id,
    type: row.tipo,
    customerName: row.cliente_nome ?? '',
    value: Number(row.valor ?? 0),
    items: parseJsonField(row.itens, []),
    createdAt: row.criado_em,
  }
}

/** Registro simples de auditoria de vales-crédito emitidos e estornos em dinheiro/PIX confirmados em Trocas. */
export const trocasLogRepo = {
  async list() {
    const rows = await listRows('trocas_log', { orderBy: 'criado_em desc' })
    return rows.map(rowToTrocaLog)
  },
  async create(entry) {
    const row = await insertRow('trocas_log', {
      tipo: entry.type,
      cliente_nome: entry.customerName ?? '',
      valor: Number(entry.value ?? 0),
      itens: JSON.stringify(entry.items ?? []),
      criado_em: new Date().toISOString(),
    })
    return rowToTrocaLog(row)
  },
}

function rowToAutorizacaoGerente(row) {
  return {
    id: row.id,
    tipoAcao: row.tipo_acao ?? '',
    motivo: row.motivo ?? '',
    operador: row.operador ?? '',
    detalhes: parseJsonField(row.detalhes, {}),
    criadoEm: row.criado_em,
  }
}

/**
 * Auditoria do Módulo de Autorização por PIN do Gerente (ver
 * ModalAutorizacaoGerente/ManagerAuthContext): toda vez que o PIN do Gerente
 * é aceito para liberar uma ação restrita (estorno de venda/pedido, desconto
 * acima de 10%, sangria de caixa, ajuste manual de estoque), um registro é
 * gravado aqui com data/hora, o tipo da ação, o motivo digitado pelo
 * operador e quem estava logado no terminal no momento.
 */
export const autorizacoesGerenteRepo = {
  async list() {
    const rows = await listRows('autorizacoes_gerente', { orderBy: 'criado_em desc' })
    return rows.map(rowToAutorizacaoGerente)
  },
  async create({ tipoAcao, motivo, operador, detalhes }) {
    const row = await insertRow('autorizacoes_gerente', {
      tipo_acao: tipoAcao,
      motivo: motivo?.trim() ?? '',
      operador: operador ?? '',
      detalhes: JSON.stringify(detalhes ?? {}),
      criado_em: new Date().toISOString(),
    })
    return rowToAutorizacaoGerente(row)
  },
}

function rowToLogSistema(row) {
  return {
    id: row.id,
    nivel: row.nivel ?? 'info',
    mensagem: row.mensagem ?? '',
    detalhe: row.detalhe ?? null,
    criadoEm: row.criado_em,
  }
}

/**
 * Log de eventos/erros persistido (ver src/utils/appLog.js) — cada
 * `console.error`/`console.warn` da aplicação, erro não tratado ou promise
 * rejeitada vira uma linha aqui, para a tela de Logs & Diagnóstico ter um
 * histórico real de suporte que sobrevive a F5/reinício do app.
 */
export const logsSistemaRepo = {
  async list(limit = 200) {
    const rows = await listRows('logs_sistema', { orderBy: 'criado_em desc' })
    return rows.slice(0, limit).map(rowToLogSistema)
  },
  async create({ nivel, mensagem, detalhe }) {
    const row = await insertRow('logs_sistema', {
      nivel: nivel || 'info',
      mensagem: String(mensagem ?? '').slice(0, 2000),
      detalhe: detalhe != null ? String(detalhe).slice(0, 2000) : null,
      criado_em: new Date().toISOString(),
    })
    return rowToLogSistema(row)
  },
}

function rowToUsuario(row) {
  return {
    id: row.id,
    name: row.nome ?? '',
    role: row.perfil === 'admin' ? 'admin' : 'operador',
    pin: row.pin_senha ?? '',
    status: Number(row.ativo ?? 1) === 1 ? 'ativo' : 'inativo',
    createdAt: row.criado_em,
    lastAccess: row.ultimo_acesso,
  }
}

function usuarioToRow(usuario) {
  return {
    nome: usuario.name?.trim() ?? '',
    pin_senha: usuario.pin ?? '',
    perfil: usuario.role === 'admin' ? 'admin' : 'operador',
    ativo: usuario.status === 'inativo' ? 0 : 1,
  }
}

/**
 * Controle de Acesso e Perfis (v1.0.5): cadastro de usuários do sistema,
 * persistido no SQLite local — substitui o cadastro de demonstração antes
 * mantido só em localStorage (ver OperatorsContext.jsx). Só dois perfis
 * existem: 'admin' (Gerente/Dono — acesso total: relatórios, financeiro,
 * custos, configurações) e 'operador' (acesso restrito — Frente de Caixa,
 * consultas básicas e vendas).
 */
export const usuariosRepo = {
  async list() {
    const rows = await listRows('usuarios', { orderBy: 'nome' })
    return rows.map(rowToUsuario)
  },
  /** Quantidade de usuários cadastrados — 0 dispara a tela de Primeiro Acesso. */
  async count() {
    const rows = await listRows('usuarios')
    return rows.length
  },
  async create(usuario) {
    const row = await insertRow('usuarios', {
      ...usuarioToRow(usuario),
      criado_em: new Date().toISOString(),
      ultimo_acesso: null,
    })
    return rowToUsuario(row)
  },
  async update(id, usuario) {
    const row = await updateRow('usuarios', id, usuarioToRow(usuario))
    return row ? rowToUsuario(row) : null
  },
  async updatePin(id, pin) {
    const row = await updateRow('usuarios', id, { pin_senha: pin })
    return row ? rowToUsuario(row) : null
  },
  async setAtivo(id, ativo) {
    const row = await updateRow('usuarios', id, { ativo: ativo ? 1 : 0 })
    return row ? rowToUsuario(row) : null
  },
  async remove(id) {
    await deleteRow('usuarios', id)
  },
  async touchLastAccess(id) {
    await updateRow('usuarios', id, { ultimo_acesso: new Date().toISOString() })
  },
  /** Usuário ativo cujo PIN bate com o informado — usado no Login do Operador (ver LoginScreen.jsx). */
  async findByPin(pin) {
    const rows = await listRows('usuarios', { where: { pin_senha: pin } })
    const row = rows.find((item) => Number(item.ativo ?? 1) === 1)
    return row ? rowToUsuario(row) : null
  },
}
