import { createContext, useContext, useState } from 'react'
import { useStoreSettings } from './StoreSettingsContext'
import { useSession } from './SessionContext'
import { isSupervisorRole } from './OperatorsContext'
import { autorizacoesGerenteRepo } from '../services/db'
import ModalAutorizacaoGerente from '../components/common/ModalAutorizacaoGerente'

// Tipos de ação do Módulo de Autorização por PIN do Gerente — usados tanto
// para rotular a modal quanto como `tipo_acao` gravado em `autorizacoes_gerente`.
export const MANAGER_ACTIONS = {
  ESTORNO_VENDA: 'estorno_venda',
  ESTORNO_TROCA: 'estorno_troca',
  CANCELAMENTO_PEDIDO: 'cancelamento_pedido',
  DESCONTO: 'desconto_acima_10',
  SANGRIA: 'sangria_caixa',
  SUPRIMENTO: 'suprimento_caixa',
  FECHAMENTO_CAIXA: 'fechamento_caixa',
  AJUSTE_ESTOQUE: 'ajuste_estoque',
  VENDA_SEM_ESTOQUE: 'venda_sem_estoque',
  EXCLUSAO_PRODUTO: 'exclusao_produto',
  EXCLUSAO_CATEGORIA: 'exclusao_categoria',
  EXCLUSAO_FORNECEDOR: 'exclusao_fornecedor',
}

// Rótulos amigáveis de cada `tipo_acao` — usados pela tela de Logs &
// Diagnóstico para exibir a auditoria de `autorizacoes_gerente` (ver
// src/components/logs/LogsMain.jsx).
export const MANAGER_ACTION_LABELS = {
  [MANAGER_ACTIONS.ESTORNO_VENDA]: 'Estorno de Venda',
  [MANAGER_ACTIONS.ESTORNO_TROCA]: 'Estorno em Trocas',
  [MANAGER_ACTIONS.CANCELAMENTO_PEDIDO]: 'Cancelamento de Pedido',
  [MANAGER_ACTIONS.DESCONTO]: 'Desconto acima de 10%',
  [MANAGER_ACTIONS.SANGRIA]: 'Sangria de Caixa',
  [MANAGER_ACTIONS.SUPRIMENTO]: 'Suprimento de Caixa',
  [MANAGER_ACTIONS.FECHAMENTO_CAIXA]: 'Fechamento de Caixa',
  [MANAGER_ACTIONS.AJUSTE_ESTOQUE]: 'Ajuste Manual de Estoque',
  [MANAGER_ACTIONS.VENDA_SEM_ESTOQUE]: 'Venda Sem Estoque',
  [MANAGER_ACTIONS.EXCLUSAO_PRODUTO]: 'Exclusão de Produto',
  [MANAGER_ACTIONS.EXCLUSAO_CATEGORIA]: 'Exclusão de Categoria',
  [MANAGER_ACTIONS.EXCLUSAO_FORNECEDOR]: 'Exclusão de Fornecedor',
}

const ManagerAuthContext = createContext(null)

/**
 * Controla a modal única de Autorização de Gerente (ModalAutorizacaoGerente)
 * usada por todo o app sempre que uma ação sensível exige o PIN do Gerente:
 * estorno/cancelamento de venda, desconto acima de 10%, sangria/suprimento
 * de caixa, fechamento de caixa e ajuste manual de estoque.
 *
 * O PIN só é pedido a operadores comuns (role 'operador') — quem já está
 * logado como Gerente ou Admin (`isSupervisorRole`, ver OperatorsContext) É
 * a própria aprovação de nível superior que o PIN existe para exigir, então
 * `requestAuthorization` libera a ação direto, sem abrir a modal. Em ambos
 * os casos a autorização fica registrada em `autorizacoes_gerente` (data/hora,
 * tipo da ação, motivo e operador logado) para auditoria.
 *
 * `requestAuthorization` retorna o controle para a tela chamadora via
 * `onAuthorized(motivo)` — chamado só depois do PIN conferir (operador comum)
 * ou imediatamente (Gerente/Admin). Quem chama só precisa executar a ação de
 * fato (estornar, aplicar o desconto, lançar a sangria, salvar o novo
 * estoque). O operador do caixa nunca é deslogado — a modal só fecha (quando
 * chega a abrir) e a ação segue no mesmo terminal/sessão.
 */
export function ManagerAuthProvider({ children }) {
  const { settings } = useStoreSettings()
  const { currentOperator } = useSession()
  const [request, setRequest] = useState(null)
  const [busy, setBusy] = useState(false)

  async function logAuthorization({ tipoAcao, motivo, detalhes }) {
    try {
      await autorizacoesGerenteRepo.create({
        tipoAcao,
        motivo,
        operador: currentOperator?.name ?? '',
        detalhes,
      })
    } catch (error) {
      console.error('[manager-auth] Falha ao registrar autorização do gerente:', error)
    }
  }

  function requestAuthorization({
    tipoAcao,
    title,
    description,
    detailLabel,
    requireMotivo = false,
    motivoLabel,
    motivoPlaceholder,
    initialMotivo = '',
    confirmLabel,
    detalhes,
    onAuthorized,
  }) {
    // Gerente/Admin: libera na hora, sem pedir PIN — só registra a auditoria
    // com o motivo já informado pela tela chamadora (quando houver).
    if (isSupervisorRole(currentOperator)) {
      logAuthorization({ tipoAcao, motivo: initialMotivo, detalhes })
      onAuthorized?.(initialMotivo)
      return
    }

    setRequest({
      tipoAcao,
      title,
      description,
      detailLabel,
      requireMotivo,
      motivoLabel,
      motivoPlaceholder,
      initialMotivo,
      confirmLabel,
      detalhes,
      onAuthorized,
    })
  }

  function cancelAuthorization() {
    if (busy) return
    setRequest(null)
  }

  async function submitAuthorization(pin, motivo) {
    if (!request) return false
    if (pin !== settings.adminPin) return false

    setBusy(true)
    await logAuthorization({ tipoAcao: request.tipoAcao, motivo, detalhes: request.detalhes })
    setBusy(false)

    const onAuthorized = request.onAuthorized
    setRequest(null)
    onAuthorized?.(motivo)
    return true
  }

  return (
    <ManagerAuthContext.Provider value={{ requestAuthorization }}>
      {children}
      <ModalAutorizacaoGerente
        open={!!request}
        title={request?.title}
        description={request?.description}
        detailLabel={request?.detailLabel}
        requireMotivo={request?.requireMotivo}
        motivoLabel={request?.motivoLabel}
        motivoPlaceholder={request?.motivoPlaceholder}
        initialMotivo={request?.initialMotivo}
        confirmLabel={request?.confirmLabel}
        busy={busy}
        onCancel={cancelAuthorization}
        onSubmit={submitAuthorization}
      />
    </ManagerAuthContext.Provider>
  )
}

export function useManagerAuth() {
  const context = useContext(ManagerAuthContext)
  if (!context) {
    throw new Error('useManagerAuth must be used within a ManagerAuthProvider')
  }
  return context
}
