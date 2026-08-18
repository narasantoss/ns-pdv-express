import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useStoreSettings } from './StoreSettingsContext'
import { isTauriRuntime } from '../services/db'
import { pingMaster } from '../services/masterClient'

const PING_INTERVAL_MS = 5000

const NetworkSyncContext = createContext(null)

/**
 * Camada de Rede Local Multi-PC (Mestre/Balcão) — ver src-tauri/src/server.rs
 * e src/services/masterClient.js.
 *
 * - PC Mestre: liga/desliga o micro-servidor HTTP local (`start_local_server`/
 *   `stop_local_server`, comandos Rust) conforme `settings.operationMode`
 *   muda em Configurações — não exige reiniciar o app.
 * - PC Balcão: monitora a conectividade com o Mestre via ping periódico e
 *   exibe um aviso fixo no topo da tela quando ele fica inalcançável.
 */
export function NetworkSyncProvider({ children }) {
  const { settings, isLoaded } = useStoreSettings()
  const [masterOnline, setMasterOnline] = useState(true)
  // Incrementado sempre que o ping recupera a conexão com o Mestre (inclusive
  // a primeira vez que ele responde, no boot). ProductsContext/ClientsContext
  // observam esse contador para recarregar produtos/clientes quando o
  // carregamento inicial falhou (ex.: Balcão ligado antes do Mestre estar de
  // pé) — sem isso, a lista ficava vazia para sempre, mesmo depois do Mestre
  // voltar a responder, porque o efeito de carga só rodava uma vez no mount.
  const [reconnectSignal, setReconnectSignal] = useState(0)
  const pollRef = useRef(null)
  const wasOnlineRef = useRef(true)

  useEffect(() => {
    if (!isLoaded || !isTauriRuntime()) return
    let cancelled = false
    const command = settings.operationMode === 'mestre' ? 'start_local_server' : 'stop_local_server'
    import('@tauri-apps/api/core').then(({ invoke }) => {
      if (cancelled) return
      invoke(command).catch((error) =>
        console.error(`[network-sync] Falha ao executar "${command}":`, error),
      )
    })
    return () => {
      cancelled = true
    }
  }, [isLoaded, settings.operationMode])

  useEffect(() => {
    clearInterval(pollRef.current)
    if (!isLoaded || settings.operationMode !== 'balcao' || !settings.masterIp) {
      setMasterOnline(true)
      return
    }

    let cancelled = false
    // Começa "false" mesmo que a última leitura tenha sido online, para que o
    // primeiro ping bem-sucedido deste ciclo (boot, ou troca de IP/modo)
    // sempre conte como uma "reconexão" e dispare o recarregamento de
    // produtos/clientes — cobre o caso comum de o Balcão ligar antes do
    // Mestre estar de pé.
    wasOnlineRef.current = false
    async function check() {
      const result = await pingMaster(settings.masterIp)
      if (cancelled) return
      setMasterOnline(result.ok)
      if (result.ok && !wasOnlineRef.current) {
        setReconnectSignal((prev) => prev + 1)
      }
      wasOnlineRef.current = result.ok
    }
    check()
    pollRef.current = setInterval(check, PING_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(pollRef.current)
    }
  }, [isLoaded, settings.operationMode, settings.masterIp])

  const showReconnectBanner =
    isLoaded && settings.operationMode === 'balcao' && Boolean(settings.masterIp) && !masterOnline

  return (
    <NetworkSyncContext.Provider value={{ masterOnline, reconnectSignal }}>
      {children}
      {showReconnectBanner && (
        <div className="fixed inset-x-0 top-0 z-[200] flex items-center justify-center gap-2 bg-amber-500 py-2 text-sm font-semibold text-white shadow-md print:hidden">
          <WifiOff size={16} className="animate-pulse" />
          Tentando reconectar ao Caixa Principal...
        </div>
      )}
    </NetworkSyncContext.Provider>
  )
}

export function useNetworkSync() {
  const context = useContext(NetworkSyncContext)
  if (!context) {
    throw new Error('useNetworkSync must be used within a NetworkSyncProvider')
  }
  return context
}
