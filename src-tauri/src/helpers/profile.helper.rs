/* providers */
use nosql_orm::provider::DatabaseProvider;
use nosql_orm::providers::JsonProvider;
use nosql_orm::providers::MongoProvider;
use nosql_orm::query::Filter;

/* models */
use crate::entities::{profile_entity::ProfileEntity, response_entity::ResponseModel};

pub async fn check_profile_exists(
  json_provider: &JsonProvider,
  mongodb_provider: Option<&MongoProvider>,
  user_id: &str,
) -> Result<Option<ProfileEntity>, ResponseModel> {
  let table_name = "profiles";
  let filter = Filter::Eq("user_id".to_string(), serde_json::json!(user_id));

  // Try JSON first
  match json_provider
    .find_many(table_name, Some(&filter), None, None, None, true)
    .await
  {
    Ok(profiles) => {
      if let Some(profile_val) = profiles.first() {
        match serde_json::from_value::<ProfileEntity>(profile_val.clone()) {
          Ok(profile) => {
            return Ok(Some(profile));
          }
          Err(_) => {}
        }
      }
    }
    Err(_) => {}
  }

  // Fall back to MongoDB
  if let Some(mongo) = mongodb_provider {
    match mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      Ok(profiles) => {
        if let Some(profile_val) = profiles.first() {
          match serde_json::from_value::<ProfileEntity>(profile_val.clone()) {
            Ok(profile) => {
              if let Err(e) = json_provider.insert(table_name, profile_val.clone()).await {
                tracing::warn!("Failed to sync profile to JSON: {}", e);
              }
              return Ok(Some(profile));
            }
            Err(_) => {}
          }
        }
      }
      Err(_) => {}
    }
  }

  Ok(None)
}
