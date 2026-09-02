import { QrCode } from 'lucide-react'
import { formatCurrency } from '../../utils/format'

function buildMockAccessKey(saleCode) {
  const digits = (saleCode ?? '').replace(/\D/g, '').padStart(6, '0')
  return `3526 0800 0000 0000 0000 0000 0000 0000 0000 ${digits.padStart(4, '0')}`
}

const FRACTIONAL_UNITS = new Set(['KG', 'G', 'MT', 'L'])

// Produto pesável/por medida: mostra o peso com 3 casas e a unidade (ex.:
// "0,350 KG"), em vez do "Nx" usado para produtos vendidos por unidade.
function formatItemQtyLabel(qty, unit) {
  if (unit && FRACTIONAL_UNITS.has(unit)) {
    return `${Number(qty).toFixed(3)} ${unit}`
  }
  return `${qty}x`
}

export default function ReceiptDocument({
  storeSettings,
  width = 80,
  documentType = 'cupom',
  saleCode,
  dateTimeLabel,
  items = [],
  subtotal = 0,
  discount = 0,
  paymentLabel,
  changeLabel,
  total = 0,
  footerMessage,
  viaNumber = 1,
}) {
  const fantasyName = storeSettings?.fantasyName?.trim() || 'Minha Loja'
  const documentTitle = documentType === 'nfce' ? 'Documento Auxiliar da NFC-e' : 'Cupom Não Fiscal'

  return (
    <div
      className="mx-auto bg-white p-3 text-slate-900"
      style={{ width: `${width}mm`, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      {storeSettings?.logoDataUrl && (
        <img src={storeSettings.logoDataUrl} alt="Logo" className="mx-auto mb-1 h-10 object-contain" />
      )}
      <p className="text-center text-sm font-bold uppercase leading-tight">{fantasyName}</p>
      {storeSettings?.document?.trim() && (
        <p className="text-center text-[10px] leading-tight text-slate-600">
          CNPJ/CPF: {storeSettings.document}
        </p>
      )}
      {storeSettings?.address?.trim() && (
        <p className="text-center text-[10px] leading-tight text-slate-600">{storeSettings.address}</p>
      )}
      {storeSettings?.phone?.trim() && (
        <p className="text-center text-[10px] leading-tight text-slate-600">{storeSettings.phone}</p>
      )}

      <p className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {documentTitle}
      </p>
      <p className="text-center text-[10px] font-bold uppercase tracking-wide text-slate-700">
        {viaNumber}ª VIA · VENDA {saleCode}
      </p>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="flex justify-between text-[11px]">
        <span>Venda {saleCode}</span>
        <span>{dateTimeLabel}</span>
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      {items.map((item, index) => (
        <div key={index} className="mb-1 text-[11px]">
          <div className="flex justify-between gap-2">
            <span>
              {formatItemQtyLabel(item.qty, item.unit)} {item.name}
            </span>
            <span className="shrink-0 tabular-nums">{formatCurrency(item.subtotal)}</span>
          </div>
          <p className="text-[10px] text-slate-500">
            {formatCurrency(item.unitPrice)} / {(item.unit ?? 'UN').toLowerCase()}
          </p>
        </div>
      ))}

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between">
            <span>Desconto</span>
            <span className="tabular-nums">-{formatCurrency(discount)}</span>
          </div>
        )}
        {paymentLabel && (
          <div className="flex justify-between">
            <span>Forma de Pagamento</span>
            <span>{paymentLabel}</span>
          </div>
        )}
        {changeLabel != null && (
          <div className="flex justify-between">
            <span>Troco</span>
            <span className="tabular-nums">{changeLabel}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="flex justify-between text-sm font-bold">
        <span>Total</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>

      {documentType === 'nfce' && (
        <>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex flex-col items-center gap-1 text-center">
            <QrCode size={64} className="text-slate-800" />
            <p className="text-[9px] leading-tight text-slate-500">
              Consulte pela Chave de Acesso
            </p>
            <p className="break-all text-[9px] leading-tight text-slate-600">
              {buildMockAccessKey(saleCode)}
            </p>
            <p className="text-[8px] uppercase leading-tight text-slate-400">
              Simulação — sem valor fiscal
            </p>
          </div>
        </>
      )}

      {footerMessage?.trim() && (
        <>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-center text-[10px] italic text-slate-600">{footerMessage}</p>
        </>
      )}
    </div>
  )
}
