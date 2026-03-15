/* sys lin */
use serde_json::Value;
use std::sync::Arc;

/* helpers */
use crate::helpers::timestamp_helper;

/* models */
use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};
use crate::models::user_model::UserModel;

/* providers */
use crate::providers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider};

/// Helper method to update user's profileId in both MongoDB and local JSON storage
pub async fn updateUserProfileId(
  jsonProvider: &JsonProvider,
  mongodbProvider: &Option<Arc<MongodbProvider>>,
  userId: &str,
  profileId: &str,
) -> Result<(), ResponseModel> {
  let now = timestamp_helper::getCurrentTimestamp();

  // Update in MongoDB
  if let Some(ref mongodb) = mongodbProvider {
    match mongodb.get("users", userId).await {
      Ok(user_val) => {
        let mut updatedUser: UserModel = match serde_json::from_value(user_val) {
          Ok(user) => user,
          Err(e) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Failed to parse user from MongoDB: {}", e),
              data: DataValue::String("".to_string()),
            });
          }
        };
        updatedUser.profileId = profileId.to_string();
        updatedUser.updatedAt = now.clone();

        let user_json = serde_json::to_value(&updatedUser).map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Error serializing user: {}", e),
          data: DataValue::String("".to_string()),
        })?;

        let _ = mongodb.update("users", userId, user_json).await;
      }
      Err(e) => {
        // Silently handle error
      }
    }
  }

  // Update in local JSON storage
  match jsonProvider.get("users", userId).await {
    Ok(user_value) => {
      let mut updatedUser = user_value.clone();
      if let Some(obj) = updatedUser.as_object_mut() {
        obj.insert(
          "profileId".to_string(),
          Value::String(profileId.to_string()),
        );
        obj.insert("updatedAt".to_string(), Value::String(now.clone()));
      }

      let _ = jsonProvider.update("users", userId, updatedUser).await;
    }
    Err(e) => {
      // Silently handle error
    }
  }

  Ok(())
}
