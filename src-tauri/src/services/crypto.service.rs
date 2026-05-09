/* sys lib */
use data_encoding::BASE64URL;
use rand::Rng;
use std::fs;
use std::path::PathBuf;

pub struct CryptoService;

impl CryptoService {
  fn get_key_path() -> PathBuf {
    let document_dir = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_dir = document_dir.join("taskflow");
    fs::create_dir_all(&app_dir).ok();
    app_dir.join(".auth_key")
  }

  pub fn get_or_create_key() -> Result<String, Box<dyn std::error::Error>> {
    let key_path = Self::get_key_path();

    if let Ok(key) = fs::read_to_string(&key_path) {
      if !key.is_empty() {
        return Ok(key.trim().to_string());
      }
    }

    let key_bytes: [u8; 32] = rand::thread_rng().gen();
    let key_base64 = BASE64URL.encode(&key_bytes);
    fs::write(&key_path, &key_base64)?;
    Ok(key_base64)
  }

  pub fn encrypt(data: &str) -> Result<String, Box<dyn std::error::Error>> {
    let key_str = Self::get_or_create_key()?;
    let key = BASE64URL.decode(key_str.as_bytes())?;

    let iv: [u8; 16] = rand::thread_rng().gen();

    let data_bytes = data.as_bytes();
    let mut encrypted = Vec::with_capacity(iv.len() + data_bytes.len());
    encrypted.extend_from_slice(&iv);

    for (i, byte) in data_bytes.iter().enumerate() {
      let key_byte = key[i % key.len()];
      let iv_byte = iv[i % iv.len()];
      encrypted.push(byte ^ key_byte ^ iv_byte);
    }

    Ok(BASE64URL.encode(&encrypted))
  }
}
