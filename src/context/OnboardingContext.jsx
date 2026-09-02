import { createContext, useContext, useEffect, useState } from 'react'
import { getConfig, setConfig } from '../services/db'

// Controla o Tutorial Interativo de Boas-Vindas (Onboarding). A flag
// `primeiro_acesso` vive na tabela `configuracoes` (chave/valor) — a mesma
// usada pela seed inicial do banco (ver src/services/db.js), que grava
// `primeiro_acesso: 'true'` num banco recém-criado — para que o modal só
// apareça sozinho na primeira instalação/primeiro acesso deste PC, nunca
// mais depois que o tutorial for concluído ou pulado.
const OnboardingContext = createContext(null)

export function OnboardingProvider({ children }) {
  // Começa fechado por padrão: evita mostrar o tour por engano, ainda que
  // por um instante, para quem já concluiu o onboarding antes — o app só o
  // abre depois de confirmar `primeiro_acesso === 'true'` no banco.
  const [isTourOpen, setIsTourOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    getConfig('primeiro_acesso', 'true')
      .then((value) => {
        if (!cancelled && value === 'true') setIsTourOpen(true)
      })
      .catch((error) => {
        // Não bloqueia nada (o tour já começa fechado por padrão) — só evita
        // uma rejeição não tratada silenciosa.
        console.error('[onboarding] Falha ao verificar status do tutorial:', error)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function markOnboardingDone() {
    setConfig('primeiro_acesso', 'false').catch((error) => {
      console.error('[onboarding] Falha ao salvar o status do tutorial:', error)
    })
    setIsTourOpen(false)
  }

  function reopenTour() {
    setIsTourOpen(true)
  }

  return (
    <OnboardingContext.Provider value={{ isTourOpen, markOnboardingDone, reopenTour }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider')
  }
  return context
}
