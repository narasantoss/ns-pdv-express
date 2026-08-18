// Utilitários de CSV para a importação/exportação de produtos em planilha.
// Mantém o parser propositalmente simples (sem dependências externas): cobre
// campos entre aspas com vírgula/quebra de linha escapados, que é o que o
// Excel/Google Sheets geram ao exportar para CSV.

export const PRODUCT_IMPORT_COLUMNS = [
  { key: 'nome', label: 'nome', required: true, description: 'Nome do produto' },
  { key: 'codigo_barras', label: 'codigo_barras', required: true, description: 'Código de barras (EAN) — único' },
  { key: 'categoria', label: 'categoria', required: false, description: 'Nome da categoria (criada automaticamente se não existir)' },
  { key: 'preco_custo', label: 'preco_custo', required: false, description: 'Preço de custo, use ponto decimal (ex: 12.50)' },
  { key: 'preco_venda', label: 'preco_venda', required: true, description: 'Preço de venda, use ponto decimal (ex: 19.90)' },
  { key: 'unidade', label: 'unidade', required: false, description: 'UN, KG, PAR ou CX (padrão: UN)' },
  { key: 'estoque_atual', label: 'estoque_atual', required: false, description: 'Quantidade em estoque (padrão: 0)' },
  { key: 'estoque_minimo', label: 'estoque_minimo', required: false, description: 'Estoque mínimo para alerta (padrão: 0)' },
]

export function downloadTextFile(filename, content, mimeType = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",;\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function buildProductImportTemplate() {
  const header = PRODUCT_IMPORT_COLUMNS.map((column) => column.label).join(',')
  const sampleRows = [
    ['Arroz Branco 5kg', '7891000100103', 'Mercearia', '16.50', '24.90', 'UN', '42', '10'],
    ['Refrigerante 2L', '7891000100806', 'Bebidas', '5.80', '9.50', 'UN', '30', '8'],
  ].map((row) => row.map(csvEscape).join(','))
  return [header, ...sampleRows].join('\n')
}

/**
 * Gera o CSV de exportação com todos os produtos cadastrados, nos mesmos
 * cabeçalhos usados pela importação. Produtos com grade de tamanho/cor viram
 * uma linha por variação (cada uma com seu próprio código de barras/estoque),
 * já que o formato flat de CSV não representa a grade como um todo.
 */
export function buildProductsExportCsv(products) {
  const header = PRODUCT_IMPORT_COLUMNS.map((column) => column.label).join(',')

  const rows = []
  products.forEach((product) => {
    if (product.hasVariations && product.variations.length > 0) {
      product.variations.forEach((variation) => {
        const comboLabel = [product.name, variation.color, variation.size].filter(Boolean).join(' - ')
        rows.push([
          comboLabel,
          variation.code || '',
          product.category || '',
          product.costPrice ?? 0,
          product.price ?? 0,
          product.unit || 'UN',
          variation.stock ?? 0,
          product.minStock ?? 0,
        ])
      })
    } else {
      rows.push([
        product.name,
        product.code || '',
        product.category || '',
        product.costPrice ?? 0,
        product.price ?? 0,
        product.unit || 'UN',
        product.stock ?? 0,
        product.minStock ?? 0,
      ])
    }
  })

  const lines = rows.map((row) => row.map(csvEscape).join(','))
  return [header, ...lines].join('\n')
}

/** Dispara o download de dados binários (ex.: arquivo .db) como um Blob. */
export function downloadBinaryFile(filename, bytes, mimeType = 'application/octet-stream') {
  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// Parser de linha CSV com suporte a campos entre aspas (RFC 4180 simplificado).
function parseCsvLine(line) {
  const fields = []
  let current = ''
  let insideQuotes = false

  for (let index = 0; index < line.length; index++) {
    const char = line[index]

    if (insideQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"'
        index++
      } else if (char === '"') {
        insideQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      insideQuotes = true
    } else if (char === ',' || char === ';') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields.map((field) => field.trim())
}

function parseDecimal(value) {
  if (value === undefined || value === '') return 0
  const normalized = value.toString().replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseInteger(value) {
  if (value === undefined || value === '') return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

const VALID_UNITS = new Set(['UN', 'KG', 'G', 'MT', 'L', 'PAR', 'CX'])

/**
 * Lê o texto de um CSV de produtos e retorna { rows, errors }.
 * `rows` contém apenas as linhas válidas, já normalizadas para o formato
 * usado pelo cadastro de produtos; `errors` lista problemas por linha
 * (linha 1 = cabeçalho, dados começam na linha 2).
 */
export function parseProductImportCsv(text) {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { rows: [], errors: ['Arquivo vazio.'] }
  }

  const header = parseCsvLine(lines[0]).map((cell) => cell.toLowerCase())
  const columnIndex = {}
  PRODUCT_IMPORT_COLUMNS.forEach((column) => {
    columnIndex[column.key] = header.indexOf(column.label)
  })

  const missingRequiredColumns = PRODUCT_IMPORT_COLUMNS.filter(
    (column) => column.required && columnIndex[column.key] === -1,
  )
  if (missingRequiredColumns.length > 0) {
    return {
      rows: [],
      errors: [
        `Colunas obrigatórias ausentes no cabeçalho: ${missingRequiredColumns
          .map((column) => column.label)
          .join(', ')}.`,
      ],
    }
  }

  const rows = []
  const errors = []

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const cells = parseCsvLine(lines[lineIndex])
    const get = (key) => (columnIndex[key] >= 0 ? cells[columnIndex[key]] ?? '' : '')

    const name = get('nome').trim()
    const code = get('codigo_barras').trim()
    const price = parseDecimal(get('preco_venda'))
    const rowNumber = lineIndex + 1

    if (!name) {
      errors.push(`Linha ${rowNumber}: nome do produto é obrigatório.`)
      continue
    }
    if (!code) {
      errors.push(`Linha ${rowNumber}: código de barras é obrigatório.`)
      continue
    }
    if (price <= 0) {
      errors.push(`Linha ${rowNumber}: preço de venda inválido.`)
      continue
    }

    const unit = get('unidade').trim().toUpperCase()

    rows.push({
      name,
      code,
      category: get('categoria').trim(),
      costPrice: parseDecimal(get('preco_custo')),
      price,
      unit: VALID_UNITS.has(unit) ? unit : 'UN',
      stock: parseInteger(get('estoque_atual')),
      minStock: parseInteger(get('estoque_minimo')),
    })
  }

  return { rows, errors }
}
