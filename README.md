# 🛒 NS PDV Express 2026

> **Sistema Desktop de Frente de Caixa (PDV), Controle de Estoque e Gestão Comercial**
> Focado em pequenos comerciantes, alta performance, operação 100% offline e custo zero de infraestrutura.

---

## 📌 Sobre o Projeto

O **NS PDV Express 2026** é um software de automação comercial desenvolvido exclusivamente para **Windows (10 e 11)**. Ele combina a velocidade e baixo consumo de memória do **Tauri v2 (Rust)** com uma interface moderna e intuitiva construída em **React e TailwindCSS**.

Projetado para operar com **custo zero de servidor**, o sistema armazena todos os dados em um banco **SQLite local criptografado**, utiliza licenciamento seguro vinculado ao **Hardware ID (HWID)** da máquina e realiza atualizações automáticas via **GitHub Releases**.

---

## 🚀 Principais Funcionalidades

* **Frente de Caixa Rápida (PDV):**
  * Operação 100% por atalhos de teclado (`F2` finalizar, `F4` busca express, `F8` cancelar item, `F9` peso/fração).
  * Compatível com leitores de código de barras USB.
  * Cadastro express na tela de vendas para itens não cadastrados.
  * Multi-pagamento (Dinheiro, PIX, Cartão Débito/Crédito e Crediário/Fiado).
  * Emissão de comprovante térmico não-fiscal (58mm, 80mm Esc/POS e A4).

* **Controle de Estoque & Produtos:**
  * Cadastro completo com código de barras, fotos, preço de custo, margem e estoque mínimo.
  * Alertas visuais e sonoros de reposição de estoque.
  * Importação e exportação de produtos via planilhas (CSV / Excel).
  * Gerador e impressor de etiquetas de produtos e gôndolas.

* **Trocas & Condicionais:**
  * Registro ágil de devoluções com estorno automático no estoque e geração de crédito em caixa.
  * Gestão de mercadorias em condicional/consignado.

* **Gestão de Clientes & Crediário (Fiado):**
  * Histórico de compras e saldo devedor individual.
  * Impressão de carnês e promissórias em bobina ou A4.
  * Controle de baixas parciais e totais de débitos.

* **Financeiro & Fechamento:**
  * Abertura, suprimentos, sangrias e fechamento de caixa diário.
  * Relatório de fechamento com impressão térmica consolidada por operadora/forma de pagamento.
  * Dashboard de faturamento, lucro líquido real e curva ABC de produtos.

* **Segurança & Licenciamento:**
  * Licença vitalícia de 1 PC vinculada ao HWID da placa-mãe.
  * Validação offline com criptografia assimétrica RSA-2048.
  * Rotina de backup local compactado em `.zip`.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Finalidade |
| :--- | :--- | :--- |
| **Shell Desktop** | [Tauri v2](https://v2.tauri.app/) (Rust) | Engine leve (~15MB), comunicação nativa com o Windows |
| **Frontend** | [React](https://react.dev/) + [TailwindCSS](https://tailwindcss.com/) | Interface responsiva, atalhos globais e modais |
| **Gerenciamento de Estado** | [Zustand](https://github.com/pmndrs/zustand) | Persistência de carrinho e formulários entre abas |
| **Banco de Dados Local** | [SQLite](https://www.sqlite.org/) + [Kysely](https://kysely.dev/) | Armazenamento local seguro em `%APPDATA%` |
| **Segurança & Licença** | RSA-2048 + HWID (Rust) | Validação offline de ativação por máquina |
| **CI/CD & Updates** | GitHub Actions + Releases | Compilação automática de instalador `.exe` e auto-updater |

---

## 📂 Estrutura de Pastas

```text
nspdv-express/
├── .github/workflows/        # Pipelines do GitHub Actions (Build do .exe)
├── src/                      # Frontend (React + TailwindCSS)
│   ├── components/           # Componentes modulares (PDV, Estoque, Caixa, Modais)
│   ├── database/             # Schemas e migrações SQLite/Kysely
│   ├── hooks/                # Hooks customizados para atalhos de teclado
│   ├── store/                # Estados globais (usePdvStore via Zustand)
│   ├── App.jsx               # Roteamento e persistência de abas
│   └── main.jsx              # Ponto de entrada React
├── src-tauri/                # Backend Nativo (Rust)
│   ├── src/
│   │   ├── commands/         # Leitura de HWID, validação RSA e impressão Esc/POS
│   │   ├── main.rs           # Ponto de entrada Tauri
│   │   └── lib.rs            # Registro de plugins e comandos IPC
│   ├── Cargo.toml            # Dependências Rust
│   └── tauri.conf.json       # Configurações de janela, ícones e permissões
├── package.json              # Dependências Node.js
└── README.md                 # Documentação do projeto
```

---

## 💻 Desenvolvimento

Pré-requisitos: **Node.js 20+**, **Rust (stable)** e as [dependências de sistema do Tauri v2](https://v2.tauri.app/start/prerequisites/).

```bash
npm install          # instala as dependências do frontend
npm run dev          # sobe o Vite (frontend isolado no navegador)
npm run tauri dev    # sobe o app desktop completo (Tauri + Vite)
```

## 📦 Build

```bash
npm run build        # gera o bundle de produção do frontend (dist/)
npm run tauri build  # compila o instalador .exe / .msi para Windows
```

O `npm run lint` roda o **oxlint** sobre `src/`.

---

## 📄 Licença

Software proprietário — © NS Sistemas. Todos os direitos reservados.
