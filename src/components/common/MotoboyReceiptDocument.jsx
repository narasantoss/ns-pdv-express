import clsx from 'clsx'
import { formatCurrency } from '../../utils/format'

function formatFullAddress(address) {
  if (!address) return '—'
  const { cep, street, number, neighborhood, city } = address
  const line = [street, number].filter(Boolean).join(', ')
  const rest = [neighborhood, city].filter(Boolean).join(' - ')
  const withCep = [rest, cep].filter(Boolean).join(' · CEP ')
  return [line, withCep].filter(Boolean).join('\n')
}

export default function MotoboyReceiptDocument({
  storeSettings,
  width = 80,
  orderCode,
  dateTimeLabel,
  clientName,
  clientPhone,
  address,
  referencePoint,
  expectedDeliveryLabel,
  notes,
  items = [],
  subtotal = 0,
  deliveryFee = 0,
  total = 0,
  paymentLabel,
  changeForLabel,
  paymentStatus = 'pendente',
  motoboyName,
  viaNumber = 1,
}) {
  const fantasyName = storeSettings?.fantasyName?.trim() || 'Minha Loja'
  const isPaid = paymentStatus === 'pago'

  return (
    <div
      className="mx-auto bg-white p-3 text-slate-900"
      style={{ width: `${width}mm`, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
    >
      <p className="text-center text-sm font-bold uppercase leading-tight">{fantasyName}</p>
      <p className="mt-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-700">
        {viaNumber}ª VIA · PEDIDO {orderCode}
      </p>
      <p className="text-center text-[10px] text-slate-500">{dateTimeLabel}</p>

      <div
        className={clsx(
          'mt-2 rounded border-2 p-2 text-center',
          isPaid ? 'border-emerald-500 bg-emerald-50' : 'border-amber-500 bg-amber-50',
        )}
      >
        <p
          className={clsx(
            'text-[11px] font-black uppercase leading-snug tracking-wide',
            isPaid ? 'text-emerald-700' : 'text-amber-700',
          )}
        >
          {isPaid
            ? 'Status: Pago (Não Cobrar do Cliente)'
            : `Status: Cobrar na Entrega - Valor: ${formatCurrency(total)} (Troco/Maquininha)`}
        </p>
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between gap-2">
          <span>Cliente</span>
          <span className="text-right font-semibold">{clientName}</span>
        </div>
        {clientPhone?.trim() && (
          <div className="flex justify-between">
            <span>Telefone</span>
            <span className="tabular-nums">{clientPhone}</span>
          </div>
        )}
        {motoboyName && (
          <div className="flex justify-between">
            <span>Motoboy</span>
            <span>{motoboyName}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Endereço de Entrega
      </p>
      <p className="mt-1 whitespace-pre-line text-[12px] font-semibold leading-snug">
        {formatFullAddress(address)}
      </p>
      {referencePoint?.trim() && (
        <p className="mt-1 text-[11px] leading-snug text-slate-700">
          Ponto de referência: {referencePoint}
        </p>
      )}
      {expectedDeliveryLabel && (
        <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-700">
          Data prevista de entrega: {expectedDeliveryLabel}
        </p>
      )}

      <div className="my-2 border-t border-dashed border-slate-400" />

      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Itens</p>
      <div className="mt-1 space-y-1 text-[11px]">
        {items.map((item, index) => (
          <div key={index} className="flex justify-between gap-2">
            <span>
              {item.qty}x {item.name}
            </span>
            <span className="shrink-0 tabular-nums">{formatCurrency(item.price * item.qty)}</span>
          </div>
        ))}
      </div>

      {notes?.trim() && (
        <>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Observações</p>
          <p className="mt-1 whitespace-pre-line text-[11px] leading-snug text-slate-700">{notes}</p>
        </>
      )}

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Taxa de Entrega</span>
          <span className="tabular-nums">{formatCurrency(deliveryFee)}</span>
        </div>
        {paymentLabel && (
          <div className="flex justify-between">
            <span>Forma de Pagamento</span>
            <span>{paymentLabel}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-slate-400" />

      <div className="flex justify-between text-sm font-bold">
        <span>{isPaid ? 'Total do Pedido' : 'Total a Cobrar'}</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>

      {changeForLabel && (
        <div className="mt-2 rounded border border-dashed border-slate-400 p-2 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
            Levar Troco Para
          </p>
          <p className="text-base font-bold">{changeForLabel}</p>
        </div>
      )}

      <p className="mt-4 border-t border-dashed border-slate-400 pt-2 text-center text-[9px] uppercase leading-tight text-slate-400">
        Documento interno — sem valor fiscal
      </p>
    </div>
  )
}
