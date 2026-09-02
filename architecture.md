# Arquitetura — PDV Sistema 2026

## Visão geral

Aplicação desktop de Ponto de Venda (PDV) construída como um app **Tauri 2.0**: a interface é uma SPA React renderizada em uma WebView nativa, enquanto operações sensíveis (banco de dados local, sistema de arquivos, impressão, hardware fiscal) rodam no processo Rust do host, isolado da WebView por um modelo de permissões explícito.

```
┌─────────────────────────────────────────────┐
│                Janela do App                 │
│  ┌─────────────────────────────────────────┐ │
│  │        WebView (frontend)                │ │
│  │  React + Vite + Tailwind CSS             │ │
│  │  lucide-react (ícones) · clsx (classes)  │ │
│  └───────────────────┬───────────────────────┘ │
│                      │ IPC (invoke/emit)        │
│  ┌───────────────────▼───────────────────────┐ │
│  │        Core Tauri (Rust)                  │ │
│  │  Commands · Plugins · Capabilities        │ │
│  └───────────────────┬───────────────────────┘ │
│                      │                          │
│  ┌───────────────────▼───────────────────────┐ │
│  │  Sistema operacional / hardware local     │ │
│  │  SO de arquivos, banco local, impressora, │ │
│  │  leitor de código de barras, gaveta, etc. │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Stack

| Camada | Tecnologia |
|---|---|
| Shell desktop | Tauri 2.0 (Rust) |
| Frontend | React 19 (JavaScript) + Vite |
| Estilo | Tailwind CSS v4 (via `@tailwindcss/vite`) |
| Ícones | lucide-react |
| Utilitário de classes | clsx |
| Empacotamento | Cargo (Rust) + npm (JS) |

## Estrutura de pastas

```
pdv-sistema-2026/
├── architecture.md        # este documento
├── index.html              # entrada HTML do Vite
├── vite.config.js          # config do Vite (porta 1420, plugin Tailwind)
├── package.json
├── public/                 # assets estáticos servidos como estão
├── src/                     # código-fonte do frontend (React)
│   ├── main.jsx             # bootstrap do React
│   ├── App.jsx               # componente raiz / navegação
│   └── index.css             # entrada do Tailwind CSS
└── src-tauri/               # backend nativo (Rust)
    ├── Cargo.toml
    ├── tauri.conf.json       # configuração do app Tauri (janela, bundle, build)
    ├── build.rs
    ├── capabilities/          # permissões concedidas à WebView
    ├── icons/                  # ícones do app para cada plataforma
    └── src/
        └── main.rs / lib.rs    # entrypoint Rust e comandos expostos ao frontend
```

## Fluxo de comunicação (IPC)

- O frontend React nunca acessa o sistema operacional diretamente.
- Toda operação sensível (ex.: gravar uma venda, emitir cupom fiscal, ler configurações locais) é exposta como um **command** Rust em `src-tauri/src`, invocado do React via `invoke('nome_do_comando', { ... })`.
- Eventos assíncronos (ex.: leitura de código de barras, status de impressora) trafegam via `emit`/`listen`.
- Permissões de cada comando/plugin são declaradas em `src-tauri/capabilities/`, seguindo o modelo de segurança por capacidades do Tauri 2.0 — nada é acessível por padrão.

## Módulos previstos do domínio PDV

- **Vendas**: abertura de venda, adição de itens, aplicação de descontos, fechamento e pagamento.
- **Produtos**: cadastro, consulta por código de barras, controle de estoque.
- **Clientes**: cadastro e histórico de compras.
- **Relatórios**: fechamento de caixa, vendas por período, produtos mais vendidos.

Cada módulo terá sua própria pasta em `src/features/<modulo>` no frontend, com os comandos Rust correspondentes agrupados em `src-tauri/src/commands/<modulo>.rs` (a estruturar conforme a implementação avançar).

## Persistência de dados

A definir: candidatos naturais para um PDV local-first são **SQLite** (via plugin `tauri-plugin-sql` ou crate `rusqlite`), garantindo funcionamento offline e sincronização posterior, se necessário.

## Build e distribuição

- **Desenvolvimento**: `npm run tauri dev` — sobe o Vite em `http://localhost:1420` e o Tauri observa mudanças no Rust.
- **Produção**: `npm run tauri build` — gera instalador nativo (MSI/NSIS no Windows) com o frontend compilado embutido.

> Nota: a compilação do binário Tauri requer o toolchain Rust (`rustup`, `cargo`) instalado na máquina. A estrutura do projeto já está pronta; a instalação do Rust é um pré-requisito separado para rodar `tauri dev`/`tauri build`.
