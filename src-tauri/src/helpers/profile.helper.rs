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
  let filter = Filter::Or(vec![
    Filter::Eq("user_id".to_string(), serde_json::json!(user_id)),
    Filter::Eq("user_id".to_string(), serde_json::json!(user_id)),
  ]);

  if let Ok(mut profiles) = json_provider
    .find_many(table_name, Some(&filter), None, None, None, true)
    .await
  {
    if let Some(profile_val) = profiles.pop() {
      let profile: ProfileEntity = serde_json::from_value(profile_val)
        .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
      return Ok(Some(profile));
    }
  }

  if let Some(mongo) = mongodb_provider {
    if let Ok(mut profiles) = mongo
      .find_many(table_name, Some(&filter), None, None, None, true)
      .await
    {
      if let Some(profile_val) = profiles.pop() {
        let profile: ProfileEntity = serde_json::from_value(profile_val)
          .map_err(|e| err_response(&format!("Failed to parse profile: {}", e)))?;
        return Ok(Some(profile));
      }
    }
  }

  Ok(None)
}
