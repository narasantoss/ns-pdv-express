// Ferramenta interna (offline) da NS Sistemas para gerar o par de chaves
// RSA-2048 do Módulo de Licenciamento — NÃO faz parte do app distribuído ao
// cliente. Rodar uma única vez com `cargo run --bin gerar_chaves` a partir de
// `src-tauri`: grava `licensing/public_key.pem` (embutida no app via
// `include_str!` em `src/licensing.rs`, pode ir para o controle de versão) e
// `licensing/private_key.pem` (fica só com o suporte da NS Sistemas para
// assinar chaves de ativação com `gerar_licenca` — nunca deve ser publicada
// nem versionada, ver .gitignore).
use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
use rsa::{RsaPrivateKey, RsaPublicKey};
use std::fs;
use std::path::Path;

fn main() {
    let out_dir = Path::new("licensing");
    fs::create_dir_all(out_dir).expect("falha ao criar a pasta licensing/");

    let public_path = out_dir.join("public_key.pem");
    let private_path = out_dir.join("private_key.pem");

    if public_path.exists() || private_path.exists() {
        eprintln!(
            "licensing/public_key.pem ou private_key.pem já existem — apague-os manualmente antes de gerar um novo par."
        );
        std::process::exit(1);
    }

    let mut rng = rand::thread_rng();
    let private_key = RsaPrivateKey::new(&mut rng, 2048).expect("falha ao gerar a chave privada RSA");
    let public_key = RsaPublicKey::from(&private_key);

    let private_pem = private_key
        .to_pkcs8_pem(LineEnding::LF)
        .expect("falha ao codificar a chave privada em PEM");
    let public_pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .expect("falha ao codificar a chave pública em PEM");

    fs::write(&private_path, private_pem.as_bytes()).expect("falha ao gravar private_key.pem");
    fs::write(&public_path, public_pem).expect("falha ao gravar public_key.pem");

    println!("Par de chaves RSA-2048 gerado com sucesso em ./licensing/");
    println!(" - public_key.pem  -> embutida no app (src/licensing.rs), pode versionar.");
    println!(" - private_key.pem -> uso exclusivo do suporte NS Sistemas, NUNCA versionar/distribuir.");
}
