// Detecção do IP local (IPv4) deste computador, usado como "Código de Conexão"
// da Rede Local Multi-PC (tela Configurações). Dentro do app desktop (Tauri),
// pergunta ao sistema operacional via comando Rust `get_local_ip`. Fora dele
// (ex.: `npm run dev` direto no navegador), não existe API padrão para ler o IP
// local — o navegador bloqueia esse dado por privacidade — então recorremos a
// um truque best-effort via WebRTC (gera candidatos ICE, que expõem o IP local
// em navegadores que ainda não os ofuscam). Se nada funcionar, retorna erro e a
// tela pede para o usuário digitar o IP manualmente.

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isValidIp(value) {
  if (!value || !value.trim()) return false
  const trimmed = value.trim()
  // 'localhost' é aceito como atalho para testes do Mestre/Balcão no mesmo PC
  // (ex.: dois terminais do app rodando na mesma máquina) — equivalente a
  // 127.0.0.1, que já batia na checagem de IPv4 abaixo.
  if (trimmed.toLowerCase() === 'localhost') return true
  return (
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(trimmed) &&
    trimmed.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)
  )
}

async function detectViaWebRtc(timeoutMs = 1200) {
  if (typeof window === 'undefined' || !window.RTCPeerConnection) return null

  return new Promise((resolve) => {
    let settled = false
    const found = new Set()
    const pc = new window.RTCPeerConnection({ iceServers: [] })

    function finish(value) {
      if (settled) return
      settled = true
      try {
        pc.close()
      } catch {
        // ignore
      }
      resolve(value)
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        finish(found.values().next().value ?? null)
        return
      }
      const match = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/.exec(event.candidate.candidate)
      if (match && isValidIp(match[1]) && !match[1].startsWith('0.')) {
        found.add(match[1])
      }
    }

    pc
      .createDataChannel('lan-probe')
    pc
      .createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish(null))

    setTimeout(() => finish(found.values().next().value ?? null), timeoutMs)
  })
}

/**
 * Retorna `{ ok: true, ip }` com o IPv4 local deste computador, ou
 * `{ ok: false, reason }` quando não foi possível detectar automaticamente.
 */
export async function detectLocalIp() {
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const ip = await invoke('get_local_ip')
      if (isValidIp(ip)) return { ok: true, ip }
      return { ok: false, reason: 'invalid-response' }
    } catch (error) {
      console.error('[network] Falha ao detectar IP local via Tauri:', error)
      return { ok: false, reason: String(error) }
    }
  }

  try {
    const ip = await detectViaWebRtc()
    if (ip) return { ok: true, ip }
  } catch (error) {
    console.error('[network] Falha ao detectar IP local via WebRTC:', error)
  }

  return { ok: false, reason: 'unavailable' }
}
