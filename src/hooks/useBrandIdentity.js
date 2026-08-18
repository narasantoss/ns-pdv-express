import { useEffect } from 'react'
import { useStoreSettings } from '../context/StoreSettingsContext'

const DEFAULT_TITLE = 'NS PDV Express'
const FALLBACK_LOGO = '/logo.png'
const FALLBACK_FAVICON = '/favicon.svg'

/**
 * Hook global: mantém o título da aba/janela e o favicon do navegador
 * sincronizados com o Nome e a Logo da Empresa cadastrados em Configurações.
 *
 * Sem logo própria enviada, cai para a logo padrão da NS Sistemas
 * (`public/logo.png`); se esse arquivo não existir neste build, sondamos o
 * carregamento e voltamos para o `favicon.svg` estático do app — nunca
 * deixa um ícone quebrado na aba.
 */
export function useBrandIdentity() {
  const { settings } = useStoreSettings()
  const fantasyName = settings.fantasyName.trim()
  const logoDataUrl = settings.logoDataUrl

  useEffect(() => {
    document.title = fantasyName ? `${fantasyName} - NS PDV Express` : DEFAULT_TITLE
  }, [fantasyName])

  useEffect(() => {
    let iconLink = document.querySelector('link[rel="icon"]')
    if (!iconLink) {
      iconLink = document.createElement('link')
      iconLink.rel = 'icon'
      document.head.appendChild(iconLink)
    }

    if (logoDataUrl) {
      iconLink.href = logoDataUrl
      return
    }

    iconLink.href = FALLBACK_LOGO

    const probe = new Image()
    probe.onerror = () => {
      iconLink.href = FALLBACK_FAVICON
    }
    probe.src = FALLBACK_LOGO
  }, [logoDataUrl])
}
