// Ferramenta interna (offline) da NS Sistemas para gerar a Chave de Ativação
// (RSA) enviada a um cliente — NÃO faz parte do app distribuído. Requer
// `licensing/private_key.pem` (gerado por `gerar_chaves`, nunca versionado).
//
// Uso, a partir de `src-tauri`:
//   cargo run --bin gerar_licenca -- NS-XXXX-XXXX-XXXX
//
// O HWID vem da tela de Ativação de Licença do cliente (TelaAtivacaoLicenca.jsx,
// link discreto de suporte no rodapé). A chave impressa é o que o cliente cola
// no campo "Chave de Licença Serial" daquela tela.
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rsa::pkcs8::DecodePrivateKey;
use rsa::{Pkcs1v15Sign, RsaPrivateKey};
use sha2::{Digest, Sha256};
use std::fs;

fn main() {
    let hwid = std::env::args().nth(1).unwrap_or_default();
    let hwid = hwid.trim();
    if hwid.is_empty() {
        eprintln!("Uso: cargo run --bin gerar_licenca -- NS-XXXX-XXXX-XXXX");
        std::process::exit(1);
    }

    let private_pem = fs::read_to_string("licensing/private_key.pem").unwrap_or_else(|_| {
        eprintln!(
            "Não encontrei licensing/private_key.pem. Rode primeiro `cargo run --bin gerar_chaves`."
        );
        std::process::exit(1);
    });
    let private_key =
        RsaPrivateKey::from_pkcs8_pem(&private_pem).expect("chave privada inválida em licensing/private_key.pem");

    let mut hasher = Sha256::new();
    hasher.update(hwid.as_bytes());
    let hashed = hasher.finalize();

    let signature = private_key
        .sign(Pkcs1v15Sign::new::<Sha256>(), &hashed)
        .expect("falha ao assinar o HWID");

    let chave = BASE64.encode(signature);
    println!("HWID: {hwid}");
    println!("Chave de Ativação (RSA): {chave}");
}
