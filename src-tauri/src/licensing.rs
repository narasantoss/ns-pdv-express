// Etapa 5 — Módulo de Licenciamento (HWID + RSA Offline).
//
// Fluxo: `obter_hwid_maquina` deriva um identificador único e estável desta
// máquina; o cliente envia esse HWID ao suporte da NS Sistemas, que assina o
// HWID com a chave privada RSA (offline, fora deste app — ver
// `src/bin/gerar_licenca.rs`) e devolve a "Chave de Licença Serial". O app
// valida essa assinatura offline com a chave pública embutida no binário
// (`ativar_serial`) — nunca precisa de internet/servidor de licenças.
// `verificar_status_licenca` faz a checagem rápida no boot.
//
// O resultado da ativação é persistido em dois lugares, de propósito:
//   - `licenca.json` no diretório de configuração do app (gravado por este
//     módulo, em Rust puro) — é a fonte rápida e independente de SQLite
//     consultada no boot, antes de qualquer migration/conexão do
//     `tauri-plugin-sql` ter rodado.
//   - a tabela `licenca_local` (gravada pelo lado JS, via `licencaLocalRepo`
//     em `src/services/db.js`, o mesmo padrão usado por todo o resto do
//     schema) — mantém a licença auditável junto do restante dos dados da
//     loja e do backup/restauração do banco.
use rsa::pkcs8::DecodePublicKey;
use rsa::{Pkcs1v15Sign, RsaPublicKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

// Chave pública RSA-2048 da NS Sistemas, usada só para VERIFICAR (nunca
// assinar) Chaves de Ativação offline. A chave privada correspondente nunca
// entra neste repositório — fica só com o suporte (ver
// `src-tauri/licensing/private_key.pem`, ignorado no .gitignore, e
// `src/bin/gerar_licenca.rs`).
const LICENSE_PUBLIC_KEY_PEM: &str = include_str!("../licensing/public_key.pem");

const LICENSE_FILE_NAME: &str = "licenca.json";

#[derive(Serialize, Deserialize, Clone)]
struct LicenseRecord {
    status: String,
    hwid_maquina: String,
    chave_rsa: String,
    data_ativacao: String,
}

fn license_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    Ok(dir.join(LICENSE_FILE_NAME))
}

fn read_license_record(app: &tauri::AppHandle) -> Option<LicenseRecord> {
    let path = license_file_path(app).ok()?;
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_license_record(app: &tauri::AppHandle, record: &LicenseRecord) -> Result<(), String> {
    let path = license_file_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = serde_json::to_vec_pretty(record).map_err(|error| error.to_string())?;
    fs::write(path, bytes).map_err(|error| error.to_string())
}

fn now_iso_seconds() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Timestamp simples (segundos desde a época Unix) — só para referência
    // interna deste marcador local; a data "oficial" de ativação exibida ao
    // usuário vem de `licenca_local.data_ativacao` (ISO 8601 completo,
    // gravado pelo lado JS em `licencaLocalRepo.activate`).
    secs.to_string()
}

/// Identificador único e estável desta máquina, formatado como
/// 'NS-XXXX-XXXX-XXXX'. No Windows deriva do MachineGuid gravado pelo
/// próprio Windows (nunca muda entre boots, só numa reinstalação do
/// sistema); nunca o valor bruto — sempre um hash SHA-256 truncado dele,
/// para não expor um identificador de sistema sensível em texto puro.
#[tauri::command]
pub fn obter_hwid_maquina(app: tauri::AppHandle) -> Result<String, String> {
    let seed = machine_seed(&app)?;
    Ok(format_hwid(&seed))
}

#[cfg(target_os = "windows")]
fn machine_seed(_app: &tauri::AppHandle) -> Result<String, String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = hklm
        .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|error| format!("Não foi possível ler o identificador do Windows: {error}"))?;
    let guid: String = key
        .get_value("MachineGuid")
        .map_err(|error| format!("Não foi possível ler o identificador do Windows: {error}"))?;
    Ok(guid)
}

// Fora do Windows (ambiente de desenvolvimento/testes, já que o produto é
// distribuído só para Windows): persiste um identificador aleatório estável
// no diretório de configuração do app, já que não existe MachineGuid.
#[cfg(not(target_os = "windows"))]
fn machine_seed(app: &tauri::AppHandle) -> Result<String, String> {
    use rand::RngCore;

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join("machine_seed.txt");
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    let seed: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    fs::write(&path, &seed).map_err(|error| error.to_string())?;
    Ok(seed)
}

fn format_hwid(seed: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(seed.as_bytes());
    let digest = hasher.finalize();
    let hex: String = digest.iter().take(6).map(|b| format!("{b:02X}")).collect();
    format!("NS-{}-{}-{}", &hex[0..4], &hex[4..8], &hex[8..12])
}

fn public_key() -> Result<RsaPublicKey, String> {
    RsaPublicKey::from_public_key_pem(LICENSE_PUBLIC_KEY_PEM.trim())
        .map_err(|error| format!("Chave pública de licenciamento inválida: {error}"))
}

fn verify_license_key(chave: &str, hwid: &str) -> Result<(), String> {
    let signature = BASE64
        .decode(chave.trim())
        .map_err(|_| "Chave de ativação inválida (formato incorreto).".to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(hwid.trim().as_bytes());
    let hashed = hasher.finalize();

    public_key()?
        .verify(Pkcs1v15Sign::new::<Sha256>(), &hashed, &signature)
        .map_err(|_| "Chave de ativação não corresponde a este computador.".to_string())
}

/// Ativação por Chave de Licença Serial (tela de ativação): recebe só o
/// serial colado pelo operador, deriva o HWID desta máquina internamente
/// (nunca confia em um HWID vindo do lado JS) e valida a assinatura RSA do
/// serial contra esse HWID, 100% offline. Se válida, persiste o marcador
/// local de licença ativa (ver `LicenseRecord`) usado por
/// `verificar_status_licenca` no próximo boot, e devolve o HWID usado para
/// que o lado JS grave a linha "oficial" em `licenca_local` (SQLite) via
/// `licencaLocalRepo.activate` — ver `TelaAtivacaoLicenca.jsx`.
#[tauri::command]
pub fn ativar_serial(app: tauri::AppHandle, serial: String) -> Result<String, String> {
    let seed = machine_seed(&app)?;
    let hwid = format_hwid(&seed);

    verify_license_key(&serial, &hwid)?;

    write_license_record(
        &app,
        &LicenseRecord {
            status: "ATIVADO".to_string(),
            hwid_maquina: hwid.clone(),
            chave_rsa: serial,
            data_ativacao: now_iso_seconds(),
        },
    )?;

    Ok(hwid)
}

/// Checagem rápida no boot — lê só o marcador local (arquivo), sem depender
/// do SQLite/`tauri-plugin-sql` já estar conectado.
#[tauri::command]
pub fn verificar_status_licenca(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(read_license_record(&app)
        .map(|record| record.status == "ATIVADO")
        .unwrap_or(false))
}
