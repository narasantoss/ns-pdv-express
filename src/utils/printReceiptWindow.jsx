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
 * Imprime um documento térmico/A4 isoladamente, sem disparar a impressão da
 * página inteira do app.
 *
 * Usa um `<iframe>` oculto injetado na própria janela em vez de `window.open()`:
 * o WebView do Tauri (e navegadores com bloqueador de pop-ups agressivo) barra
 * `window.open`, o que fazia a rotina cair no `window.alert` "Não foi possível
 * abrir a janela de impressão. Verifique o bloqueador de pop-ups." — um diálogo
 * bloqueante, o oposto do que essa função deveria fazer. O iframe não é pop-up,
 * não precisa de gesto do usuário e funciona igual no Tauri e no navegador.
 *
 * O HTML do cupom é escrito no `contentDocument` do iframe e a impressão é
 * disparada em `iframe.contentWindow.print()`, então o diálogo nativo do SO só
 * enxerga a área do cupom. O iframe é removido no `afterprint` (ou por um
 * timeout de segurança, caso o evento não dispare).
 */
function printThermalDocument({ title, markup, pageCss }) {
  const previous = document.getElementById('thermal-print-frame')
  if (previous) previous.remove()

  const iframe = document.createElement('iframe')
  iframe.id = 'thermal-print-frame'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const frameWindow = iframe.contentWindow
  const frameDoc = frameWindow.document

  frameDoc.open()
  frameDoc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
${collectAppStyles()}
<style>
  @page { ${pageCss} }
  html, body { background: #fff; margin: 0; }
</style>
</head>
<body>${markup}</body>
</html>`)
  frameDoc.close()

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    // pequeno atraso para o diálogo nativo terminar de ler o documento antes
    // de o iframe ser desanexado
    setTimeout(() => iframe.remove(), 1000)
  }

  const triggerPrint = () => {
    try {
      frameWindow.focus()
      frameWindow.onafterprint = cleanup
      frameWindow.print()
    } catch (error) {
      console.error('Falha ao abrir a impressão do documento térmico', error)
    }
    // fallback: alguns WebViews não disparam `onafterprint`
    setTimeout(cleanup, 60000)
  }

  // dá tempo de os estilos (inclusive `<link>`) carregarem dentro do iframe
  if (frameDoc.readyState === 'complete') {
    setTimeout(triggerPrint, 300)
  } else {
    frameWindow.addEventListener('load', () => setTimeout(triggerPrint, 300), { once: true })
  }
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

// Imprime o cupom isoladamente, sem disparar a impressão da página inteira do
// app (que tem seu próprio layout de impressão A4).
export function printReceiptWindow(receiptProps) {
  const width = receiptProps.width ?? 80
  printThermalDocument({
    title: receiptProps.saleCode ? `Cupom ${receiptProps.saleCode}` : 'Cupom',
    markup: renderCopiesMarkup(ReceiptDocument, receiptProps),
    pageCss: `size: ${width}mm auto; margin: 3mm;`,
  })
}

// Imprime a via do motoboy (endereço, itens e troco) isoladamente, no mesmo
// padrão de bobina térmica (80mm/58mm) usado nos demais documentos.
export function printMotoboySlipWindow(slipProps) {
  const width = slipProps.width ?? 80
  printThermalDocument({
    title: slipProps.orderCode ? `Cupom de Entrega ${slipProps.orderCode}` : 'Cupom de Entrega',
    markup: renderCopiesMarkup(MotoboyReceiptDocument, slipProps),
    pageCss: `size: ${width}mm auto; margin: 3mm;`,
  })
}

// Imprime o Relatório de Fechamento de Caixa isoladamente.
// `closingProps.paper` escolhe o layout: '58' / '80' para bobina térmica
// não-fiscal ou 'a4' para folha inteira / PDF (mesma abordagem de
// printOrcamentoWindow).
export function printCashClosingWindow(closingProps) {
  const isA4 = closingProps.paper === 'a4'
  const width = closingProps.width ?? (isA4 ? 180 : 80)
  const markup = renderToStaticMarkup(<CashClosingReceiptDocument {...closingProps} width={width} />)
  printThermalDocument({
    title: 'Relatório de Fechamento de Caixa',
    markup,
    pageCss: isA4 ? 'size: A4; margin: 12mm;' : `size: ${width}mm auto; margin: 3mm;`,
  })
}

// Imprime um orçamento em janela isolada, no formato bobina térmica (80mm/58mm)
// ou folha A4, conforme `orcamentoProps.format`.
export function printOrcamentoWindow(orcamentoProps) {
  const isA4 = orcamentoProps.format === 'a4'
  const width = orcamentoProps.width ?? 80
  const markup = renderToStaticMarkup(<OrcamentoDocument {...orcamentoProps} />)
  printThermalDocument({
    title: orcamentoProps.code ? `Orçamento ${orcamentoProps.code}` : 'Orçamento',
    markup,
    pageCss: isA4 ? 'size: A4; margin: 12mm;' : `size: ${width}mm auto; margin: 3mm;`,
  })
}
