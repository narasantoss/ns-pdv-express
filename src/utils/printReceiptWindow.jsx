import { renderToStaticMarkup } from 'react-dom/server'
import ReceiptDocument from '../components/common/ReceiptDocument'
import CashClosingReceiptDocument from '../components/common/CashClosingReceiptDocument'
import MotoboyReceiptDocument from '../components/common/MotoboyReceiptDocument'
import OrcamentoDocument from '../components/common/OrcamentoDocument'

function collectAppStyles() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join('\n')
}

/**
 * Abre a janela de impressão já aqui, de forma síncrona — `window.open`
 * precisa rodar ainda dentro do gesto do usuário (clique) para não ser
 * barrado pelo bloqueador de pop-ups do navegador; adiar essa chamada faz o
 * Chrome tratá-la como pop-up não solicitado e bloqueá-la (caindo no
 * `window.alert` de erro, que É um diálogo bloqueante — o oposto do que essa
 * função existe para evitar). Só o preenchimento do conteúdo e o
 * `popup.print()` (diálogo nativo do SO, bloqueante) é que são adiados via
 * `setTimeout(0)` para depois do próximo repaint — assim o React já pintou o
 * feedback de sucesso ("Venda finalizada!") antes da tela de impressão
 * roubar o foco.
 */
function openPrintPopup(windowFeatures) {
  return window.open('', '_blank', windowFeatures)
}

function runDecoupled(fn) {
  setTimeout(fn, 0)
}

// Renderiza `Component` uma vez para cada via escolhida (1/2/3), separadas
// por quebra de página — assim o operador escolhe "2 Vias"/"3 Vias" e um
// único job de impressão sai com todas as cópias, sem reabrir o diálogo de
// impressão. Cada cópia recebe `viaNumber` (1ª, 2ª, 3ª...) para estampar a
// numeração dinâmica da via no topo do cupom, em vez de um texto fixo.
function renderCopiesMarkup(Component, props) {
  const total = Math.max(1, Number.parseInt(props.copies, 10) || 1)
  return Array.from({ length: total }, (_, index) => {
    const viaNumber = index + 1
    const isLast = viaNumber === total
    const markup = renderToStaticMarkup(<Component {...props} viaNumber={viaNumber} totalVias={total} />)
    return `<div${isLast ? '' : ' style="page-break-after: always;"'}>${markup}</div>`
  }).join('\n')
}

// Imprime o cupom isoladamente em uma nova janela, sem disparar a impressão
// da página inteira do app (que tem seu próprio layout de impressão A4).
export function printReceiptWindow(receiptProps) {
  const popup = openPrintPopup('width=420,height=640')

  if (!popup) {
    window.alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }

  runDecoupled(() => {
    const width = receiptProps.width ?? 80
    const markup = renderCopiesMarkup(ReceiptDocument, receiptProps)

    popup.document.open()
    popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${receiptProps.saleCode ? `Cupom ${receiptProps.saleCode}` : 'Cupom'}</title>
${collectAppStyles()}
<style>
  @page { size: ${width}mm auto; margin: 3mm; }
  html, body { background: #fff; margin: 0; }
</style>
</head>
<body>${markup}</body>
</html>`)
    popup.document.close()

    popup.onafterprint = () => popup.close()

    setTimeout(() => {
      popup.focus()
      popup.print()
    }, 300)
  })
}

// Imprime a via do motoboy (endereço, itens e troco) isoladamente em uma nova janela,
// no mesmo padrão de bobina térmica (80mm/58mm) usado nos demais documentos.
export function printMotoboySlipWindow(slipProps) {
  const popup = openPrintPopup('width=420,height=640')

  if (!popup) {
    window.alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }

  runDecoupled(() => {
    const width = slipProps.width ?? 80
    const markup = renderCopiesMarkup(MotoboyReceiptDocument, slipProps)

    popup.document.open()
    popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${slipProps.orderCode ? `Cupom de Entrega ${slipProps.orderCode}` : 'Cupom de Entrega'}</title>
${collectAppStyles()}
<style>
  @page { size: ${width}mm auto; margin: 3mm; }
  html, body { background: #fff; margin: 0; }
</style>
</head>
<body>${markup}</body>
</html>`)
    popup.document.close()

    popup.onafterprint = () => popup.close()

    setTimeout(() => {
      popup.focus()
      popup.print()
    }, 300)
  })
}

// Imprime o comprovante de fechamento de caixa isoladamente em uma nova janela,
// no mesmo padrão da bobina térmica (80mm/58mm) usada nos cupons de venda.
export function printCashClosingWindow(closingProps) {
  const popup = openPrintPopup('width=420,height=640')

  if (!popup) {
    window.alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }

  runDecoupled(() => {
    const width = closingProps.width ?? 80
    const markup = renderToStaticMarkup(<CashClosingReceiptDocument {...closingProps} />)

    popup.document.open()
    popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Comprovante de Fechamento de Caixa</title>
${collectAppStyles()}
<style>
  @page { size: ${width}mm auto; margin: 3mm; }
  html, body { background: #fff; margin: 0; }
</style>
</head>
<body>${markup}</body>
</html>`)
    popup.document.close()

    popup.onafterprint = () => popup.close()

    setTimeout(() => {
      popup.focus()
      popup.print()
    }, 300)
  })
}

// Imprime um orçamento em janela isolada, no formato bobina térmica (80mm/58mm)
// ou folha A4, conforme `orcamentoProps.format`.
export function printOrcamentoWindow(orcamentoProps) {
  const isA4 = orcamentoProps.format === 'a4'
  const popup = openPrintPopup(isA4 ? 'width=900,height=1000' : 'width=420,height=640')

  if (!popup) {
    window.alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.')
    return
  }

  runDecoupled(() => {
    const width = orcamentoProps.width ?? 80
    const markup = renderToStaticMarkup(<OrcamentoDocument {...orcamentoProps} />)

    popup.document.open()
    popup.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${orcamentoProps.code ? `Orçamento ${orcamentoProps.code}` : 'Orçamento'}</title>
${collectAppStyles()}
<style>
  @page { ${isA4 ? 'size: A4; margin: 12mm;' : `size: ${width}mm auto; margin: 3mm;`} }
  html, body { background: #fff; margin: 0; }
</style>
</head>
<body>${markup}</body>
</html>`)
    popup.document.close()

    popup.onafterprint = () => popup.close()

    setTimeout(() => {
      popup.focus()
      popup.print()
    }, 300)
  })
}
