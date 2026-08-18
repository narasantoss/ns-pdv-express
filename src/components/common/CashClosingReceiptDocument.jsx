import { formatCurrency } from '../../utils/format'

const DIFFERENCE_LABELS = {
  confere: 'Caixa Confere',
  falta: 'Quebra de Caixa (Falta)',
  sobra: 'Sobra de Caixa',
}

export default function CashClosingReceiptDocument({
  storeSettings,
  width = 80,
  operatorName,
  openedAtLabel,
  closedAtLabel,
  initialCash = 0,
  cashSales = 0,
  receiptsCash = 0,
  suprimentos = 0,
  sangrias = 0,
  expectedCash = 0,
  physicalCash = 0,
  difference = 0,
  differenceStatus = 'confere',
  payments = [],
  grossTotal = 0,
}) {
  const fantasyName = storeSettings?.fantasyName?.trim() || 'Minha Loja'

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

      <p className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Comprovante de Fechamento de Caixa
      </p>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>Operador</span>
          <span className="text-right">{operatorName}</span>
        </div>
        <div className="flex justify-between">
          <span>Abertura</span>
          <span className="tabular-nums">{openedAtLabel}</span>
        </div>
        <div className="flex justify-between">
          <span>Fechamento</span>
          <span className="tabular-nums">{closedAtLabel}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Movimentação da Gaveta
      </p>
      <div className="mt-1 space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Saldo Inicial (Troco)</span>
          <span className="tabular-nums">{formatCurrency(initialCash)}</span>
        </div>
        <div className="flex justify-between">
          <span>Vendas em Dinheiro</span>
          <span className="tabular-nums">{formatCurrency(cashSales)}</span>
        </div>
        {receiptsCash > 0 && (
          <div className="flex justify-between">
            <span>Recebimentos de Crediário</span>
            <span className="tabular-nums">+{formatCurrency(receiptsCash)}</span>
          </div>
        )}
        {suprimentos > 0 && (
          <div className="flex justify-between">
            <span>Suprimentos</span>
            <span className="tabular-nums">+{formatCurrency(suprimentos)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Sangrias</span>
          <span className="tabular-nums">-{formatCurrency(sangrias)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Saldo Final Esperado</span>
          <span className="tabular-nums">{formatCurrency(expectedCash)}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Valor Contado na Gaveta</span>
          <span className="tabular-nums">{formatCurrency(physicalCash)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>{DIFFERENCE_LABELS[differenceStatus] ?? DIFFERENCE_LABELS.confere}</span>
          <span className="tabular-nums">{formatCurrency(Math.abs(difference))}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Totais por Forma de Pagamento
      </p>
      <div className="mt-1 space-y-0.5 text-[11px]">
        {payments.map((method) => (
          <div key={method.id} className="flex justify-between">
            <span>{method.label}</span>
            <span className="tabular-nums">{formatCurrency(method.amount)}</span>
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="flex justify-between text-sm font-bold">
        <span>Total Geral do Dia</span>
        <span className="tabular-nums">{formatCurrency(grossTotal)}</span>
      </div>

      <p className="mt-4 border-t border-dashed border-slate-400 pt-2 text-center text-[9px] uppercase leading-tight text-slate-400">
        Documento interno — sem valor fiscal
      </p>
    </div>
  )
}
