use std::sync::Arc;
use tokio::time::{timeout, Duration};

use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::{JsonProvider, MongoProvider};

use crate::entities::{
  response_entity::ResponseModel, table_entity::TableModelType, user_entity::UserEntity,
};
use crate::helpers::response_helper::err_response;

pub struct UserRepository {
  json_provider: JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
}

impl UserRepository {
  pub fn new(json_provider: JsonProvider, mongodb_provider: Option<Arc<MongoProvider>>) -> Self {
    Self {
      json_provider,
      mongodb_provider,
    }
  }

  pub async fn find_by_username(
    &self,
    username: &str,
  ) -> Result<Option<UserEntity>, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let filter = nosql_orm::query::Filter::from_json(&serde_json::json!({ "username": username }))
      .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

    let user_val = match timeout(
      Duration::from_secs(3),
      self
        .json_provider
        .find_many(table_name, Some(&filter), None, None, None, true),
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

    match user_val {
      Some(v) => {
        let user: UserEntity = serde_json::from_value(v)
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;
        Ok(Some(user))
      }
      None => {
        let mongo = self
          .mongodb_provider
          .as_ref()
          .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
        let mut users = timeout(
          Duration::from_secs(5),
          mongo.find_many(table_name, Some(&filter), None, None, None, true),
        )
        .await
        .map_err(|_| err_response("Database timeout"))?
        .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        let user_val = users.pop().ok_or_else(|| err_response("User not found"))?;
        let user: UserEntity = serde_json::from_value(user_val)
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;
        Ok(Some(user))
      }
    }
  }

  pub async fn find_by_id(&self, user_id: &str) -> Result<Option<UserEntity>, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let filter = nosql_orm::query::Filter::from_json(&serde_json::json!({ "id": user_id }))
      .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

    let user_val = match timeout(
      Duration::from_secs(3),
      self
        .json_provider
        .find_many(table_name, Some(&filter), None, None, None, true),
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

    match user_val {
      Some(v) => {
        let user: UserEntity = serde_json::from_value(v)
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;
        Ok(Some(user))
      }
      None => {
        let mongo = self
          .mongodb_provider
          .as_ref()
          .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
        let mut users = timeout(
          Duration::from_secs(5),
          mongo.find_many(table_name, Some(&filter), None, None, None, true),
        )
        .await
        .map_err(|_| err_response("Database timeout"))?
        .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        let user_val = users.pop().ok_or_else(|| err_response("User not found"))?;
        let user: UserEntity = serde_json::from_value(user_val)
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;
        Ok(Some(user))
      }
    }
  }

  pub async fn find_by_email(&self, email: &str) -> Result<Option<UserEntity>, ResponseModel> {
    let table_name = TableModelType::User.table_name();
    let filter = nosql_orm::query::Filter::from_json(&serde_json::json!({ "email": email }))
      .map_err(|e| err_response(&format!("Filter error: {}", e)))?;

    let user_val = match timeout(
      Duration::from_secs(3),
      self
        .json_provider
        .find_many(table_name, Some(&filter), None, None, None, true),
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

    match user_val {
      Some(v) => {
        let user: UserEntity = serde_json::from_value(v)
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;
        Ok(Some(user))
      }
      None => {
        let mongo = self
          .mongodb_provider
          .as_ref()
          .ok_or_else(|| err_response("User not found and MongoDB unavailable"))?;
        let mut users = timeout(
          Duration::from_secs(5),
          mongo.find_many(table_name, Some(&filter), None, None, None, true),
        )
        .await
        .map_err(|_| err_response("Database timeout"))?
        .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        let user_val = users.pop().ok_or_else(|| err_response("User not found"))?;
        let user: UserEntity = serde_json::from_value(user_val)
          .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;
        Ok(Some(user))
      }
    }
  }
}
