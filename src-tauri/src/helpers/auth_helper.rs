use std::sync::Arc;

/* tokio */
use tokio::time::{timeout, Duration};

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};
use nosql_orm::query::Filter;

/* models */
use crate::entities::{
  response_entity::{ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

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

pub async fn find_user_by_username(
  json_provider: &JsonProvider,
  mongodb_provider: Option<&Arc<MongoProvider>>,
  username: &str,
) -> Result<UserEntity, ResponseModel> {
  let table_name = TableModelType::User.table_name();
  let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

  let user_val = match timeout(
    Duration::from_secs(3),
    json_provider.find_many(table_name, Some(&filter), None, None, None, true),
  )
  .await
  {
    Ok(Ok(mut users)) => {
      if users.is_empty() {
        None
      } else {
        Some(users.remove(0))
      }
    }
    Ok(Err(_)) => None,
    Err(_) => None,
  };

  let user_val = match user_val {
    Some(v) => v,
    None => {
      let mongo =
        mongodb_provider.ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
      let mut users = timeout(
        Duration::from_secs(5),
        mongo.find_many(table_name, Some(&filter), None, None, None, true),
      )
      .await
      .map_err(|_| err_response("Database timeout"))?
      .map_err(|e| err_response(&format!("Database error: {}", e)))?;
      users.pop().ok_or_else(|| err_response("User not found"))?
    }
  };

  serde_json::from_value::<UserEntity>(user_val)
    .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))
}
