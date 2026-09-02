// Buffer de diagnóstico em memória para a tela de Logs & Diagnóstico (ver
// src/components/logs/LogsMain.jsx). Não é um sistema de telemetria — só
// espelha localmente, para esta sessão do app, os `console.error`/`console.warn`
// já emitidos pelo restante do código (ex.: falhas de sincronização com o
// banco em src/services/db.js) e captura erros não tratados/promises
// rejeitadas, para que o botão "Exportar Log de Suporte" tenha dados reais
// para investigar um problema relatado pelo operador.
//
// Além do buffer em memória, cada entrada é espelhada em `logs_sistema`
// (SQLite/Kysely, ver src/services/db.js) para sobreviver a F5/reinício do
// app. Essa gravação é assíncrona e best-effort: se o próprio `insertRow`
// falhar (ex.: banco indisponível), o erro é engolido em silêncio — nunca
// reemitido via `console.error`, porque isso passaria de novo pelo hook
// abaixo e tentaria persistir de novo, falharia de novo, e assim por diante
// (recursão infinita). A flag `persistingToDb` é uma trava de reentrância
// extra para o caso em que a própria cadeia de conexão do `services/db.js`
// dispare um `console.error` síncrono (ex.: falha ao abrir o SQLite) durante
// a tentativa de persistência: esse `console.error` aninhado ainda entra no
// buffer em memória, mas não dispara uma nova tentativa de gravação.

import { logsSistemaRepo } from '../services/db.js'

const MAX_ENTRIES = 300

let entries = []
let installed = false
let persistingToDb = false

async function persistEntryToDb(level, message, detail) {
  if (persistingToDb) return
  persistingToDb = true
  try {
    await logsSistemaRepo.create({ nivel: level, mensagem: message, detalhe: detail ?? null })
  } catch {
    // Best-effort: a entrada já está no buffer em memória (o que a tela de
    // Logs mostra por padrão); não reemitir console.error aqui.
  } finally {
    persistingToDb = false
  }
}

function stringifyArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message
  if (typeof arg === 'string') return arg
  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function pushEntry(level, message, detail) {
  entries.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    detail: detail ?? null,
  })
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES)
  void persistEntryToDb(level, message, detail)
}

/** Registra um evento manualmente (ex.: login, logout, troca de modo de operação). */
export function logEvent(level, message, detail) {
  pushEntry(level, message, detail)
}

export function getLogEntries() {
  return [...entries].reverse()
}

export function clearLogEntries() {
  entries = []
}

/**
 * Histórico persistido em `logs_sistema` (SQLite/Kysely) — sobrevive a
 * F5/reinício do app, diferente de `getLogEntries()` (buffer só desta
 * sessão). Usado pela tela de Logs & Diagnóstico para mostrar eventos de
 * sessões anteriores. Retorna `[]` silenciosamente se o banco não estiver
 * disponível.
 */
export async function getPersistedLogEntries(limit = 200) {
  try {
    const rows = await logsSistemaRepo.list(limit)
    return rows.map((row) => ({
      timestamp: row.criadoEm,
      level: row.nivel,
      message: row.mensagem,
      detail: row.detalhe,
    }))
  } catch {
    return []
  }
}

/**
 * Instala os hooks globais uma única vez (chamado em `main.jsx`, antes do
 * primeiro render) — a partir daqui, todo `console.error`/`console.warn` e
 * todo erro não tratado/promise rejeitada da aplicação passam a ficar
 * disponíveis em `getLogEntries()`.
 */
export function installGlobalErrorLogging() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const originalError = console.error
  console.error = (...args) => {
    pushEntry('error', args.map(stringifyArg).join(' '))
    originalError.apply(console, args)
  }

  const originalWarn = console.warn
  console.warn = (...args) => {
    pushEntry('warn', args.map(stringifyArg).join(' '))
    originalWarn.apply(console, args)
  }

  window.addEventListener('error', (event) => {
    pushEntry('error', `Erro não tratado: ${event.message}`, `${event.filename}:${event.lineno}`)
  })

  window.addEventListener('unhandledrejection', (event) => {
    pushEntry('error', `Promise rejeitada: ${stringifyArg(event.reason)}`)
  })

  pushEntry('info', 'Sessão do aplicativo iniciada')
}
