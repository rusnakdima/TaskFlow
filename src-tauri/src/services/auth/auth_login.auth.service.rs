/* sys lib */
use bcrypt::verify;
use std::sync::Arc;

/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* services */
use super::auth_token::AuthTokenService;

/* models */
use crate::entities::{
  login_form_entity::LoginForm,
  profile_entity::ProfileEntity,
  response_entity::{DataValue, ResponseModel, ResponseStatus},
  table_entity::TableModelType,
  user_entity::UserEntity,
};

/* helpers */
use crate::helpers::{profile_helper::check_profile_exists, response_helper::err_response};

#[derive(Clone)]
pub struct AuthLoginService {
  pub json_provider: JsonProvider,
  pub mongodb_provider: Option<Arc<MongoProvider>>,
  pub token_service: Arc<AuthTokenService>,
}

impl AuthLoginService {
  pub fn new(
    json_provider: JsonProvider,
    mongodb_provider: Option<Arc<MongoProvider>>,
    token_service: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      json_provider,
      mongodb_provider,
      token_service,
    }
  }

  pub async fn login(&self, login_data: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let username = login_data.username;
    let password = login_data.password;
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match self
      .json_provider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut users) => {
        if users.is_empty() {
          None
        } else {
          Some(users.remove(0))
        }
      }
      Err(_) => None,
    };

    let user_val = match user_val {
      Some(v) => v,
      None => {
        let mongo = self.mongodb_provider.as_ref().ok_or_else(|| {
          err_response("User not found in local database and MongoDB unavailable")
        })?;
        let mut users = mongo
          .find_many(table_name, Some(&filter), None, None, None, true)
          .await
          .map_err(|e| err_response(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| {
          err_response("User not found. Please register first or check your username.")
        })?
      }
    };

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| err_response(&format!("Failed to parse user: {}", e)))?;

    let valid = verify(password, &user.password)
      .map_err(|e| err_response(&format!("Error verifying password: {}", e)))?;

    if !valid {
      return Err(err_response("Invalid password"));
    }

    if self.mongodb_provider.is_some() {
      let _ = self.json_provider.insert(table_name, user_val).await;
    }

    let token = self.token_service.generate_token(user.get_id(), "", "")?;

    let profile = self
      .check_profile_exists(user.get_id())
      .await
      .ok()
      .flatten();

    let needs_profile = profile.is_none();

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Login successful".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "needsProfile": needs_profile,
        "profile": profile,
        "userId": user.get_id()
      })),
    })
  }

  pub async fn check_profile_exists(
    &self,
    user_id: &str,
  ) -> Result<Option<ProfileEntity>, ResponseModel> {
    check_profile_exists(
      &self.json_provider,
      self.mongodb_provider.as_deref(),
      user_id,
    )
    .await
  }
}
