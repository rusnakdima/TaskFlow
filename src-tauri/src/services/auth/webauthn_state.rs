use std::sync::Arc;
use webauthn_rs::prelude::*;

pub struct WebAuthnState {
  pub webauthn: Arc<Webauthn>,
  pub rp_id: String,
}

impl WebAuthnState {
  pub fn new(rp_id: &str, rp_origin: &Url) -> Self {
    let webauthn = WebauthnBuilder::new(rp_id, rp_origin)
      .expect("Invalid WebAuthn config")
      .rp_name("TaskFlow")
      .build()
      .expect("Failed to build WebAuthn");

    Self {
      webauthn: Arc::new(webauthn),
      rp_id: rp_id.to_string(),
    }
  }
}

impl Clone for WebAuthnState {
  fn clone(&self) -> Self {
    Self {
      webauthn: Arc::clone(&self.webauthn),
      rp_id: self.rp_id.clone(),
    }
  }
}
