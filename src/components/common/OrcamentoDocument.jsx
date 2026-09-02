import { formatCurrency } from '../../utils/format'

export default function OrcamentoDocument({
  storeSettings,
  format = 'bobina',
  width = 80,
  code,
  clientName,
  clientPhone,
  dateTimeLabel,
  validUntilLabel,
  items = [],
  subtotal = 0,
  discount = 0,
  total = 0,
  installmentsCount = 1,
  installmentValue = 0,
  cashTotal = null,
  notes = '',
  footerMessage,
}) {
  const isA4 = format === 'a4'
  const fantasyName = storeSettings?.fantasyName?.trim() || 'Minha Loja'

  return (
    <div
      className={isA4 ? 'mx-auto bg-white p-10 text-slate-900' : 'mx-auto bg-white p-3 text-slate-900'}
      style={{
        width: isA4 ? '210mm' : `${width}mm`,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      {isA4 ? (
        <div className="mb-8 flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            {storeSettings?.logoDataUrl && (
              <img src={storeSettings.logoDataUrl} alt="Logo" className="mb-2 h-14 object-contain" />
            )}
            <p className="text-xl font-bold uppercase leading-tight">{fantasyName}</p>
            {storeSettings?.document?.trim() && (
              <p className="text-xs text-slate-500">CNPJ/CPF: {storeSettings.document}</p>
            )}
            {storeSettings?.address?.trim() && <p className="text-xs text-slate-500">{storeSettings.address}</p>}
            {storeSettings?.phone?.trim() && <p className="text-xs text-slate-500">{storeSettings.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Orçamento</p>
            <p className="text-2xl font-black">{code}</p>
            <p className="mt-1 text-xs text-slate-500">Emitido em {dateTimeLabel}</p>
            {validUntilLabel && <p className="text-xs text-slate-500">Válido até {validUntilLabel}</p>}
          </div>
        </div>
      ) : (
        <>
          {storeSettings?.logoDataUrl && (
            <img src={storeSettings.logoDataUrl} alt="Logo" className="mx-auto mb-1 h-10 object-contain" />
          )}
          <p className="text-center text-sm font-bold uppercase leading-tight">{fantasyName}</p>
          {storeSettings?.document?.trim() && (
            <p className="text-center text-[10px] leading-tight text-slate-600">
              CNPJ/CPF: {storeSettings.document}
            </p>
          )}
          <p className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Orçamento
          </p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <div className="flex justify-between text-[11px]">
            <span>{code}</span>
            <span>{dateTimeLabel}</span>
          </div>
          {validUntilLabel && <p className="text-[10px] text-slate-500">Válido até {validUntilLabel}</p>}
        </>
      )}

      {(clientName || clientPhone) && (
        <div className={isA4 ? 'mb-4 text-sm' : 'my-2 text-[11px]'}>
          {clientName && (
            <p>
              <span className="font-semibold">Cliente:</span> {clientName}
            </p>
          )}
          {clientPhone && (
            <p>
              <span className="font-semibold">Contato:</span> {clientPhone}
            </p>
          )}
        </div>
      )}

      <div className={isA4 ? 'my-2 border-t border-slate-300' : 'my-2 border-t border-dashed border-slate-400'} />

      {isA4 ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qtd.</th>
              <th className="py-2 text-right">Unitário</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-slate-100">
                <td className="py-2">{item.name}</td>
                <td className="py-2 text-right tabular-nums">{item.qty}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        items.map((item, index) => (
          <div key={index} className="mb-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <span>
                {item.qty}x {item.name}
              </span>
              <span className="shrink-0 tabular-nums">{formatCurrency(item.subtotal)}</span>
            </div>
            <p className="text-[10px] text-slate-500">{formatCurrency(item.unitPrice)} / un.</p>
          </div>
        ))
      )}

      <div className={isA4 ? 'my-3 border-t border-slate-300' : 'my-2 border-t border-dashed border-slate-400'} />

      <div className={isA4 ? 'ml-auto w-64 space-y-1 text-sm' : 'space-y-0.5 text-[11px]'}>
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
        <div className={clsxTotal(isA4)}>
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>

      {(installmentsCount > 1 || cashTotal != null) && (
        <>
          <div className={isA4 ? 'my-3 border-t border-slate-300' : 'my-2 border-t border-dashed border-slate-400'} />
          <div className={isA4 ? 'grid grid-cols-2 gap-3' : 'space-y-2'}>
            {installmentsCount > 1 && (
              <div className={isA4 ? 'rounded-lg border border-slate-300 p-3' : 'rounded border border-slate-300 p-2'}>
                <p
                  className={
                    isA4
                      ? 'text-xs font-semibold uppercase tracking-wide text-slate-500'
                      : 'text-[9px] font-semibold uppercase tracking-wide text-slate-500'
                  }
                >
                  Parcelado
                </p>
                <p className={isA4 ? 'text-lg font-bold tabular-nums' : 'text-sm font-bold tabular-nums'}>
                  {installmentsCount}x de {formatCurrency(installmentValue)}
                </p>
              </div>
            )}
            {cashTotal != null && (
              <div
                className={
                  isA4
                    ? 'rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3'
                    : 'rounded border-2 border-emerald-500 bg-emerald-50 p-2'
                }
              >
                <p
                  className={
                    isA4
                      ? 'text-xs font-semibold uppercase tracking-wide text-emerald-700'
                      : 'text-[9px] font-semibold uppercase tracking-wide text-emerald-700'
                  }
                >
                  À Vista (PIX/Dinheiro)
                </p>
                <p
                  className={
                    isA4
                      ? 'text-lg font-black tabular-nums text-emerald-700'
                      : 'text-sm font-black tabular-nums text-emerald-700'
                  }
                >
                  {formatCurrency(cashTotal)}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {notes?.trim() && (
        <>
          <div className={isA4 ? 'my-3 border-t border-slate-300' : 'my-2 border-t border-dashed border-slate-400'} />
          <div className={isA4 ? 'rounded-lg bg-slate-50 p-3' : ''}>
            <p
              className={
                isA4
                  ? 'mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500'
                  : 'text-[9px] font-semibold uppercase tracking-wide text-slate-500'
              }
            >
              Observações e Termos da Proposta
            </p>
            <p
              className={
                isA4
                  ? 'whitespace-pre-line text-xs text-slate-600'
                  : 'whitespace-pre-line text-[10px] text-slate-600'
              }
            >
              {notes}
            </p>
          </div>
        </>
      )}

      {footerMessage?.trim() && (
        <>
          <div className={isA4 ? 'my-4 border-t border-slate-300' : 'my-2 border-t border-dashed border-slate-400'} />
          <p className={isA4 ? 'text-center text-xs text-slate-500' : 'text-center text-[10px] italic text-slate-600'}>
            {footerMessage}
          </p>
        </>
      )}
    </div>
  )
}

function clsxTotal(isA4) {
  return isA4
    ? 'flex justify-between border-t border-slate-300 pt-1 text-base font-bold'
    : 'flex justify-between border-t border-slate-300 pt-1 text-sm font-bold'
}
