import { Banknote, QrCode, CreditCard, CalendarClock } from 'lucide-react'

// Agrupamento usado pelos painéis do Financeiro/Fechamento de Caixa — as
// vendas reais do PDV (PDVMain.jsx) usam formas de pagamento mais granulares
// (`cartao-credito`, `cartao-debito`, `misto`) do que estas 4 categorias;
// `bucketForPaymentMethod` faz esse mapeamento na hora de somar os valores.
export const PAYMENT_METHODS = [
  { id: 'dinheiro', label: 'Dinheiro', icon: Banknote, tone: 'emerald' },
  { id: 'pix', label: 'PIX', icon: QrCode, tone: 'sky' },
  { id: 'cartao', label: 'Cartão', icon: CreditCard, tone: 'indigo' },
  { id: 'crediario', label: 'Crediário', icon: CalendarClock, tone: 'amber' },
]

export const PAYMENT_TONE_CLASSES = {
  emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', bar: 'bg-emerald-500' },
  sky: { iconBg: 'bg-sky-50', iconText: 'text-sky-600', bar: 'bg-sky-500' },
  indigo: { iconBg: 'bg-indigo-50', iconText: 'text-indigo-600', bar: 'bg-indigo-500' },
  amber: { iconBg: 'bg-amber-50', iconText: 'text-amber-600', bar: 'bg-amber-500' },
  violet: { iconBg: 'bg-violet-50', iconText: 'text-violet-600', bar: 'bg-violet-500' },
}

/** Reduz as formas de pagamento reais do PDV às 4 categorias exibidas no Financeiro. */
export function bucketForPaymentMethod(paymentMethodId) {
  if (paymentMethodId === 'cartao-credito' || paymentMethodId === 'cartao-debito' || paymentMethodId === 'cartao') {
    return 'cartao'
  }
  if (paymentMethodId === 'dinheiro' || paymentMethodId === 'pix' || paymentMethodId === 'crediario') {
    return paymentMethodId
  }
  return null
}

const REAL_METHOD_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  // 'cartao' é a forma de pagamento genérica usada pelos pedidos de Delivery
  // ("Maquininha Cartão" cobrada na entrega) — as vendas do PDV usam sempre
  // 'cartao-credito'/'cartao-debito', nunca este id bruto.
  cartao: 'Cartão',
  'cartao-credito': 'Cartão de Crédito',
  'cartao-debito': 'Cartão de Débito',
  crediario: 'Crediário',
  misto: 'Pagamento Misto',
}

/** Rótulo e tom para exibir a forma de pagamento real de uma venda (mais granular que os 4 buckets de agregação). */
export function describePaymentMethod(paymentMethodId) {
  const bucket = bucketForPaymentMethod(paymentMethodId)
  const tone = bucket ? PAYMENT_METHODS.find((method) => method.id === bucket)?.tone : 'violet'
  return { label: REAL_METHOD_LABELS[paymentMethodId] ?? paymentMethodId ?? '—', tone: tone ?? 'violet' }
}
