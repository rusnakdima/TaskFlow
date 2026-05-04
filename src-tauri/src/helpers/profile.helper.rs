/* providers */
use nosql_orm::providers::MongoProvider;
use std::sync::Arc;

/* services */
use crate::services::profile::profile_sync_unified::ProfileSyncUnifiedService;

/* models */
use crate::entities::{profile_entity::ProfileEntity, response_entity::ResponseModel};

pub async fn check_profile_exists(
  json_provider: &nosql_orm::providers::JsonProvider,
  mongodb_provider: Option<Arc<MongoProvider>>,
  user_id: &str,
) -> Result<Option<ProfileEntity>, ResponseModel> {
  let profile_sync_service =
    ProfileSyncUnifiedService::new(json_provider.clone(), mongodb_provider);
  profile_sync_service.get_profile(user_id).await
}
