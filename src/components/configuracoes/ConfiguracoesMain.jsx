import { useEffect, useRef, useState } from 'react'
import {
  Building2,
  IdCard,
  Phone,
  MapPin,
  MessageSquareText,
  UploadCloud,
  ImageOff,
  RefreshCw,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Network,
  ServerCog,
  MonitorSmartphone,
  KeyRound,
  DatabaseBackup,
  Download,
  Upload,
  Copy,
  Check,
  Loader2,
  XCircle,
  Wifi,
} from 'lucide-react'
import clsx from 'clsx'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useProducts } from '../../context/ProductsContext'
import {
  buildSystemBackup,
  downloadDatabaseFile,
  restoreDatabaseFile,
  restoreFromJsonBackup,
} from '../../lib/database'
import { downloadTextFile, downloadBinaryFile, buildProductsExportCsv } from '../../utils/csv'
import { detectLocalIp, isValidIp } from '../../utils/network'
import { pingMaster } from '../../services/masterClient'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg']
const MAX_FILE_SIZE = 2 * 1024 * 1024

const fieldClasses =
  'mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30'
const labelClasses = 'text-xs font-medium uppercase tracking-wide text-slate-500'

const OPERATION_MODES = [
  {
    id: 'mestre',
    label: 'PC Mestre / Caixa Principal',
    description: 'Hospeda o banco de dados local (SQLite) e coordena as vendas do caixa principal.',
    icon: ServerCog,
  },
  {
    id: 'balcao',
    label: 'PC Cliente / Balcão',
    description: 'Conecta-se via IP da rede local ao PC Mestre para lançar pedidos e comandas.',
    icon: MonitorSmartphone,
  },
]

export default function ConfiguracoesMain() {
  const { settings, updateSettings } = useStoreSettings()
  const { products } = useProducts()
  const [draft, setDraft] = useState(settings)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const [savedMessage, setSavedMessage] = useState(false)
  const [backupState, setBackupState] = useState('idle')
  const [restoreFile, setRestoreFile] = useState(null)
  const [restoreState, setRestoreState] = useState('idle')
  const [restoreError, setRestoreError] = useState('')

  const [localIp, setLocalIp] = useState('')
  const [ipDetectState, setIpDetectState] = useState('idle') // idle | detecting | ok | error
  const [copyState, setCopyState] = useState('idle') // idle | copied
  const [connTestState, setConnTestState] = useState('idle') // idle | testing | success | error

  const fileInputRef = useRef(null)
  const savedTimeoutRef = useRef(null)
  const backupDoneTimeoutRef = useRef(null)
  const restoreFileInputRef = useRef(null)
  const copyTimeoutRef = useRef(null)
  const connTestTimeoutRef = useRef(null)

  async function detectIp() {
    setIpDetectState('detecting')
    const result = await detectLocalIp()
    if (result.ok) {
      setLocalIp(result.ip)
      setIpDetectState('ok')
    } else {
      setIpDetectState('error')
    }
  }

  useEffect(() => {
    if (draft.operationMode === 'mestre' && ipDetectState === 'idle') {
      detectIp()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.operationMode])

  async function handleCopyIp() {
    try {
      await navigator.clipboard.writeText(localIp)
      setCopyState('copied')
      clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 2000)
    } catch (error) {
      console.error('[configuracoes] Falha ao copiar o código de conexão:', error)
    }
  }

  async function handleTestConnection() {
    setConnTestState('testing')
    const result = await pingMaster(draft.masterIp)
    setConnTestState(result.ok && result.data?.role === 'mestre' ? 'success' : 'error')
    clearTimeout(connTestTimeoutRef.current)
    connTestTimeoutRef.current = setTimeout(() => setConnTestState('idle'), 4000)
  }

  function handleExportProducts() {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(`produtos-${stamp}.csv`, buildProductsExportCsv(products))
  }

  function backupStamp() {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, '0')
    const month = String(now.getMonth() + 1).padStart(2, '0')
    return `${day}${month}${now.getFullYear()}`
  }

  async function handleGenerateBackup() {
    setBackupState('generating')
    try {
      const result = await downloadDatabaseFile()
      if (result.ok) {
        downloadBinaryFile(`backup_pdv_${backupStamp()}.db`, result.bytes, 'application/octet-stream')
      } else {
        // Fora do app desktop (Tauri) não existe um arquivo .db real para baixar —
        // gera um snapshot JSON portátil com os mesmos dados como alternativa.
        const snapshot = await buildSystemBackup()
        downloadTextFile(
          `backup_pdv_${backupStamp()}.json`,
          JSON.stringify(snapshot, null, 2),
          'application/json;charset=utf-8',
        )
      }
      setBackupState('done')
      clearTimeout(backupDoneTimeoutRef.current)
      backupDoneTimeoutRef.current = setTimeout(() => setBackupState('idle'), 3000)
    } catch (error) {
      console.error('[configuracoes] Falha ao gerar backup:', error)
      setBackupState('idle')
    }
  }

  function handleRestoreFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setRestoreError('')
    setRestoreFile(file)
  }

  function cancelRestore() {
    setRestoreFile(null)
    setRestoreError('')
  }

  async function confirmRestore() {
    if (!restoreFile) return
    setRestoreState('restoring')
    try {
      const isJson = restoreFile.name.toLowerCase().endsWith('.json')
      const result = isJson
        ? await restoreFromJsonBackup(JSON.parse(await restoreFile.text()))
        : await restoreDatabaseFile(new Uint8Array(await restoreFile.arrayBuffer()))

      if (!result.ok) {
        setRestoreError(
          result.reason === 'not-tauri'
            ? 'Restauração de arquivo .db disponível apenas no aplicativo desktop. Neste ambiente, use um backup .json.'
            : 'Não foi possível restaurar o backup selecionado. Verifique se o arquivo não está corrompido.',
        )
        setRestoreState('idle')
        return
      }
      window.location.reload()
    } catch (error) {
      console.error('[configuracoes] Falha ao restaurar backup:', error)
      setRestoreError('Não foi possível restaurar o backup selecionado. Verifique se o arquivo não está corrompido.')
      setRestoreState('idle')
    }
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings)

  function updateField(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }))
  }

  function handleFile(file) {
    if (!file) return

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setFileError('Formato inválido. Envie uma imagem PNG ou JPG.')
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError('Arquivo muito grande. O limite é 2MB.')
      return
    }

    setFileError('')
    const reader = new FileReader()
    reader.onload = () => updateField('logoDataUrl', reader.result)
    reader.readAsDataURL(file)
  }

  function handleFileInputChange(event) {
    handleFile(event.target.files?.[0])
    event.target.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    handleFile(event.dataTransfer.files?.[0])
  }

  function removeLogo() {
    updateField('logoDataUrl', null)
    setFileError('')
  }

  function handleSave(event) {
    event.preventDefault()
    if (!isDirty) return

    updateSettings(draft)
    clearTimeout(savedTimeoutRef.current)
    setSavedMessage(true)
    savedTimeoutRef.current = setTimeout(() => setSavedMessage(false), 3000)
  }

  function handleDiscard() {
    setDraft(settings)
    setFileError('')
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Configurações</h1>
          <p className="text-sm text-slate-500">
            Dados da loja, identidade visual e recibo
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
              <AlertTriangle size={13} />
              Alterações não salvas
            </span>
          )}
          {!isDirty && savedMessage && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 size={13} />
              Alterações salvas
            </span>
          )}

          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={15} />
            Descartar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            <Save size={16} />
            Salvar Alterações
          </button>
        </div>
      </header>

      <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[1fr_360px] lg:overflow-hidden">
        <div className="custom-scrollbar min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:overflow-y-auto">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <Building2 size={16} />
            Dados da Empresa
          </h2>

          <form className="space-y-4" onSubmit={handleSave}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fantasy-name" className={labelClasses}>
                  Nome Fantasia da Loja
                </label>
                <input
                  id="fantasy-name"
                  type="text"
                  value={draft.fantasyName}
                  onChange={(event) => updateField('fantasyName', event.target.value)}
                  placeholder="Ex: Mercadinho Boa Compra"
                  className={fieldClasses}
                />
              </div>
              <div>
                <label htmlFor="legal-name" className={labelClasses}>
                  Razão Social
                </label>
                <input
                  id="legal-name"
                  type="text"
                  value={draft.legalName}
                  onChange={(event) => updateField('legalName', event.target.value)}
                  placeholder="Razão social completa"
                  className={fieldClasses}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="document" className={labelClasses}>
                  CNPJ / CPF
                </label>
                <div className="relative mt-1">
                  <IdCard
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="document"
                    type="text"
                    value={draft.document}
                    onChange={(event) => updateField('document', event.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="phone" className={labelClasses}>
                  Telefone / WhatsApp
                </label>
                <div className="relative mt-1">
                  <Phone
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="phone"
                    type="text"
                    value={draft.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    placeholder="(11) 90000-0000"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="address" className={labelClasses}>
                Endereço Completo
              </label>
              <div className="relative mt-1">
                <MapPin size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
                <textarea
                  id="address"
                  rows={2}
                  value={draft.address}
                  onChange={(event) => updateField('address', event.target.value)}
                  placeholder="Rua, número, bairro, cidade - UF, CEP"
                  className="w-full resize-none rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>

            <div>
              <label htmlFor="receipt-footer" className={labelClasses}>
                Mensagem do Rodapé do Recibo
              </label>
              <div className="relative mt-1">
                <MessageSquareText
                  size={16}
                  className="pointer-events-none absolute left-3 top-3 text-slate-400"
                />
                <textarea
                  id="receipt-footer"
                  rows={2}
                  value={draft.receiptFooter}
                  onChange={(event) => updateField('receiptFooter', event.target.value)}
                  placeholder="Obrigado pela preferência!"
                  className="w-full resize-none rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Network size={16} />
              Modo de Operação do Sistema
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Define como este computador participa da rede local (LAN) do estabelecimento.
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {OPERATION_MODES.map(({ id, label, description, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => updateField('operationMode', id)}
                  className={clsx(
                    'flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all',
                    draft.operationMode === id
                      ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <Icon
                    size={20}
                    className={draft.operationMode === id ? 'text-blue-700' : 'text-slate-400'}
                  />
                  <span>
                    <span
                      className={clsx(
                        'block text-sm font-semibold',
                        draft.operationMode === id ? 'text-blue-700' : 'text-slate-800',
                      )}
                    >
                      {label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {draft.operationMode === 'mestre' && (
              <div className="mt-4 overflow-hidden rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-emerald-700">
                    <Wifi size={16} />
                    Código de Conexão da Rede Local
                  </p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                    Este é o PC Mestre
                  </span>
                </div>

                <div className="mt-4 flex flex-col items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-6">
                  {ipDetectState === 'detecting' && (
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-400">
                      <Loader2 size={18} className="animate-spin" />
                      Detectando o IP deste computador…
                    </span>
                  )}
                  {ipDetectState === 'ok' && (
                    <span className="font-mono text-4xl font-black tracking-wider text-slate-900 sm:text-5xl">
                      {localIp}
                    </span>
                  )}
                  {ipDetectState === 'error' && (
                    <div className="flex flex-col items-center gap-2 px-4 text-center">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-600">
                        <AlertTriangle size={15} />
                        Não foi possível detectar o IP automaticamente
                      </span>
                      <button
                        type="button"
                        onClick={detectIp}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <RefreshCw size={13} />
                        Tentar detectar novamente
                      </button>
                    </div>
                  )}
                </div>

                <p className="mt-3 text-center text-sm leading-snug text-slate-600">
                  Digite este número exato no computador do Balcão/Atendimento para conectar os
                  computadores.
                </p>

                <button
                  type="button"
                  onClick={handleCopyIp}
                  disabled={ipDetectState !== 'ok'}
                  className={clsx(
                    'mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none',
                    copyState === 'copied' ? 'bg-emerald-600 hover:bg-emerald-600' : 'bg-blue-600 hover:bg-blue-700',
                  )}
                >
                  {copyState === 'copied' ? <Check size={16} /> : <Copy size={16} />}
                  {copyState === 'copied' ? 'Código Copiado!' : 'Copiar Código de Conexão'}
                </button>
              </div>
            )}

            {draft.operationMode === 'balcao' && (
              <div className="mt-3">
                <label htmlFor="master-ip" className={labelClasses}>
                  Informe o Código de Conexão exibido na tela do Caixa Principal
                </label>
                <div className="relative mt-1">
                  <Network
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="master-ip"
                    type="text"
                    value={draft.masterIp}
                    onChange={(event) => updateField('masterIp', event.target.value)}
                    placeholder="Ex: 192.168.1.10"
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
                {draft.masterIp.trim() && !isValidIp(draft.masterIp) && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                    <AlertTriangle size={13} />
                    Informe um endereço IPv4 válido (ex: 192.168.1.10)
                  </p>
                )}
                <p className="mt-1.5 text-xs text-slate-400">
                  Este é o número mostrado no card verde da tela de Configurações do computador do
                  Caixa Principal.
                </p>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={!isValidIp(draft.masterIp) || connTestState === 'testing'}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 py-2.5 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                >
                  {connTestState === 'testing' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Wifi size={16} />
                  )}
                  {connTestState === 'testing' ? 'Testando Conexão…' : 'Testar Conexão'}
                </button>
                {connTestState === 'success' && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                    <CheckCircle2 size={13} />
                    Caixa Principal encontrado e respondendo nessa rede.
                  </p>
                )}
                {connTestState === 'error' && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
                    <XCircle size={13} />
                    Não foi possível alcançar o Caixa Principal nesse endereço. Confira se os dois
                    computadores estão no mesmo Wi-Fi/roteador, se o código foi digitado corretamente
                    e se o outro PC está configurado como "PC Mestre / Caixa Principal".
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-100 pt-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <KeyRound size={16} />
              Segurança de Acesso
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              PIN do Supervisor/Gerente — exigido para desbloquear áreas restritas no modo Balcão/Atendimento,
              para abrir os módulos de Relatórios (DRE) e Logs & Diagnóstico, e para autorizar ações sensíveis:
              estorno/cancelamento de venda, desconto acima de 10%, sangria e suprimento de caixa, fechamento de
              caixa do dia e ajuste manual de estoque.
            </p>

            <label htmlFor="admin-pin" className={labelClasses}>
              PIN do Supervisor/Gerente (4 dígitos)
            </label>
            <input
              id="admin-pin"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={draft.adminPin}
              onChange={(event) => updateField('adminPin', event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              className="mt-1 w-32 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-center font-mono text-lg font-bold tracking-[0.4em] text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
            />
            {draft.adminPin.length !== 4 && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600">
                <AlertTriangle size={13} />
                O PIN deve ter exatamente 4 dígitos
              </p>
            )}
          </div>
        </div>

        <div className="custom-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Logomarca
            </h2>

            <input
              ref={fileInputRef}
              id="logo-file-input"
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {draft.logoDataUrl ? (
              <div className="space-y-3">
                <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <img
                    src={draft.logoDataUrl}
                    alt="Preview da logomarca"
                    className="h-32 max-w-full object-contain"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <RefreshCw size={15} />
                    Substituir
                  </button>
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <ImageOff size={15} />
                    Remover Logo
                  </button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="logo-file-input"
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragging(true)
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={clsx(
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors',
                  isDragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/60',
                )}
              >
                <UploadCloud size={28} className="text-blue-400" />
                <p className="text-sm font-medium text-slate-600">
                  Arraste uma imagem aqui
                </p>
                <p className="text-xs text-slate-400">ou clique para selecionar (PNG ou JPG, até 2MB)</p>
              </label>
            )}

            {fileError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
                <AlertTriangle size={13} />
                {fileError}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Receipt size={16} />
              Prévia do Recibo
            </h2>

            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center font-mono text-[11px] leading-relaxed text-slate-700">
              {draft.logoDataUrl && (
                <img
                  src={draft.logoDataUrl}
                  alt="Logo no recibo"
                  className="mx-auto mb-2 h-12 object-contain"
                />
              )}
              <p className="text-sm font-bold uppercase text-slate-900">
                {draft.fantasyName.trim() || 'Nome Fantasia da Loja'}
              </p>
              {draft.legalName.trim() && <p>{draft.legalName}</p>}
              {draft.document.trim() && <p>{draft.document}</p>}
              {draft.address.trim() && <p className="whitespace-pre-line">{draft.address}</p>}
              {draft.phone.trim() && <p>{draft.phone}</p>}
              <p className="my-2 border-t border-dashed border-slate-300" />
              <p className="text-slate-400">Cupom Não Fiscal</p>
              <p className="my-2 border-t border-dashed border-slate-300" />
              <p className="italic text-slate-500">
                {draft.receiptFooter.trim() || 'Obrigado pela preferência!'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <DatabaseBackup size={16} />
              Segurança de Dados & Backup
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              Exporte o catálogo de produtos e faça backup ou restauração dos dados locais: arquivo
              SQLite (.db) no aplicativo desktop, ou um pacote JSON portátil quando executado no
              navegador.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleExportProducts}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Download size={16} />
                Exportar Produtos (CSV)
              </button>

              <button
                type="button"
                onClick={handleGenerateBackup}
                disabled={backupState === 'generating'}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <DatabaseBackup size={16} />
                {backupState === 'generating' ? 'Gerando backup…' : 'Gerar Backup do Sistema'}
              </button>
              {backupState === 'done' && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                  <CheckCircle2 size={13} />
                  Backup baixado com sucesso
                </p>
              )}

              <input
                ref={restoreFileInputRef}
                type="file"
                accept=".db,.json,application/json"
                className="hidden"
                onChange={handleRestoreFileSelected}
              />
              <button
                type="button"
                onClick={() => restoreFileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
              >
                <Upload size={16} />
                Restaurar Banco de Dados
              </button>
              {restoreError && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-red-600">
                  <AlertTriangle size={13} />
                  {restoreError}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: confirmação de restauração do banco de dados */}
      {restoreFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <AlertTriangle size={22} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Restaurar Banco de Dados</h2>
                <p className="mt-1 text-sm text-slate-500">
                  <span className="font-semibold text-slate-700">Atenção:</span> a restauração substituirá
                  todos os dados atuais por{' '}
                  <span className="font-medium text-slate-700">{restoreFile.name}</span> — comandas,
                  configurações e todo o histórico salvo localmente. A sessão será reiniciada em seguida.
                  Essa ação não pode ser desfeita. Deseja continuar?
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={cancelRestore}
                disabled={restoreState === 'restoring'}
                className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmRestore}
                disabled={restoreState === 'restoring'}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {restoreState === 'restoring' ? 'Restaurando…' : 'Substituir e Restaurar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
