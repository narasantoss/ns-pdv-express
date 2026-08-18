// Camada de serviço do Módulo de Licenciamento (Etapa 5: HWID + RSA Offline).
//
// Dentro do app Tauri, o HWID e a validação da Chave de Ativação (assinatura
// RSA sobre o HWID) são resolvidos pelos comandos Rust em
// `src-tauri/src/licensing.rs` — a chave privada nunca sai do computador do
// suporte, e o app só guarda/valida a chave pública, 100% offline.
//
// Quando a UI roda apenas no navegador (`npm run dev`, sem o shell Tauri —
// usado durante o desenvolvimento da interface), não há HWID de Windows nem
// comando nativo disponível: o HWID vira um identificador persistido em
// `localStorage` e a assinatura RSA é conferida com a mesma chave pública via
// Web Crypto (`SubtleCrypto`), para que a tela de ativação funcione de forma
// equivalente dentro e fora do app empacotado (mesmo espelhamento já usado em
// src/services/db.js).
import { isTauriRuntime, licencaLocalRepo } from './db'

const LS_HWID_SEED_KEY = 'pdv-express-db:_hwid_seed'

// Chave Serial Padrão (v1.0.5) — mesmo valor de `MASTER_SERIAL_KEY` em
// src-tauri/src/licensing.rs. Produto vendido com uma única chave de
// ativação, igual para todos os compradores, sem geração individual por
// HWID/suporte manual.
const MASTER_SERIAL_KEY = 'NSPDV-2026-PRO-BR99'

export const INVALID_KEY_MESSAGE = 'Chave inválida. Verifique o código recebido na confirmação do seu pedido.'

/** Maiúsculas, sem espaços/hífens/qualquer separador — ver `normalize_key` em src-tauri/src/licensing.rs. */
function normalizeKey(value) {
  return (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

function isMasterKey(serial) {
  return normalizeKey(serial) === normalizeKey(MASTER_SERIAL_KEY)
}

// Mesma chave pública RSA-2048 embutida no binário Rust
// (src-tauri/licensing/public_key.pem) — formato SPKI/DER em base64, pronta
// para `SubtleCrypto.importKey('spki', ...)`. Usada só no fallback de
// navegador; dentro do Tauri a verificação roda em Rust.
const PUBLIC_KEY_SPKI_BASE64 =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAhRonWvg5rdJT1/e7ZxQW' +
  'hPckPDsMUFyR1Kly618KpmUqVnWvm3fkNVQ1aqH5p9wvPLP2uKQm86JOAw0M3Oyo' +
  'pDZ7aX+6PExEcetgLXpsR8mrMu4K4do+yd3w9ODO/IxLGlNaarlrkdmx0lj4myi7' +
  'dXLxq6C0pBbMA4pez3G+yu6TBxyjrvMwoxs73sJ165kGApRIzDGzV8kwb3vDx1WG' +
  '7iRd2fqgV1w7S6jqJLuHoBAkE5EEHHUKC8w8WwBF1tlqwJkqIeMaBp6pc4S/GNqI' +
  'qt2A9XqCb3Unj+FSYIL9HyUDIY5W/GKkqcR7W2p1BVZWL4xpLSzqu9RYj7kqo9dS' +
  '0wIDAQAB'

function base64ToBytes(base64) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text)
  const digest = await window.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readOrCreateHwidSeed() {
  try {
    const existing = window.localStorage.getItem(LS_HWID_SEED_KEY)
    if (existing) return existing
    const seed = window.crypto.randomUUID()
    window.localStorage.setItem(LS_HWID_SEED_KEY, seed)
    return seed
  } catch {
    // localStorage indisponível: gera um HWID novo a cada carga da página
    // (só acontece no fallback de navegador, nunca dentro do app Tauri).
    return window.crypto.randomUUID()
  }
}

async function browserHwid() {
  const seed = readOrCreateHwidSeed()
  const hex = (await sha256Hex(seed)).slice(0, 12).toUpperCase()
  return `NS-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`
}

async function browserVerifyLicenseKey(chave, hwid) {
  const key = await window.crypto.subtle.importKey(
    'spki',
    base64ToBytes(PUBLIC_KEY_SPKI_BASE64),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signature = base64ToBytes(chave.trim())
  const message = new TextEncoder().encode(hwid.trim())
  return window.crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, message)
}

/** HWID desta máquina, formatado 'NS-XXXX-XXXX-XXXX' — ver TelaAtivacaoLicenca.jsx. */
export async function obterHwidMaquina() {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('obter_hwid_maquina')
  }
  return browserHwid()
}

/**
 * Ativa a licença a partir da Chave de Licença Serial colada pelo operador
 * (campo único da tela de ativação — ver TelaAtivacaoLicenca.jsx). O HWID
 * desta máquina nunca é decidido pelo lado JS: dentro do Tauri, o comando
 * Rust `ativar_serial` lê o HWID internamente e valida a assinatura RSA do
 * serial contra ele; no fallback de navegador (`npm run dev` sem o shell
 * Tauri), o HWID vem de `browserHwid()` e a verificação roda via
 * `SubtleCrypto`. Em ambos os casos, se válido, persiste a linha "oficial"
 * em `licenca_local` (status 'ATIVADO', via `licencaLocalRepo`). Lança um
 * erro com mensagem amigável quando a chave é inválida.
 */
export async function ativarSerial(serial) {
  const serialLimpo = serial.trim()
  if (!serialLimpo) throw new Error('Informe a Chave de Licença Serial.')

  let hwid
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      hwid = await invoke('ativar_serial', { serial: serialLimpo })
    } catch (err) {
      throw new Error(typeof err === 'string' ? err : err?.message || INVALID_KEY_MESSAGE)
    }
  } else {
    hwid = await browserHwid()
    // Chave Serial Padrão (v1.0.5): comparação normalizada, sem depender do
    // HWID — ver `isMasterKey`. Mantém o fluxo legado de assinatura RSA por
    // HWID como fallback, para chaves antigas geradas antes desta versão.
    let valid = isMasterKey(serialLimpo)
    if (!valid) {
      try {
        valid = await browserVerifyLicenseKey(serialLimpo, hwid)
      } catch {
        valid = false
      }
    }
    if (!valid) throw new Error(INVALID_KEY_MESSAGE)
  }

  await licencaLocalRepo.activate({ chaveRsa: serialLimpo, hwidMaquina: hwid })
}

/** `true` quando a licença local já está ativa — usada no boot (ver App.jsx). */
export async function verificarStatusLicenca() {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return await invoke('verificar_status_licenca')
    } catch {
      return false
    }
  }
  return licencaLocalRepo.isActive()
}
