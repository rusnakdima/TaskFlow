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

  pub fn get_key() -> KeyringResult<Option<String>> {
    let entry = Self::get_entry(AUTH_KEY_ACCOUNT)?;
    match entry.get_password() {
      Ok(key) => Ok(Some(key)),
      Err(keyring::Error::NoEntry) => Ok(None),
      Err(e) => Err(e),
    }
  }

  pub fn set_key(key: &str) -> KeyringResult<()> {
    let entry = Self::get_entry(AUTH_KEY_ACCOUNT)?;
    entry.set_password(key)
  }

  pub fn delete_key() -> KeyringResult<()> {
    let entry = Self::get_entry(AUTH_KEY_ACCOUNT)?;
    entry.delete_credential()
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

  pub fn decrypt(encrypted_base64: &str) -> Result<String, Box<dyn std::error::Error>> {
    let key_str = Self::get_or_create_key()?;
    let key = BASE64URL.decode(key_str.as_bytes())?;

    let encrypted = BASE64URL.decode(encrypted_base64.as_bytes())?;
    if encrypted.len() < 16 {
      return Err("Invalid encrypted data".into());
    }

    let iv = &encrypted[..16];
    let ciphertext = &encrypted[16..];

    let mut decrypted = Vec::with_capacity(ciphertext.len());
    for (i, byte) in ciphertext.iter().enumerate() {
      let key_byte = key[i % key.len()];
      let iv_byte = iv[i % iv.len()];
      decrypted.push(byte ^ key_byte ^ iv_byte);
    }

    Ok(String::from_utf8(decrypted)?)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_encrypt_decrypt() {
    let data = "test://auth?user=john&challenge=abc123";
    let encrypted = CryptoService::encrypt(data).unwrap();
    let decrypted = CryptoService::decrypt(&encrypted).unwrap();
    assert_eq!(data, decrypted);
  }
}
