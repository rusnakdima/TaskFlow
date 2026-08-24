use crate::domain::entities::group::{GroupCreateModel, GroupEntity};
use crate::domain::services::group_service::GroupService;
use crate::domain::services::DomainError;
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use std::sync::Arc;

pub struct GroupRepository {
    base_crud: Arc<BaseCrudService>,
}

impl GroupRepository {
    pub fn new(base_crud: Arc<BaseCrudService>) -> Self {
        Self { base_crud }
    }
}

#[async_trait::async_trait]
impl GroupService for GroupRepository {
    async fn create(&self, group: &GroupCreateModel) -> Result<GroupEntity, DomainError> {
        let data =
            serde_json::to_value(group).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .create("groups", data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(GroupEntity::from_create_model(group.clone()))
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<GroupEntity>, DomainError> {
        let result = self
            .base_crud
            .get("groups", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        match result.data {
            Some(data) => {
                let group = serde_json::from_value::<GroupEntity>(data)
                    .map_err(|e| DomainError::Serialization(e.to_string()))?;
                Ok(Some(group))
            }
            None => Ok(None),
        }
    }

    async fn get_by_room(&self, room_id: &str) -> Result<Vec<GroupEntity>, DomainError> {
        let result = self
            .base_crud
            .get_all("groups")
            .await
            .map_err(DomainError::Infrastructure)?;

        let groups: Vec<GroupEntity> = serde_json::from_value(
            result
                .data
                .ok_or_else(|| DomainError::Serialization("No data".into()))?,
        )
        .map_err(|e| DomainError::Serialization(e.to_string()))?;

        let filtered: Vec<GroupEntity> = groups
            .into_iter()
            .filter(|g| g.room_id == room_id)
            .collect();

        Ok(filtered)
    }

    async fn update(&self, group: &GroupEntity) -> Result<GroupEntity, DomainError> {
        let id = group.id.as_ref().ok_or_else(|| {
            DomainError::Validation("Group ID is required for update".to_string())
        })?;

        let data =
            serde_json::to_value(group).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .update("groups", id, data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(group.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        self.base_crud
            .delete("groups", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn add_member(
        &self,
        id: &str,
        member_id: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "member_ids": [member_id] });

        self.base_crud
            .update("groups", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn remove_member(
        &self,
        id: &str,
        member_id: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "member_ids": [member_id] });

        self.base_crud
            .update("groups", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }
}
