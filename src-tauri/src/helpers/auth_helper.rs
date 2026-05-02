use crate::entities::response_entity::{ResponseModel, ResponseStatus};
use crate::helpers::response_helper::err_response;
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
  pub id: String,
  pub exp: usize,
}

pub fn extract_user_from_token(token: &str, jwt_secret: &str) -> Result<String, ResponseModel> {
  let token_data = decode::<Claims>(
    token,
    &DecodingKey::from_secret(jwt_secret.as_ref()),
    &Validation::default(),
  )
  .map_err(|e| err_response(&format!("Invalid token: {}", e)))?;
  Ok(token_data.claims.id)
}

pub fn validate_user_owns_data(
  token: &str,
  jwt_secret: &str,
  user_id: &str,
) -> Result<(), ResponseModel> {
  let authenticated_user_id = extract_user_from_token(token, jwt_secret)?;
  if authenticated_user_id != user_id {
    return Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "Unauthorized: Cannot access another user's data".to_string(),
      data: crate::entities::response_entity::DataValue::String("".to_string()),
    });
  }
  Ok(())
}
