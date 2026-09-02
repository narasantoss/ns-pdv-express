import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Store global da venda em andamento (Frente de Caixa / PDV).
 *
 * Motivo: em `src/App.jsx` cada tela é montada por renderização condicional
 * (`active === 'vendas' && <PDVMain />`). Sem um estado global, sair da aba
 * Vendas para Produtos, Clientes ou Configurações **desmonta** o `PDVMain` e
 * zera todo o carrinho. Mantendo carrinho / cliente / operador / desconto /
 * observações aqui, a venda sobrevive à troca de abas — e também a um F5,
 * porque o estado é espelhado no `sessionStorage` (limpa só quando o app é
 * fechado, o comportamento correto para um carrinho de PDV).
 *
 * O `PDVMain` continua dono da lógica rica de venda (bipagem, variações,
 * comandas, beeps). Ele consome daqui apenas `carrinho`, `desconto` e
 * `clienteSelecionado` através de setters compatíveis com o `setState` do
 * React (aceitam valor ou função updater), então nenhuma chamada existente
 * de `setCart(...)` / `setDiscount(...)` precisou mudar de assinatura.
 */

const ESTADO_INICIAL = {
  // Lista de itens: { id, productId, name, variationLabel, variationCode,
  // price, unit, qty, desconto? } — mesma forma usada por PDVMain.addToCart.
  carrinho: [],
  // Guarda apenas o id do cliente (o cadastro completo vem de ClientsContext).
  clienteSelecionado: null,
  // Nome do operador logado — preenchido pelo PDVMain a partir da sessão.
  operadorAtual: null,
  // Observação livre digitada para a venda (impressa no cupom / relatório).
  observacoesVenda: '',
  // Desconto do carrinho: { type: 'value' | 'percent', amount: number } | null.
  desconto: null,
}

/** Resolve `next` no estilo do setState do React: aceita valor ou `(prev) => valor`. */
function resolve(next, prev) {
  return typeof next === 'function' ? next(prev) : next
}

function mesclarItem(carrinho, item) {
  const index = carrinho.findIndex((linha) => linha.id === item.id)
  if (index >= 0) {
    const copia = [...carrinho]
    copia[index] = { ...copia[index], qty: copia[index].qty + (item.qty ?? 1) }
    return copia
  }
  return [...carrinho, { qty: 1, desconto: 0, ...item }]
}

export const usePdvStore = create(
  persist(
    (set, get) => ({
      ...ESTADO_INICIAL,

      // --- Setters compatíveis com o setState do React (valor ou updater) ---
      setCarrinho: (next) => set((estado) => ({ carrinho: resolve(next, estado.carrinho) })),
      setDesconto: (next) => set((estado) => ({ desconto: resolve(next, estado.desconto) })),
      setClienteSelecionado: (next) =>
        set((estado) => ({ clienteSelecionado: resolve(next, estado.clienteSelecionado) })),
      setOperadorAtual: (operador) => set({ operadorAtual: operador ?? null }),
      setObservacoesVenda: (next) =>
        set((estado) => ({ observacoesVenda: resolve(next, estado.observacoesVenda) })),

      // --- Ações de carrinho (API pedida pela especificação) ---
      adicionarItem: (item) => set((estado) => ({ carrinho: mesclarItem(estado.carrinho, item) })),

      removerItem: (id) =>
        set((estado) => ({ carrinho: estado.carrinho.filter((linha) => linha.id !== id) })),

      alterarQuantidade: (id, quantidade) =>
        set((estado) => ({
          carrinho: estado.carrinho
            .map((linha) => (linha.id === id ? { ...linha, qty: quantidade } : linha))
            .filter((linha) => linha.qty > 0),
        })),

      aplicarDesconto: (desconto) => set({ desconto: desconto ?? null }),

      limparCarrinho: () => set({ carrinho: [], desconto: null, observacoesVenda: '' }),

      /** Reset completo da venda — usado ao finalizar ou cancelar por inteiro. */
      limparVenda: () =>
        set({ carrinho: [], desconto: null, observacoesVenda: '', clienteSelecionado: null }),

      // Valores derivados (úteis para consumidores fora do PDVMain).
      subtotalCarrinho: () =>
        get().carrinho.reduce((soma, linha) => soma + linha.price * linha.qty, 0),
    }),
    {
      name: 'ns-pdv-express:venda-em-andamento',
      storage: createJSONStorage(() => window.sessionStorage),
      // O operador vem sempre da sessão ativa; não faz sentido persistir.
      partialize: (estado) => ({
        carrinho: estado.carrinho,
        clienteSelecionado: estado.clienteSelecionado,
        observacoesVenda: estado.observacoesVenda,
        desconto: estado.desconto,
      }),
    },
  ),
)

export default usePdvStore
