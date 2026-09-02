import { useRef, useState } from 'react'
import { X, UploadCloud, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Info } from 'lucide-react'
import {
  PRODUCT_IMPORT_COLUMNS,
  buildProductImportTemplate,
  parseProductImportCsv,
  downloadTextFile,
} from '../../utils/csv'

export default function ImportProductsModal({ open, onClose, onImport }) {
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [imported, setImported] = useState(false)
  const fileInputRef = useRef(null)

  if (!open) return null

  function handleDownloadTemplate() {
    downloadTextFile('modelo-importacao-produtos.csv', buildProductImportTemplate())
  }

  function handleFile(file) {
    if (!file) return
    setFileName(file.name)
    setImported(false)
    const reader = new FileReader()
    reader.onload = () => {
      setParsed(parseProductImportCsv(String(reader.result ?? '')))
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleConfirmImport() {
    if (!parsed || parsed.rows.length === 0) return
    onImport(parsed.rows)
    setImported(true)
  }

  function handleClose() {
    setParsed(null)
    setFileName('')
    setImported(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="custom-scrollbar max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <FileSpreadsheet size={18} className="text-emerald-600" />
            Importar Produtos via Planilha (CSV/Excel)
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Info size={13} />
              Formato exato das colunas
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    <th className="pb-1.5 pr-3 font-semibold uppercase">Coluna</th>
                    <th className="pb-1.5 pr-3 font-semibold uppercase">Obrigatória</th>
                    <th className="pb-1.5 font-semibold uppercase">Descrição</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PRODUCT_IMPORT_COLUMNS.map((column) => (
                    <tr key={column.key}>
                      <td className="py-1.5 pr-3 font-mono font-semibold text-slate-700">{column.label}</td>
                      <td className="py-1.5 pr-3">
                        {column.required ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                            Sim
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                            Não
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-slate-500">{column.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Salve a planilha do Excel/Google Sheets como{' '}
              <span className="font-semibold text-slate-600">CSV (separado por vírgulas)</span> antes de
              importar. Produtos com grade de tamanho/cor (variações) não são suportados pela importação —
              cadastre-os manualmente.
            </p>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              <Download size={14} />
              Baixar modelo de exemplo (.csv)
            </button>
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-blue-300 hover:bg-blue-50/60"
            >
              <UploadCloud size={26} className="text-blue-400" />
              <span className="text-sm font-medium text-slate-600">
                {fileName || 'Clique para selecionar o arquivo CSV'}
              </span>
            </button>
          </div>

          {parsed && (
            <div className="space-y-2">
              {parsed.rows.length > 0 && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CheckCircle2 size={15} />
                  {parsed.rows.length} produto(s) prontos para importar
                </p>
              )}
              {parsed.errors.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle size={13} />
                    {parsed.errors.length} linha(s) ignorada(s)
                  </p>
                  <ul className="max-h-24 space-y-0.5 overflow-y-auto">
                    {parsed.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {imported && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={15} />
              Produtos importados com sucesso!
            </p>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {imported ? 'Fechar' : 'Cancelar'}
          </button>
          {!imported && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!parsed || parsed.rows.length === 0}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Importar {parsed?.rows.length ? `${parsed.rows.length} Produto(s)` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
