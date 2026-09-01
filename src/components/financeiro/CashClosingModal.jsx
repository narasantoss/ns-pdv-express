import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Lock,
  History,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  UserCircle2,
  Scale,
  Printer,
  FileText,
  Banknote,
  QrCode,
  CreditCard,
  CalendarClock,
} from 'lucide-react'
import clsx from 'clsx'
import { useStoreSettings } from '../../context/StoreSettingsContext'
import { useCashRegister } from '../../context/CashRegisterContext'
import { useSession } from '../../context/SessionContext'
import { useManagerAuth, MANAGER_ACTIONS } from '../../context/ManagerAuthContext'
import { formatCurrency } from '../../utils/format'
import { printCashClosingWindow } from '../../utils/printReceiptWindow'
import { PAYMENT_METHODS, PAYMENT_TONE_CLASSES, bucketForPaymentMethod } from '../../data/paymentMethods'
import { vendasRepo } from '../../services/db'

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function parseAmount(value) {
  const parsed = Number.parseFloat((value ?? '').toString().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

const RECEIPT_METHOD_LABELS = { pix: 'PIX', cartao: 'Cartão' }

function sumPaymentsForMethod(vendas, methodId) {
  let total = 0
  for (const venda of vendas) {
    if (venda.formaPagamento === 'misto') {
      total += Number(venda.splitPayments?.[methodId] ?? 0)
      continue
    }
    if (bucketForPaymentMethod(venda.formaPagamento) === methodId) total += venda.totalLiquido
  }
  return total
}

// Linhas do Relatório do Dia — quebra granular por forma de pagamento.
// Diferente dos 4 buckets do Financeiro (data/paymentMethods.js), aqui
// Cartão de Débito e Cartão de Crédito aparecem separados, porque é isso que
// o operador precisa conferir contra o extrato da maquininha no fechamento.
const DAILY_BREAKDOWN_ROWS = [
  { id: 'dinheiro', label: 'Vendas em Dinheiro', icon: Banknote, tone: 'emerald' },
  { id: 'pix', label: 'PIX', icon: QrCode, tone: 'sky' },
  { id: 'cartao-debito', label: 'Cartão de Débito', icon: CreditCard, tone: 'indigo' },
  { id: 'cartao-credito', label: 'Cartão de Crédito', icon: CreditCard, tone: 'violet' },
  { id: 'cartao', label: 'Cartão (Maquininha / Misto)', icon: CreditCard, tone: 'indigo' },
  { id: 'crediario', label: 'Crediário', icon: CalendarClock, tone: 'amber' },
]

/**
 * Soma as vendas da sessão + recebimentos de crediário por forma de pagamento
 * detalhada. Cada parcela de uma venda "Pagamento Misto" cai no bucket certo
 * (dinheiro / pix / cartão). A linha genérica "Cartão (Maquininha / Misto)"
 * só aparece quando tem valor — cobre o cartão do pagamento misto e pedidos
 * de delivery cobrados na maquininha, que não distinguem débito de crédito.
 */
function buildDailyBreakdown(vendas, receiptMovements) {
  const totals = {
    dinheiro: 0,
    pix: 0,
    'cartao-debito': 0,
    'cartao-credito': 0,
    cartao: 0,
    crediario: 0,
  }

  for (const venda of vendas) {
    if (venda.formaPagamento === 'misto') {
      totals.dinheiro += Number(venda.splitPayments?.dinheiro ?? 0)
      totals.pix += Number(venda.splitPayments?.pix ?? 0)
      totals.cartao += Number(venda.splitPayments?.cartao ?? 0)
      continue
    }
    if (venda.formaPagamento in totals) {
      totals[venda.formaPagamento] += venda.totalLiquido
    }
  }

  for (const movement of receiptMovements) {
    const key = movement.method in totals ? movement.method : null
    if (key) totals[key] += movement.amount
  }

  return DAILY_BREAKDOWN_ROWS.filter((row) => row.id !== 'cartao' || totals.cartao > 0.005).map(
    (row) => ({ ...row, amount: totals[row.id] }),
  )
}

export default function CashClosingModal({ open, onClose }) {
  const { settings } = useStoreSettings()
  const { movements, clearMovements, suprimentosTotal, sangriasTotal, openedAt, openingAmount, closeCash } =
    useCashRegister()
  const { currentOperator } = useSession()
  const { requestAuthorization } = useManagerAuth()
  const [closed, setClosed] = useState(false)
  const [physicalCash, setPhysicalCash] = useState('')
  const [closingSummary, setClosingSummary] = useState(null)
  const [sessionSales, setSessionSales] = useState([])

  useEffect(() => {
    if (open) {
      setClosed(false)
      setPhysicalCash('')
    }
  }, [open])

  // Vendas reais desta sessão de caixa (desde a Abertura de Caixa até agora),
  // persistidas via `vendasRepo` — ver src/services/db.js. Carregadas de
  // novo sempre que o modal abre, para refletir vendas feitas enquanto ele
  // estava fechado.
  useEffect(() => {
    if (!open || !openedAt) return
    let cancelled = false
    vendasRepo.list().then((list) => {
      if (cancelled) return
      const openedAtTime = openedAt.getTime()
      setSessionSales(list.filter((venda) => venda.status !== 'estornada' && new Date(venda.dataVenda).getTime() >= openedAtTime))
    })
    return () => {
      cancelled = true
    }
  }, [open, openedAt])

  // Recebimentos de crediário quitados em Clientes → Receber Pagamento (ver
  // ClientesMain.jsx) — cada um carrega a forma de pagamento realmente usada
  // (dinheiro/PIX/cartão), para somar no bucket certo dos Totais por Forma de
  // Pagamento e, só a parcela em dinheiro, no "Esperado em Caixa" (a única
  // que afeta a gaveta física).
  const receiptMovements = useMemo(
    () => movements.filter((movement) => movement.type === 'recebimento'),
    [movements],
  )
  const receiptsCashTotal = useMemo(
    () =>
      receiptMovements
        .filter((movement) => movement.method === 'dinheiro')
        .reduce((sum, movement) => sum + movement.amount, 0),
    [receiptMovements],
  )

  const sessionPayments = useMemo(
    () =>
      PAYMENT_METHODS.map((method) => ({
        ...method,
        amount:
          sumPaymentsForMethod(sessionSales, method.id) +
          receiptMovements
            .filter((movement) => movement.method === method.id)
            .reduce((sum, movement) => sum + movement.amount, 0),
      })),
    [sessionSales, receiptMovements],
  )
  const sessionGross = useMemo(() => sessionPayments.reduce((sum, method) => sum + method.amount, 0), [sessionPayments])
  // Quebra detalhada (débito x crédito x crediário) para o Relatório do Dia —
  // some das mesmas vendas/recebimentos que `sessionPayments`, então o total
  // continua igual a `sessionGross`.
  const detailedPayments = useMemo(
    () => buildDailyBreakdown(sessionSales, receiptMovements),
    [sessionSales, receiptMovements],
  )
  // Já inclui `receiptsCashTotal` (mesclado em `sessionPayments` acima), então
  // recebimentos de crediário em dinheiro compõem o Esperado em Caixa junto
  // com as vendas em dinheiro da sessão.
  const sessionCashAmount = sessionPayments.find((method) => method.id === 'dinheiro')?.amount ?? 0

  const expectedCash = openingAmount + sessionCashAmount + suprimentosTotal - sangriasTotal
  const hasPhysicalCash = physicalCash.trim() !== ''
  const cashDifference = parseAmount(physicalCash) - expectedCash
  const cashDifferenceStatus =
    Math.abs(cashDifference) < 0.005 ? 'confere' : cashDifference < 0 ? 'falta' : 'sobra'

  function confirmClose() {
    requestAuthorization({
      tipoAcao: MANAGER_ACTIONS.FECHAMENTO_CAIXA,
      title: 'Autorizar Fechamento de Caixa',
      description: 'Digite o PIN do Supervisor para confirmar o fechamento do caixa do dia.',
      detailLabel: `Esperado em caixa: ${formatCurrency(expectedCash)} · Contado: ${formatCurrency(parseAmount(physicalCash))}`,
      detalhes: {
        expectedCash,
        physicalCash: parseAmount(physicalCash),
        difference: cashDifference,
        differenceStatus: cashDifferenceStatus,
      },
      onAuthorized: executeClose,
    })
  }

  function executeClose() {
    setClosingSummary({
      operatorName: currentOperator?.name ?? 'Operador',
      openedAt,
      closedAt: new Date(),
      initialCash: openingAmount,
      cashSales: sessionCashAmount - receiptsCashTotal,
      receiptsCash: receiptsCashTotal,
      suprimentos: suprimentosTotal,
      sangrias: sangriasTotal,
      expectedCash,
      physicalCash: parseAmount(physicalCash),
      difference: cashDifference,
      differenceStatus: cashDifferenceStatus,
      payments: detailedPayments,
      grossTotal: sessionGross,
      generatedAt: new Date(),
    })
    setClosed(true)
    clearMovements()
    closeCash()
  }

  // `paper`: '58' | '80' (bobina térmica não-fiscal) | 'a4' (folha inteira / PDF).
  function printClosingReceipt(paper = '80') {
    if (!closingSummary) return
    printCashClosingWindow({
      storeSettings: settings,
      paper,
      width: paper === 'a4' ? 180 : Number(paper),
      operatorName: closingSummary.operatorName,
      openedAtLabel: dateTimeFormatter.format(closingSummary.openedAt),
      closedAtLabel: dateTimeFormatter.format(closingSummary.closedAt),
      generatedAtLabel: dateTimeFormatter.format(closingSummary.generatedAt ?? new Date()),
      initialCash: closingSummary.initialCash,
      cashSales: closingSummary.cashSales,
      receiptsCash: closingSummary.receiptsCash,
      suprimentos: closingSummary.suprimentos,
      sangrias: closingSummary.sangrias,
      expectedCash: closingSummary.expectedCash,
      physicalCash: closingSummary.physicalCash,
      difference: closingSummary.difference,
      differenceStatus: closingSummary.differenceStatus,
      payments: closingSummary.payments,
      grossTotal: closingSummary.grossTotal,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:hidden">
      <div
        className={clsx(
          'custom-scrollbar max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl',
          closed ? 'max-w-md' : 'max-w-sm',
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Fechamento de Caixa do Dia</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {!closed ? (
          <>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Relatório do Dia · Totais por Forma de Pagamento
            </p>
            <ul className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
              {detailedPayments.map(({ id, label, icon: Icon, amount }) => (
                <li key={id} className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-2">
                    <Icon size={15} className="text-slate-400" />
                    {label}
                  </span>
                  <span className="font-medium tabular-nums text-slate-800">{formatCurrency(amount)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                <span>Total Geral do Dia</span>
                <span className="tabular-nums">{formatCurrency(sessionGross)}</span>
              </li>
            </ul>

            {movements.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <History size={13} />
                  Movimentações do Dia
                </p>
                <ul className="space-y-1.5">
                  {movements.map((movement) => {
                    const isOutflow = movement.type === 'sangria'
                    const defaultLabel =
                      movement.type === 'suprimento'
                        ? 'Suprimento'
                        : movement.type === 'recebimento'
                          ? 'Recebimento de Crediário'
                          : 'Sangria'
                    return (
                      <li key={movement.id} className="flex items-center justify-between">
                        <span className={clsx('flex items-center gap-1.5', isOutflow ? 'text-red-600' : 'text-emerald-600')}>
                          {isOutflow ? <MinusCircle size={13} /> : <PlusCircle size={13} />}
                          {movement.description || defaultLabel}
                          {movement.type === 'recebimento' && movement.method && movement.method !== 'dinheiro' && (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                              {RECEIPT_METHOD_LABELS[movement.method] ?? movement.method}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums font-medium text-slate-700">
                          {isOutflow ? '-' : '+'}
                          {formatCurrency(movement.amount)}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Fundo de Troco Inicial</span>
                <span className="tabular-nums font-medium text-slate-800">
                  {formatCurrency(openingAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Vendas em Dinheiro</span>
                <span className="tabular-nums font-medium text-slate-800">
                  +{formatCurrency(sessionCashAmount - receiptsCashTotal)}
                </span>
              </div>
              {receiptsCashTotal > 0 && (
                <div className="flex items-center justify-between text-emerald-600">
                  <span>Recebimentos de Crediário (Dinheiro)</span>
                  <span className="tabular-nums font-medium">+{formatCurrency(receiptsCashTotal)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-emerald-600">
                <span>Suprimentos</span>
                <span className="tabular-nums font-medium">+{formatCurrency(suprimentosTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-red-600">
                <span>Sangrias</span>
                <span className="tabular-nums font-medium">-{formatCurrency(sangriasTotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                <span>Saldo Final em Caixa (Esperado)</span>
                <span className="tabular-nums">{formatCurrency(expectedCash)}</span>
              </div>
            </div>

            <div className="mt-3">
              <label
                htmlFor="physical-cash"
                className="text-xs font-medium uppercase tracking-wide text-slate-500"
              >
                Valor Físico Contado na Gaveta
              </label>
              <input
                id="physical-cash"
                type="number"
                step="0.01"
                min="0"
                value={physicalCash}
                onChange={(event) => setPhysicalCash(event.target.value)}
                placeholder="0,00"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {hasPhysicalCash && (
              <div
                className={clsx(
                  'mt-3 rounded-xl p-4 text-center',
                  cashDifferenceStatus === 'confere' && 'bg-emerald-50',
                  cashDifferenceStatus === 'falta' && 'bg-red-50',
                  cashDifferenceStatus === 'sobra' && 'bg-amber-50',
                )}
              >
                <p
                  className={clsx(
                    'text-xs font-bold uppercase tracking-[0.2em]',
                    cashDifferenceStatus === 'confere' && 'text-emerald-600',
                    cashDifferenceStatus === 'falta' && 'text-red-600',
                    cashDifferenceStatus === 'sobra' && 'text-amber-600',
                  )}
                >
                  {cashDifferenceStatus === 'confere' && 'Caixa Confere'}
                  {cashDifferenceStatus === 'falta' && 'Quebra de Caixa (Falta)'}
                  {cashDifferenceStatus === 'sobra' && 'Sobra de Caixa'}
                </p>
                <p
                  className={clsx(
                    'mt-1 text-3xl font-black tabular-nums',
                    cashDifferenceStatus === 'confere' && 'text-emerald-600',
                    cashDifferenceStatus === 'falta' && 'text-red-600',
                    cashDifferenceStatus === 'sobra' && 'text-amber-600',
                  )}
                >
                  {formatCurrency(Math.abs(cashDifference))}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={confirmClose}
              disabled={!hasPhysicalCash}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Lock size={16} />
              Confirmar Fechamento
            </button>
          </>
        ) : (
          closingSummary && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-1 pt-1 text-center">
                <CheckCircle2 size={36} className="text-emerald-500" />
                <p className="text-sm font-semibold text-slate-800">Caixa fechado com sucesso!</p>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="text-center text-sm font-bold uppercase leading-tight text-slate-900">
                  {settings?.fantasyName?.trim() || 'Minha Loja'}
                </p>
                {settings?.document?.trim() && (
                  <p className="text-center text-[10px] leading-tight text-slate-500">
                    CNPJ/CPF: {settings.document}
                  </p>
                )}
                <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Relatório de Fechamento de Caixa · {dateTimeFormatter.format(closingSummary.generatedAt ?? closingSummary.closedAt)}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-3 border-t border-slate-100 pt-2">
                  <div>
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <UserCircle2 size={12} />
                      Operador
                    </p>
                    <p className="mt-0.5 font-medium text-slate-800">{closingSummary.operatorName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Abertura</p>
                    <p className="mt-0.5 font-medium tabular-nums text-slate-800">
                      {dateTimeFormatter.format(closingSummary.openedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Fechamento</p>
                    <p className="mt-0.5 font-medium tabular-nums text-slate-800">
                      {dateTimeFormatter.format(closingSummary.closedAt)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-sm">
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Movimentação da Gaveta (Dinheiro)
                </p>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Fundo de Troco Inicial</span>
                  <span className="tabular-nums font-medium text-slate-800">
                    {formatCurrency(closingSummary.initialCash)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Vendas em Dinheiro</span>
                  <span className="tabular-nums font-medium text-slate-800">
                    +{formatCurrency(closingSummary.cashSales)}
                  </span>
                </div>
                {closingSummary.receiptsCash > 0 && (
                  <div className="flex items-center justify-between text-emerald-600">
                    <span>Recebimentos de Crediário</span>
                    <span className="tabular-nums font-medium">
                      +{formatCurrency(closingSummary.receiptsCash)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-emerald-600">
                  <span>Suprimentos</span>
                  <span className="tabular-nums font-medium">
                    +{formatCurrency(closingSummary.suprimentos)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-red-600">
                  <span>Sangrias Efetuadas</span>
                  <span className="tabular-nums font-medium">
                    -{formatCurrency(closingSummary.sangrias)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
                  <span>Saldo Final em Caixa (Esperado)</span>
                  <span className="tabular-nums">{formatCurrency(closingSummary.expectedCash)}</span>
                </div>
              </div>

              <div
                className={clsx(
                  'rounded-xl p-4 text-center',
                  closingSummary.differenceStatus === 'confere' && 'bg-emerald-50',
                  closingSummary.differenceStatus === 'falta' && 'bg-red-50',
                  closingSummary.differenceStatus === 'sobra' && 'bg-amber-50',
                )}
              >
                <p
                  className={clsx(
                    'flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em]',
                    closingSummary.differenceStatus === 'confere' && 'text-emerald-600',
                    closingSummary.differenceStatus === 'falta' && 'text-red-600',
                    closingSummary.differenceStatus === 'sobra' && 'text-amber-600',
                  )}
                >
                  <Scale size={13} />
                  {closingSummary.differenceStatus === 'confere' && 'Caixa Confere'}
                  {closingSummary.differenceStatus === 'falta' && 'Quebra de Caixa (Falta)'}
                  {closingSummary.differenceStatus === 'sobra' && 'Sobra de Caixa'}
                </p>
                <p
                  className={clsx(
                    'mt-1 text-3xl font-black tabular-nums',
                    closingSummary.differenceStatus === 'confere' && 'text-emerald-600',
                    closingSummary.differenceStatus === 'falta' && 'text-red-600',
                    closingSummary.differenceStatus === 'sobra' && 'text-amber-600',
                  )}
                >
                  {formatCurrency(Math.abs(closingSummary.difference))}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Totais por Forma de Pagamento
                </p>
                <ul className="space-y-1.5 rounded-lg border border-slate-200 p-3 text-sm">
                  {closingSummary.payments.map((method) => {
                    const tone = PAYMENT_TONE_CLASSES[method.tone]
                    const Icon = method.icon
                    return (
                      <li key={method.id} className="flex items-center justify-between text-slate-600">
                        <span className="flex items-center gap-2">
                          <span
                            className={clsx(
                              'flex h-6 w-6 items-center justify-center rounded-md',
                              tone.iconBg,
                            )}
                          >
                            <Icon size={13} className={tone.iconText} />
                          </span>
                          {method.label}
                        </span>
                        <span className="font-medium tabular-nums text-slate-800">
                          {formatCurrency(method.amount)}
                        </span>
                      </li>
                    )
                  })}
                  <li className="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
                    <span>Total Geral</span>
                    <span className="tabular-nums">{formatCurrency(closingSummary.grossTotal)}</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Imprimir Relatório do Dia
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => printClosingReceipt('58')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Printer size={14} />
                    Térmica 58mm
                  </button>
                  <button
                    type="button"
                    onClick={() => printClosingReceipt('80')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <Printer size={14} />
                    Térmica 80mm
                  </button>
                  <button
                    type="button"
                    onClick={() => printClosingReceipt('a4')}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <FileText size={14} />
                    A4 / PDF
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-1 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                >
                  Fechar
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
