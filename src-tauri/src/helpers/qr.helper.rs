/* Disabled QR code generation - moved to frontend to reduce build size */

#[tauri::command]
pub fn generate_qr_code_data_url(_data: &str) -> String {
  String::new()
}
