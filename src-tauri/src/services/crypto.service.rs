/* sys lib */
use data_encoding::BASE64URL;
use keyring::{Entry, Result as KeyringResult};
use rand::Rng;

const SERVICE_NAME: &str = "TaskFlow";
const AUTH_KEY_ACCOUNT: &str = "auth-key";

pub struct CryptoService;

impl CryptoService {
  fn get_entry(account: &str) -> KeyringResult<Entry> {
    Entry::new(SERVICE_NAME, account)
  }

  pub fn get_or_create_key() -> KeyringResult<String> {
    let entry = Self::get_entry(AUTH_KEY_ACCOUNT)?;
    match entry.get_password() {
      Ok(key) => Ok(key),
      Err(_) => {
        let key_bytes: [u8; 32] = rand::thread_rng().gen();
        let key_base64 = BASE64URL.encode(&key_bytes);
        entry.set_password(&key_base64)?;
        Ok(key_base64)
      }
    }
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
