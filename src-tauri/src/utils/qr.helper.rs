use base64::Engine;
use image::Luma;
use qrcode::QrCode;
pub fn generate_qr_code_data_url(data: &str) -> String {
  let code = match QrCode::new(data.as_bytes()) {
    Ok(c) => c,
    Err(_) => return String::new(),
  };
  let image = code.render::<Luma<u8>>().build();
  let mut png_data = Vec::new();
  let mut cursor = std::io::Cursor::new(&mut png_data);
  if let Err(_) = image.write_to(&mut cursor, image::ImageFormat::Png) {
    return String::new();
  }
  let base64_str = base64::engine::general_purpose::STANDARD.encode(&png_data);
  format!("data:image/png;base64,{}", base64_str)
}
