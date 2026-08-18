#!/usr/bin/env node
// Ferramenta interna (offline) da NS Sistemas para gerar a Chave de Ativação
// (RSA) enviada a um comprador do Mercado Livre — NÃO faz parte do app
// distribuído. Requer `src-tauri/licensing/private_key.pem` (gerado por
// `cargo run --bin gerar_chaves`, nunca versionado). Equivalente em Node.js
// de `src-tauri/src/bin/gerar_licenca.rs` — mesma assinatura RSASSA-PKCS1-v1_5
// com SHA-256 sobre o HWID, então as duas ferramentas produzem chaves idênticas.
//
// Uso:
//   node tools/gerar-licenca.js --hwid NS-XXXX-XXXX-XXXX
//
// O HWID vem da tela de Ativação de Licença do cliente (TelaAtivacaoLicenca.jsx,
// botão "Copiar HWID"). A chave impressa é o que o comprador cola no campo
// "Chave de Ativação (RSA)" daquela tela.

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRIVATE_KEY_PATH = join(__dirname, "..", "src-tauri", "licensing", "private_key.pem");

function parseHwid(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--hwid") return argv[i + 1];
    if (argv[i].startsWith("--hwid=")) return argv[i].slice("--hwid=".length);
  }
  return undefined;
}

const hwid = parseHwid(process.argv.slice(2))?.trim();

if (!hwid) {
  console.error("Uso: node tools/gerar-licenca.js --hwid NS-XXXX-XXXX-XXXX");
  process.exit(1);
}

let privateKeyPem;
try {
  privateKeyPem = readFileSync(PRIVATE_KEY_PATH, "utf8");
} catch {
  console.error(
    `Não encontrei ${PRIVATE_KEY_PATH}. Rode primeiro "cargo run --bin gerar_chaves" (dentro de src-tauri).`
  );
  process.exit(1);
}

const chave = createSign("RSA-SHA256").update(hwid).end().sign(privateKeyPem, "base64");

console.log(`HWID: ${hwid}`);
console.log(`Chave de Ativação (RSA): ${chave}`);
