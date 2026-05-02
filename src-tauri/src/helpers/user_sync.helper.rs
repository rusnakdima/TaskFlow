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

/// Helper method
/// Fails if MongoDB is not available
pub async fn update_user_profile_id_both(
  json_provider: &JsonProvider,
  mongo_provider: Option<&std::sync::Arc<MongoProvider>>,
  user_id: &str,
  profile_id: &str,
) -> Result<(), ResponseModel> {
  let now = timestamp_helper::get_current_timestamp();

  // Step 1: Update JSON
  let user_value = json_provider
    .find_by_id("users", user_id)
    .await
    .map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Failed to get user from JSON: {}", e),
      data: DataValue::String("".to_string()),
    })?
    .ok_or_else(|| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("User {} not found in JSON", user_id),
      data: DataValue::String("".to_string()),
    })?;

  let mut updated_user = user_value.clone();
  if let Some(obj) = updated_user.as_object_mut() {
    obj.insert(
      "profile_id".to_string(),
      Value::String(profile_id.to_string()),
    );
    obj.insert("updated_at".to_string(), Value::String(now.clone()));
  }

  json_provider
    .update("users", user_id, updated_user)
    .await
    .map_err(|e| ResponseModel {
      status: ResponseStatus::Error,
      message: format!("Failed to update user in JSON: {}", e),
      data: DataValue::String("".to_string()),
    })?;

  // Step 2: MongoDB is optional - if not available, log and return
  let Some(mongo) = mongo_provider else {
    println!("[WARN] MongoDB not available, skipping profile_id sync in MongoDB");
    return Ok(());
  };

  // Step 3: Update MongoDB with last-write-wins
  let now_str = timestamp_helper::get_current_timestamp();

  match mongo.find_by_id("users", user_id).await {
    Ok(Some(existing_mongo_user)) => {
      // Compare updated_at timestamps - local wins if newer
      let local_time = chrono::DateTime::parse_from_rfc3339(&now_str).ok();
      let mongo_time = existing_mongo_user
        .get("updated_at")
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
        let mut updated = existing_mongo_user.clone();
        if let Some(obj) = updated.as_object_mut() {
          obj.insert(
            "profile_id".to_string(),
            Value::String(profile_id.to_string()),
          );
          obj.insert("updated_at".to_string(), Value::String(now_str));
        }
        mongo
          .update("users", user_id, updated)
          .await
          .map_err(|e| ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Failed to update user in MongoDB: {}", e),
            data: DataValue::String("".to_string()),
          })?;
      }
    }
    Ok(None) => {
      // User doesn't exist in MongoDB, fetch from JSON and insert
      let mut new_user = json_provider
        .find_by_id("users", user_id)
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
          "profile_id".to_string(),
          Value::String(profile_id.to_string()),
        );
        obj.insert("updated_at".to_string(), Value::String(now_str));
      }

      mongo
        .insert("users", new_user)
        .await
        .map_err(|e| ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Failed to insert user to MongoDB: {}", e),
          data: DataValue::String("".to_string()),
        })?;
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
