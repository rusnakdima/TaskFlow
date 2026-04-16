/* sys lin */
use nosql_orm::provider::DatabaseProvider;
use serde_json::Value;

/* helpers */
use crate::helpers::timestamp_helper;

/* entities */
use crate::entities::response_entity::{DataValue, ResponseModel, ResponseStatus};

/* providers */
use nosql_orm::providers::JsonProvider;

/// Helper method to update user's profileId in JSON storage only
pub async fn updateUserProfileIdJson(
  jsonProvider: &JsonProvider,
  userId: &str,
  profileId: &str,
) -> Result<(), ResponseModel> {
  let now = timestamp_helper::getCurrentTimestamp();

  match jsonProvider.find_by_id("users", userId).await {
    Ok(Some(user_value)) => {
      let mut updatedUser = user_value.clone();
      if let Some(obj) = updatedUser.as_object_mut() {
        obj.insert(
          "profileId".to_string(),
          Value::String(profileId.to_string()),
        );
        obj.insert("updatedAt".to_string(), Value::String(now.clone()));
      }

      let _ = jsonProvider.update("users", userId, updatedUser).await;
      Ok(())
    }
    Ok(None) => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: format!("User {} not found", userId),
      data: DataValue::String("".to_string()),
    }),
    Err(e) => Err(ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Failed to get user: {}", e),
      data: DataValue::String("".to_string()),
    }),
  }
}
