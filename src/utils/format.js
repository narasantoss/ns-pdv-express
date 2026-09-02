const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0)
}

/** Arredonda um valor monetário para 2 casas decimais, eliminando dízimas de ponto flutuante (ex.: 0.1 + 0.2). */
export function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

/** Arredonda uma quantidade fracionada (peso/comprimento) para 3 casas decimais — precisão usada por produtos pesáveis (Sacolão/Açougue/Feira). */
export function roundQty(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000
}
