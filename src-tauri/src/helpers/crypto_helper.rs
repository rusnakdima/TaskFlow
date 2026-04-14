use data_encoding::BASE64URL;
use rand::Rng;

pub fn generate_challenge() -> String {
  let bytes: [u8; 32] = rand::thread_rng().gen();
  BASE64URL.encode(&bytes)
}
