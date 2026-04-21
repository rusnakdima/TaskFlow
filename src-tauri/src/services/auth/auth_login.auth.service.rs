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
use crate::helpers::response_helper::errResponse;

#[derive(Clone)]
pub struct AuthLoginService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: Option<Arc<MongoProvider>>,
  pub tokenService: Arc<AuthTokenService>,
}

impl AuthLoginService {
  pub fn new(
    jsonProvider: JsonProvider,
    mongodbProvider: Option<Arc<MongoProvider>>,
    tokenService: Arc<AuthTokenService>,
  ) -> Self {
    Self {
      jsonProvider,
      mongodbProvider,
      tokenService,
    }
  }

  pub async fn login(&self, loginData: LoginForm) -> Result<ResponseModel, ResponseModel> {
    let username = loginData.username;
    let password = loginData.password;
    let table_name = TableModelType::User.table_name();
    let filter = Filter::Eq("username".to_string(), serde_json::json!(username));

    let user_val = match self
      .jsonProvider
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
        let mongo = self
          .mongodbProvider
          .as_ref()
          .ok_or_else(|| errResponse("User not found in local database and MongoDB unavailable"))?;
        let mut users = mongo
          .find_many(table_name, Some(&filter), None, None, None, true)
          .await
          .map_err(|e| errResponse(&format!("Database error: {}", e)))?;
        users.pop().ok_or_else(|| {
          errResponse("User not found. Please register first or check your username.")
        })?
      }
    };

    let user = serde_json::from_value::<UserEntity>(user_val.clone())
      .map_err(|e| errResponse(&format!("Failed to parse user: {}", e)))?;

    let valid = verify(password, &user.password)
      .map_err(|e| errResponse(&format!("Error verifying password: {}", e)))?;

    if !valid {
      return Err(errResponse("Invalid password"));
    }

    if self.mongodbProvider.is_some() {
      let _ = self.jsonProvider.insert(table_name, user_val).await;
    }

    let token = self
      .tokenService
      .generateToken(&user.get_id(), &user.username, &user.role)?;

    let profile = self.checkProfileExists(&user.get_id()).await.ok().flatten();

    let needs_profile = profile.is_none();

    Ok(ResponseModel {
      status: ResponseStatus::Success,
      message: "Login successful".to_string(),
      data: DataValue::Object(serde_json::json!({
        "token": token,
        "needsProfile": needs_profile,
        "profile": profile
      })),
    })
  }

  pub async fn checkProfileExists(
    &self,
    user_id: &str,
  ) -> Result<Option<ProfileEntity>, ResponseModel> {
    let table_name = "profiles";
    let filter = Filter::Eq("userId".to_string(), serde_json::json!(user_id));

    if let Ok(mut profiles) = self
      .jsonProvider
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      if let Some(profile_val) = profiles.pop() {
        let profile: ProfileEntity = serde_json::from_value(profile_val)
          .map_err(|e| errResponse(&format!("Failed to parse profile: {}", e)))?;
        return Ok(Some(profile));
      }
    }

    if let Some(mongo) = &self.mongodbProvider {
      if let Ok(mut profiles) = mongo
        .find_many(table_name, Some(&filter), None, None, None, true)
        .await
      {
        if let Some(profile_val) = profiles.pop() {
          let profile: ProfileEntity = serde_json::from_value(profile_val)
            .map_err(|e| errResponse(&format!("Failed to parse profile: {}", e)))?;
          return Ok(Some(profile));
        }
      }
    }

    Ok(None)
  }
}
