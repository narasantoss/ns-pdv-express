export const MOCK_CLIENTS = [
  {
    id: 1,
    name: 'Maria Oliveira',
    cpfCnpj: '123.456.789-00',
    phone: '(11) 98888-1234',
    creditLimit: 300,
    balance: 120,
    address: { cep: '01310-100', street: 'Av. Paulista', number: '1000', neighborhood: 'Bela Vista', city: 'São Paulo - SP' },
    history: [
      { id: 1, date: '2026-07-10', type: 'compra', amount: 150, description: 'Compra fiado - Frente de Caixa' },
      { id: 2, date: '2026-07-20', type: 'pagamento', amount: 30, description: 'Pagamento parcial' },
    ],
  },
  {
    id: 2,
    name: 'José Ferreira',
    cpfCnpj: '234.567.890-11',
    phone: '(11) 97777-5678',
    creditLimit: 500,
    balance: 480,
    address: { cep: '04538-133', street: 'Rua Funchal', number: '418', neighborhood: 'Vila Olímpia', city: 'São Paulo - SP' },
    history: [
      { id: 1, date: '2026-06-15', type: 'compra', amount: 300, description: 'Compra fiado - Frente de Caixa' },
      { id: 2, date: '2026-07-05', type: 'compra', amount: 250, description: 'Compra fiado - Frente de Caixa' },
      { id: 3, date: '2026-07-25', type: 'pagamento', amount: 70, description: 'Pagamento parcial' },
    ],
  },
  {
    id: 3,
    name: 'Patrícia Gomes',
    cpfCnpj: '345.678.901-22',
    phone: '(11) 96666-4321',
    creditLimit: 200,
    balance: 0,
    address: { cep: '05407-002', street: 'Rua Cardeal Arcoverde', number: '2365', neighborhood: 'Pinheiros', city: 'São Paulo - SP' },
    history: [
      { id: 1, date: '2026-06-01', type: 'compra', amount: 180, description: 'Compra fiado - Frente de Caixa' },
      { id: 2, date: '2026-06-20', type: 'pagamento', amount: 180, description: 'Quitação total' },
    ],
  },
  {
    id: 4,
    name: 'Roberto Dias',
    cpfCnpj: '456.789.012-33',
    phone: '(11) 95555-8765',
    creditLimit: 150,
    balance: 150,
    address: { cep: '03310-000', street: 'Rua Bresser', number: '100', neighborhood: 'Brás', city: 'São Paulo - SP' },
    history: [{ id: 1, date: '2026-07-01', type: 'compra', amount: 150, description: 'Compra fiado - Frente de Caixa' }],
  },
  {
    id: 5,
    name: 'Camila Torres',
    cpfCnpj: '12.345.678/0001-90',
    phone: '(11) 94444-2468',
    creditLimit: 400,
    balance: 65,
    address: { cep: '04094-050', street: 'Rua Vergueiro', number: '3185', neighborhood: 'Vila Mariana', city: 'São Paulo - SP' },
    history: [
      { id: 1, date: '2026-07-12', type: 'compra', amount: 90, description: 'Compra fiado - Frente de Caixa' },
      { id: 2, date: '2026-07-22', type: 'pagamento', amount: 25, description: 'Pagamento parcial' },
    ],
  },
]

export const EMPTY_ADDRESS = { cep: '', street: '', number: '', neighborhood: '', city: '' }

export function onlyDigits(value) {
  return (value ?? '').replace(/\D/g, '')
}

export function formatAddressSummary(address) {
  if (!address) return '—'
  const { street, number, neighborhood, city } = address
  if (!street && !city) return '—'
  const line = [street, number].filter(Boolean).join(', ')
  const rest = [neighborhood, city].filter(Boolean).join(', ')
  return [line, rest].filter(Boolean).join(' - ')
}
