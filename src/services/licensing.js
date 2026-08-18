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
 * Valida a Chave de Ativação (RSA) contra o HWID informado e, se válida,
 * ativa a licença: persiste o marcador local rápido (Tauri: `licenca.json`
 * via Rust) e a linha em `licenca_local` (status 'ATIVADO', via
 * `licencaLocalRepo` — igual em Tauri e no fallback de navegador). Lança um
 * erro com mensagem amigável quando a chave é inválida.
 */
export async function ativarLicenca(chave, hwid) {
  const chaveLimpa = chave.trim()
  if (!chaveLimpa) throw new Error('Cole a Chave de Ativação recebida do suporte.')

  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('validar_e_ativar_licenca', { chave: chaveLimpa, hwid })
  } else {
    let valid = false
    try {
      valid = await browserVerifyLicenseKey(chaveLimpa, hwid)
    } catch {
      valid = false
    }
    if (!valid) throw new Error('Chave de ativação não corresponde a este computador.')
  }

  await licencaLocalRepo.activate({ chaveRsa: chaveLimpa, hwidMaquina: hwid })
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
