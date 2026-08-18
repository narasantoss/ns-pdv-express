fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&[
        "read_database_file",
        "write_database_file",
        "get_local_ip",
        "obter_hwid_maquina",
        "validar_e_ativar_licenca",
        "verificar_status_licenca",
      ]),
    ),
  )
  .expect("failed to run tauri-build");
}
