/* sys lin */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::MongoProvider;
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

/// Helper method to update user's profileId in BOTH JSON and MongoDB
/// Fails if MongoDB is not available
pub async fn updateUserProfileIdBoth(
  jsonProvider: &JsonProvider,
  mongoProvider: Option<&std::sync::Arc<MongoProvider>>,
  userId: &str,
  profileId: &str,
) -> Result<(), ResponseModel> {
  let now = timestamp_helper::getCurrentTimestamp();

  // Step 1: Update JSON
  eprintln!("[user_sync_helper] Updating user.profileId in JSON for user: {}", userId);

  let user_value = jsonProvider
    .find_by_id("users", userId)
    .await
    .map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Failed to get user from JSON: {}", e),
      data: DataValue::String("".to_string()),
    })?
    .ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("User {} not found in JSON", userId),
      data: DataValue::String("".to_string()),
    })?;

  let mut updated_user = user_value.clone();
  if let Some(obj) = updated_user.as_object_mut() {
    obj.insert(
      "profileId".to_string(),
      Value::String(profileId.to_string()),
    );
    obj.insert("updatedAt".to_string(), Value::String(now.clone()));
  }

  jsonProvider
    .update("users", userId, updated_user)
    .await
    .map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Failed to update user in JSON: {}", e),
      data: DataValue::String("".to_string()),
    })?;

  eprintln!(
    "[user_sync_helper] User.profileId updated in JSON successfully"
  );

  // Step 2: FAIL if MongoDB not available
  eprintln!("[user_sync_helper] Checking MongoDB availability...");

  let mongo = mongoProvider.ok_or_else(|| ResponseModel {
    status: ResponseStatus::Error,
    message: "MongoDB not available".to_string(),
    data: DataValue::String("".to_string()),
  })?;

  eprintln!(
    "[user_sync_helper] MongoDB available, proceeding with user sync"
  );

  // Step 3: Update MongoDB with last-write-wins
  eprintln!("[user_sync_helper] Checking user in MongoDB...");

  let now_str = timestamp_helper::getCurrentTimestamp();

  match mongo.find_by_id("users", userId).await {
    Ok(Some(existing_mongo_user)) => {
      // Compare updatedAt timestamps - local wins if newer
      let local_time =
        chrono::DateTime::parse_from_rfc3339(&now_str).ok();
      let mongo_time = existing_mongo_user
        .get("updatedAt")
        .and_then(|v| v.as_str())
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok());

      let should_update = local_time
        .map(|l| match mongo_time {
          Some(m) if l > m => true,
          None => true,
          _ => false,
        })
        .unwrap_or(true);

      if should_update {
        eprintln!(
          "[user_sync_helper] Updating user in MongoDB (local is newer)..."
        );
        let mut updated = existing_mongo_user.clone();
        if let Some(obj) = updated.as_object_mut() {
          obj.insert(
            "profileId".to_string(),
            Value::String(profileId.to_string()),
          );
          obj.insert("updatedAt".to_string(), Value::String(now_str));
        }
        mongo
          .update("users", userId, updated)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Failed to update user in MongoDB: {}", e),
            data: DataValue::String("".to_string()),
          })?;
        eprintln!(
          "[user_sync_helper] User updated in MongoDB successfully"
        );
      } else {
        eprintln!(
          "[user_sync_helper] MongoDB user is newer, skipping update"
        );
      }
    }
    Ok(None) => {
      // User doesn't exist in MongoDB, fetch from JSON and insert
      eprintln!("[user_sync_helper] User not in MongoDB, creating...");
      let mut new_user = jsonProvider
        .find_by_id("users", userId)
        .await
        .map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Failed to re-fetch user from JSON: {}", e),
          data: DataValue::String("".to_string()),
        })?
        .ok_or_else(|| ResponseModel {
          status: ResponseStatus::Error,
          message: "User disappeared from JSON".to_string(),
          data: DataValue::String("".to_string()),
        })?;

      if let Some(obj) = new_user.as_object_mut() {
        obj.insert(
          "profileId".to_string(),
          Value::String(profileId.to_string()),
        );
        obj.insert("updatedAt".to_string(), Value::String(now_str));
      }

      mongo
        .insert("users", new_user)
        .await
        .map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Failed to insert user to MongoDB: {}", e),
          data: DataValue::String("".to_string()),
        })?;
      eprintln!(
        "[user_sync_helper] User created in MongoDB successfully"
      );
    }
    Err(e) => {
      return Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Failed to check user in MongoDB: {}", e),
        data: DataValue::String("".to_string()),
      });
    }
  }

  Ok(())
}
