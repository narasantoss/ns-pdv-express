fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new().app_manifest(
      tauri_build::AppManifest::new().commands(&[
        "read_database_file",
        "write_database_file",
        "get_local_ip",
        "obter_hwid_maquina",
        "ativar_serial",
        "verificar_status_licenca",
        "start_local_server",
        "stop_local_server",
        "is_local_server_running",
      ]),
    ),
  )
  .expect("failed to run tauri-build");
}
