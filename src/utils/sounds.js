const STORAGE_KEY = 'pdv-sound-muted'

let audioContext = null
let muted = readStoredMuted()

function readStoredMuted() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    audioContext = new AudioContextClass()
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume()
  }
  return audioContext
}

export function isSoundMuted() {
  return muted
}

export function setSoundMuted(value) {
  muted = value
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // localStorage indisponível (modo privado, etc.) — mantém apenas em memória
  }
}

function playTone({ frequency, duration, startTime = 0, type = 'sine', peakGain = 0.2 }) {
  const ctx = getAudioContext()
  if (!ctx || muted) return

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency

  const now = ctx.currentTime + startTime
  gainNode.gain.setValueAtTime(0, now)
  gainNode.gain.linearRampToValueAtTime(peakGain, now + 0.01)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.start(now)
  oscillator.stop(now + duration + 0.02)
}

export function playBeepSuccess() {
  playTone({ frequency: 1000, duration: 0.08, type: 'sine', peakGain: 0.18 })
}

export function playBeepError() {
  playTone({ frequency: 300, duration: 0.2, type: 'square', peakGain: 0.14 })
  playTone({ frequency: 300, duration: 0.2, startTime: 0.25, type: 'square', peakGain: 0.14 })
}

export function playBeepFinish() {
  playTone({ frequency: 880, duration: 0.12, type: 'sine', peakGain: 0.18 })
  playTone({ frequency: 1320, duration: 0.18, startTime: 0.13, type: 'sine', peakGain: 0.18 })
}

export function playBeepRemove() {
  playTone({ frequency: 220, duration: 0.1, type: 'sine', peakGain: 0.12 })
}

// Bipe exclusivo da Consulta de Preços — tom duplo médio (600Hz, onda
// triangular), propositalmente diferente do bipe de venda (sine 1000Hz) e do
// de finalização, para que o som de uma consulta nunca seja confundido com a
// passagem de um item pelo caixa.
export function playBeepPriceCheck() {
  playTone({ frequency: 600, duration: 0.1, startTime: 0, type: 'triangle', peakGain: 0.16 })
  playTone({ frequency: 600, duration: 0.1, startTime: 0.15, type: 'triangle', peakGain: 0.16 })
}
