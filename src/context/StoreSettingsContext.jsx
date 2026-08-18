import { createContext, useContext, useEffect, useState } from 'react'
import { getAllConfig, setManyConfig } from '../services/db'

export const DEFAULT_STORE_SETTINGS = {
  fantasyName: '',
  legalName: '',
  document: '',
  phone: '',
  address: '',
  receiptFooter: 'Obrigado pela preferência!',
  logoDataUrl: null,
  operationMode: 'mestre',
  masterIp: '',
  adminPin: '1234',
}

// Cada campo de `settings` vira uma linha em `configuracoes` (chave/valor).
// As chaves citadas na Etapa 3 (`primeiro_acesso`, `nome_empresa`,
// `logo_empresa`, `ip_mestre`, `pin_gerente`) são as mais importantes, mas o
// restante da tela de Configurações também precisa persistir de verdade —
// `configuracoes` é chave/valor livre, então os demais campos ganham suas
// próprias chaves pelo mesmo mecanismo. `primeiro_acesso` é dono do
// OnboardingContext, não deste.
const CONFIG_KEY_MAP = {
  fantasyName: 'nome_empresa',
  legalName: 'razao_social',
  document: 'documento_empresa',
  phone: 'telefone_empresa',
  address: 'endereco_empresa',
  receiptFooter: 'rodape_recibo',
  logoDataUrl: 'logo_empresa',
  operationMode: 'modo_operacao',
  masterIp: 'ip_mestre',
  adminPin: 'pin_gerente',
}

function settingsFromConfigMap(map) {
  const settings = { ...DEFAULT_STORE_SETTINGS }
  for (const [settingKey, configKey] of Object.entries(CONFIG_KEY_MAP)) {
    if (map[configKey] === undefined) continue
    const raw = map[configKey]
    settings[settingKey] = settingKey === 'logoDataUrl' && !raw ? null : raw
  }
  return settings
}

const StoreSettingsContext = createContext(null)

export function StoreSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_STORE_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAllConfig()
      .then((map) => {
        if (cancelled) return
        setSettings(settingsFromConfigMap(map))
        setIsLoaded(true)
      })
      .catch((error) => {
        // Cai pros defaults (`DEFAULT_STORE_SETTINGS`, já o estado inicial)
        // em vez de deixar `isLoaded` travado em `false` pra sempre.
        console.error('[store-settings] Falha ao carregar configurações da loja:', error)
        if (cancelled) return
        setIsLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function updateSettings(partial) {
    setSettings((prev) => {
      const next = { ...prev, ...partial }
      const configEntries = {}
      for (const settingKey of Object.keys(partial)) {
        const configKey = CONFIG_KEY_MAP[settingKey]
        if (configKey) configEntries[configKey] = next[settingKey] ?? ''
      }
      if (Object.keys(configEntries).length > 0) {
        setManyConfig(configEntries).catch((error) =>
          console.error('[store-settings] Falha ao salvar configurações no banco de dados:', error),
        )
      }
      return next
    })
  }

  return (
    <StoreSettingsContext.Provider value={{ settings, updateSettings, isLoaded }}>
      {children}
    </StoreSettingsContext.Provider>
  )
}

export function useStoreSettings() {
  const context = useContext(StoreSettingsContext)
  if (!context) {
    throw new Error('useStoreSettings must be used within a StoreSettingsProvider')
  }
  return context
}
