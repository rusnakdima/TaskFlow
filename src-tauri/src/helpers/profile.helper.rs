/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* models */
use crate::entities::{profile_entity::ProfileEntity, response_entity::ResponseModel};

/* helpers */
use crate::helpers::response_helper::err_response;

pub async fn check_profile_exists(
  json_provider: &JsonProvider,
  mongodb_provider: Option<&MongoProvider>,
  user_id: &str,
) -> Result<Option<ProfileEntity>, ResponseModel> {
  let table_name = "profiles";
  let filter = Filter::Eq("user_id".to_string(), serde_json::json!(user_id));

  eprintln!(
    "[Profile Check] Looking for profile with user_id: {}",
    user_id
  );

  // Try JSON first
  if let Ok(mut profiles) = json_provider
    .find_many(table_name, Some(&filter), None, None, None, true)
    .await
  {
    eprintln!("[Profile Check] JSON found {} profiles", profiles.len());
    if let Some(profile_val) = profiles.pop() {
      let profile: ProfileEntity = serde_json::from_value(profile_val)
        .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
      eprintln!("[Profile Check] JSON profile found: {:?}", profile.user_id);
      return Ok(Some(profile));
    }
  }

  // Fall back to MongoDB
  if let Some(mongo) = mongodb_provider {
    eprintln!("[Profile Check] Querying MongoDB...");
    match mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      Ok(mut profiles) => {
        eprintln!("[Profile Check] MongoDB found {} profiles", profiles.len());
        if let Some(profile_val) = profiles.pop() {
          let profile: ProfileEntity = serde_json::from_value(profile_val)
            .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
          eprintln!(
            "[Profile Check] MongoDB profile found: {:?}",
            profile.user_id
          );
          return Ok(Some(profile));
        }
      }
      Err(e) => {
        eprintln!("[Profile Check] MongoDB error: {}", e);
      }
    }
  }

  eprintln!("[Profile Check] Profile not found for user_id: {}", user_id);
  Ok(None)
}
