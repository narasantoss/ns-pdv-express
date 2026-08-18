// Parser de etiqueta de balança (EAN-13, prefixo "2") — o padrão que balanças
// de Sacolão/Açougue/Feira usam para imprimir um código de barras com o valor
// já pesado embutido, para bipar direto no PDV sem digitar nada.
//
// Formato dos 13 dígitos: 2 CCCCC VVVVVV D
//   - dígito 1: prefixo fixo '2' (uso interno / peso variável)
//   - dígitos 2-6 (5 dígitos): código interno do produto — o mesmo
//     cadastrado em Produtos → Pesável → Código da Balança
//   - dígitos 7-12 (6 dígitos): valor pago impresso na etiqueta, em centavos
//   - dígito 13: dígito verificador do EAN-13 (a conferência de integridade
//     já é feita pelo leitor/scanner, não recalculada aqui)

/** Normaliza um código de balança para comparação — remove tudo que não for dígito e zeros à esquerda, para "00123" e "123" baterem. */
export function normalizeScaleCode(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const stripped = digits.replace(/^0+/, '')
  return stripped || (digits ? '0' : '')
}

/**
 * Tenta interpretar `code` como etiqueta de balança. Retorna `null` se não
 * bater com o formato (13 dígitos, prefixo '2') — nesse caso quem chamou
 * deve seguir o fluxo normal de busca por código de barras.
 */
export function parseScaleBarcode(code) {
  const digits = String(code ?? '').replace(/\D/g, '')
  if (digits.length !== 13 || digits[0] !== '2') return null

  const scaleCode = digits.slice(1, 6)
  const valorPagoCentavos = Number.parseInt(digits.slice(6, 12), 10)
  if (!Number.isFinite(valorPagoCentavos)) return null

  return {
    scaleCode,
    valorPago: valorPagoCentavos / 100,
  }
}
