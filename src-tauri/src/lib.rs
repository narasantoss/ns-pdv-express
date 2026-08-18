use std::fs;
use std::net::UdpSocket;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

mod licensing;
use licensing::{ativar_serial, obter_hwid_maquina, verificar_status_licenca};

const DB_URL: &str = "sqlite:pdv_express.db";
const DB_FILE_NAME: &str = "pdv_express.db";

// O plugin `tauri-plugin-sql` resolve conexões `sqlite:` relativas ao
// diretório de configuração do app (`app_config_dir`) — não ao `app_data_dir`.
// Os comandos abaixo leem/gravam o mesmo arquivo bruto para o backup e a
// restauração do banco de dados local, feitos pela tela de Configurações.
#[tauri::command]
fn read_database_file(app: tauri::AppHandle) -> Result<Vec<u8>, String> {
  let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::read(dir.join(DB_FILE_NAME)).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_database_file(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
  let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  fs::write(dir.join(DB_FILE_NAME), bytes).map_err(|error| error.to_string())
}

// Descobre o IPv4 local deste computador na rede (usado como "Código de Conexão"
// exibido no PC Mestre para o Modo de Operação em Rede Local). Não envia nenhum
// dado de fato — abrir um socket UDP "conectado" a um IP externo apenas faz o
// sistema operacional escolher a interface/rota de saída, cujo endereço local é
// lido em seguida. Funciona offline, sem depender de internet real.
#[tauri::command]
fn get_local_ip() -> Result<String, String> {
  let socket = UdpSocket::bind("0.0.0.0:0").map_err(|error| error.to_string())?;
  socket.connect("8.8.8.8:80").map_err(|error| error.to_string())?;
  let addr = socket.local_addr().map_err(|error| error.to_string())?;
  Ok(addr.ip().to_string())
}

fn migrations() -> Vec<Migration> {
  vec![
    Migration {
      version: 1,
      description: "create_comandas_and_itens_comanda",
      sql: "
        CREATE TABLE IF NOT EXISTS comandas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          numero INTEGER NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'livre',
          total_acumulado REAL NOT NULL DEFAULT 0,
          data_abertura TEXT
        );

        CREATE TABLE IF NOT EXISTS itens_comanda (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          comanda_id INTEGER NOT NULL REFERENCES comandas(id) ON DELETE CASCADE,
          produto_id INTEGER NOT NULL,
          quantidade INTEGER NOT NULL,
          preco_unitario REAL NOT NULL,
          subtotal REAL NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_itens_comanda_comanda_id ON itens_comanda(comanda_id);
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "seed_comandas_01_a_30",
      sql: "
        INSERT INTO comandas (numero, status, total_acumulado, data_abertura)
        WITH RECURSIVE seq(n) AS (
          SELECT 1
          UNION ALL
          SELECT n + 1 FROM seq WHERE n < 30
        )
        SELECT n, 'livre', 0, NULL FROM seq;
      ",
      kind: MigrationKind::Up,
    },
    // Etapa 3: schema completo do PDV (produtos, clientes, vendas, orçamentos,
    // configurações e licença local). Ver espelho em src/services/db.js, que
    // define o mesmo schema para o fallback usado quando a UI roda no navegador
    // sem o shell Tauri (`npm run dev`).
    Migration {
      version: 3,
      description: "create_pdv_express_schema",
      sql: "
        CREATE TABLE IF NOT EXISTS produtos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo_barras TEXT,
          nome TEXT NOT NULL,
          categoria TEXT,
          preco_custo REAL NOT NULL DEFAULT 0,
          preco_venda REAL NOT NULL DEFAULT 0,
          estoque_atual REAL NOT NULL DEFAULT 0,
          estoque_minimo REAL NOT NULL DEFAULT 0,
          unidade_medida TEXT NOT NULL DEFAULT 'UN',
          dados_extra TEXT NOT NULL DEFAULT '{}',
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras);

        CREATE TABLE IF NOT EXISTS clientes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          telefone TEXT,
          cpf_cnpj TEXT,
          limite_credito REAL NOT NULL DEFAULT 0,
          saldo_devedor REAL NOT NULL DEFAULT 0,
          endereco TEXT NOT NULL DEFAULT '{}',
          historico TEXT NOT NULL DEFAULT '[]',
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_clientes_cpf_cnpj ON clientes(cpf_cnpj);

        CREATE TABLE IF NOT EXISTS vendas (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER REFERENCES clientes(id),
          operador TEXT,
          total_bruto REAL NOT NULL DEFAULT 0,
          desconto REAL NOT NULL DEFAULT 0,
          total_liquido REAL NOT NULL DEFAULT 0,
          forma_pagamento TEXT,
          status TEXT NOT NULL DEFAULT 'concluida',
          data_venda TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS itens_venda (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
          produto_id INTEGER REFERENCES produtos(id),
          quantidade REAL NOT NULL,
          preco_unitario REAL NOT NULL,
          subtotal REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_itens_venda_venda_id ON itens_venda(venda_id);

        CREATE TABLE IF NOT EXISTS orcamentos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER REFERENCES clientes(id),
          operador TEXT,
          total_bruto REAL NOT NULL DEFAULT 0,
          desconto REAL NOT NULL DEFAULT 0,
          total_liquido REAL NOT NULL DEFAULT 0,
          parcelas INTEGER NOT NULL DEFAULT 1,
          desconto_a_vista REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'aberto',
          data_orcamento TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          validade TEXT,
          dados_extra TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS itens_orcamento (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          orcamento_id INTEGER NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
          produto_id INTEGER REFERENCES produtos(id),
          quantidade REAL NOT NULL,
          preco_unitario REAL NOT NULL,
          subtotal REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_itens_orcamento_orcamento_id ON itens_orcamento(orcamento_id);

        CREATE TABLE IF NOT EXISTS configuracoes (
          chave TEXT PRIMARY KEY,
          valor TEXT
        );

        CREATE TABLE IF NOT EXISTS licenca_local (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chave_rsa TEXT,
          hwid_maquina TEXT,
          data_ativacao TEXT,
          status TEXT NOT NULL DEFAULT 'inativa'
        );
      ",
      kind: MigrationKind::Up,
    },
    // Roda uma única vez, na criação do banco: 5 produtos de exemplo
    // (vestuário/geral) e a flag `primeiro_acesso`, que dispara o Tutorial de
    // Boas-Vindas e o assistente de configuração inicial da loja.
    Migration {
      version: 4,
      description: "seed_produtos_e_configuracoes_iniciais",
      sql: "
        INSERT INTO produtos (codigo_barras, nome, categoria, preco_custo, preco_venda, estoque_atual, estoque_minimo, unidade_medida, dados_extra)
        VALUES
          ('7891500100301', 'Camiseta Polo Piquet', 'Vestuário', 15.0, 35.0, 29, 15, 'UN', '{}'),
          ('7891500200940', 'Tênis Esportivo Runner', 'Calçados', 95.0, 189.9, 32, 10, 'PAR', '{}'),
          ('7891500300100', 'Calça Jeans Slim', 'Vestuário', 45.0, 89.9, 20, 8, 'UN', '{}'),
          ('7891000100103', 'Arroz Branco 5kg', 'Mercearia', 16.5, 24.9, 42, 10, 'UN', '{}'),
          ('7891000900456', 'Refrigerante 2L', 'Bebidas', 5.5, 9.5, 36, 12, 'UN', '{}');

        INSERT INTO configuracoes (chave, valor) VALUES
          ('primeiro_acesso', 'true'),
          ('nome_empresa', ''),
          ('logo_empresa', ''),
          ('ip_mestre', ''),
          ('pin_gerente', '1234');
      ",
      kind: MigrationKind::Up,
    },
    // Migração de Delivery, Trocas e Financeiro para dados reais: essas telas
    // usavam dados mockados (MOCK_CLIENTS/MOCK_SALES fixos, histórico de
    // vendas gerado por PRNG) porque não existia tabela própria para elas na
    // Etapa 3. `vendas` ganha `dados_extra` (troco, valor recebido e o
    // detalhamento de pagamento misto, usados pelo Financeiro/Fechamento de
    // Caixa reais) e cada tela ganha sua tabela de domínio — ver espelho em
    // `src/services/db.js`.
    Migration {
      version: 5,
      description: "create_delivery_trocas_financeiro_schema",
      sql: "
        ALTER TABLE vendas ADD COLUMN dados_extra TEXT NOT NULL DEFAULT '{}';

        CREATE TABLE IF NOT EXISTS motoboys (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nome TEXT NOT NULL,
          cpf TEXT,
          telefone TEXT,
          placa TEXT
        );

        CREATE TABLE IF NOT EXISTS pedidos_delivery (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT,
          status TEXT NOT NULL DEFAULT 'pendente',
          cliente_id INTEGER REFERENCES clientes(id),
          cliente_nome TEXT,
          cliente_telefone TEXT,
          endereco TEXT NOT NULL DEFAULT '{}',
          ponto_referencia TEXT,
          taxa_entrega REAL NOT NULL DEFAULT 0,
          forma_pagamento TEXT,
          troco_para REAL,
          motoboy_id INTEGER REFERENCES motoboys(id),
          motoboy_nome TEXT,
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS itens_pedido_delivery (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pedido_id INTEGER NOT NULL REFERENCES pedidos_delivery(id) ON DELETE CASCADE,
          produto_id INTEGER REFERENCES produtos(id),
          nome TEXT,
          preco_unitario REAL NOT NULL DEFAULT 0,
          quantidade REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_itens_pedido_delivery_pedido_id ON itens_pedido_delivery(pedido_id);

        CREATE TABLE IF NOT EXISTS vales_credito (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT NOT NULL,
          cliente_nome TEXT,
          valor REAL NOT NULL DEFAULT 0,
          emitido_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expira_em TEXT,
          usado_em TEXT,
          status TEXT NOT NULL DEFAULT 'ativo'
        );

        CREATE TABLE IF NOT EXISTS sacolas_condicionais (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cliente_id INTEGER REFERENCES clientes(id),
          cliente_nome TEXT,
          cliente_telefone TEXT,
          cliente_cpf_cnpj TEXT,
          emprestado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          prazo_em TEXT,
          resolucao TEXT,
          decisoes TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS itens_sacola (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sacola_id INTEGER NOT NULL REFERENCES sacolas_condicionais(id) ON DELETE CASCADE,
          produto_id INTEGER REFERENCES produtos(id),
          nome TEXT,
          preco_unitario REAL NOT NULL DEFAULT 0,
          quantidade REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_itens_sacola_sacola_id ON itens_sacola(sacola_id);

        CREATE TABLE IF NOT EXISTS trocas_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo TEXT NOT NULL,
          cliente_nome TEXT,
          valor REAL NOT NULL DEFAULT 0,
          itens TEXT NOT NULL DEFAULT '[]',
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      ",
      kind: MigrationKind::Up,
    },
    // Envio direto do Frente de Caixa (F2) para o Delivery: o pedido passa a
    // carregar observações e a data prevista de entrega, informadas no
    // fechamento da venda — nenhuma coluna própria previa isso na Etapa 4,
    // então entram como um blob JSON, no mesmo padrão já usado por
    // `dados_extra` em produtos/vendas.
    Migration {
      version: 6,
      description: "add_dados_extra_to_pedidos_delivery",
      sql: "
        ALTER TABLE pedidos_delivery ADD COLUMN dados_extra TEXT NOT NULL DEFAULT '{}';
      ",
      kind: MigrationKind::Up,
    },
    // Módulo de Autorização/Trava por PIN do Gerente: toda autorização
    // concedida com o PIN do Gerente (estorno de venda/pedido, desconto acima
    // de 10%, sangria de caixa, ajuste manual de estoque) fica registrada
    // aqui para auditoria — data/hora (`criado_em`), o tipo da ação, o
    // motivo digitado pelo operador e quem estava logado no terminal.
    Migration {
      version: 7,
      description: "create_autorizacoes_gerente",
      sql: "
        CREATE TABLE IF NOT EXISTS autorizacoes_gerente (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tipo_acao TEXT NOT NULL,
          motivo TEXT NOT NULL DEFAULT '',
          operador TEXT,
          detalhes TEXT NOT NULL DEFAULT '{}',
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_autorizacoes_gerente_criado_em ON autorizacoes_gerente(criado_em);
      ",
      kind: MigrationKind::Up,
    },
    // Log de eventos/erros da tela de Logs & Diagnóstico (ver src/utils/appLog.js):
    // até esta migração, o log só existia em memória (buffer da sessão do
    // navegador/app), some a cada F5/reinício — não servia como histórico real
    // para suporte. Persistido aqui, sobrevive a reinícios/reload, igual à
    // auditoria de `autorizacoes_gerente`.
    Migration {
      version: 8,
      description: "create_logs_sistema",
      sql: "
        CREATE TABLE IF NOT EXISTS logs_sistema (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nivel TEXT NOT NULL,
          mensagem TEXT NOT NULL,
          detalhe TEXT,
          criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_logs_sistema_criado_em ON logs_sistema(criado_em);
      ",
      kind: MigrationKind::Up,
    },
    // Corrige o dado de teste "Camiseta Polo Piquet", seedado pela migration 4
    // com preço de custo/venda incorretos (R$28,00 / R$59,90), o que distorcia
    // os indicadores de margem no Dashboard. Roda como UPDATE (não re-seed)
    // para corrigir bancos já criados sem duplicar o produto.
    Migration {
      version: 9,
      description: "corrige_preco_camiseta_polo_piquet",
      sql: "
        UPDATE produtos SET preco_custo = 15.0, preco_venda = 35.0
        WHERE codigo_barras = '7891500100301';
      ",
      kind: MigrationKind::Up,
    },
    // Baixa de estoque por grade/variação (tamanho/cor): cada item de venda
    // guarda o código da variação exata debitada, para que o estorno (Trocas)
    // devolva a quantidade certa à variação certa, em vez de só ao estoque
    // agregado do produto-pai (ver `produtosRepo.adjustVariationStock` em
    // src/services/db.js).
    Migration {
      version: 10,
      description: "add_variacao_codigo_to_itens_venda",
      sql: "
        ALTER TABLE itens_venda ADD COLUMN variacao_codigo TEXT;
      ",
      kind: MigrationKind::Up,
    },
    // Suporte a produtos pesáveis/fracionados (Sacolão, Açougue, Feira):
    // `pesavel` marca o produto como vendido por peso/fração (habilita a
    // Venda por Peso (F9) e a leitura automática de etiqueta de balança no
    // PDV — ver src/utils/scaleBarcode.js) e `codigo_balanca` guarda o
    // código interno de 4-5 dígitos cadastrado na balança para esse produto.
    // `itens_venda.quantidade` já é REAL desde a migration 3 (create_pdv_
    // express_schema), suportando frações como 0.350/1.275 sem mudança aqui.
    Migration {
      version: 11,
      description: "add_pesavel_codigo_balanca_produtos",
      sql: "
        ALTER TABLE produtos ADD COLUMN pesavel INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE produtos ADD COLUMN codigo_balanca TEXT;
      ",
      kind: MigrationKind::Up,
    },
  ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations(DB_URL, migrations())
        .build(),
    )
    .invoke_handler(tauri::generate_handler![
      read_database_file,
      write_database_file,
      get_local_ip,
      obter_hwid_maquina,
      ativar_serial,
      verificar_status_licenca
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
