use crate::domain::entities::room::{RoomCreateModel, RoomEntity};
use crate::domain::services::room_service::RoomService;
use crate::domain::services::DomainError;
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use std::sync::Arc;

pub struct RoomRepository {
    base_crud: Arc<BaseCrudService>,
}

impl RoomRepository {
    pub fn new(base_crud: Arc<BaseCrudService>) -> Self {
        Self { base_crud }
    }
}

#[async_trait::async_trait]
impl RoomService for RoomRepository {
    async fn create(&self, room: &RoomCreateModel) -> Result<RoomEntity, DomainError> {
        let data =
            serde_json::to_value(room).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .create("rooms", data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(RoomEntity::from_create_model(room.clone()))
    }

    async fn get_by_id(&self, id: &str) -> Result<Option<RoomEntity>, DomainError> {
        let result = self
            .base_crud
            .get("rooms", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        match result.data {
            Some(data) => {
                let room = serde_json::from_value::<RoomEntity>(data)
                    .map_err(|e| DomainError::Serialization(e.to_string()))?;
                Ok(Some(room))
            }
            None => Ok(None),
        }
    }

    async fn get_by_user(&self, user_id: &str) -> Result<Vec<RoomEntity>, DomainError> {
        let result = self
            .base_crud
            .get_all("rooms")
            .await
            .map_err(DomainError::Infrastructure)?;

        let rooms: Vec<RoomEntity> = serde_json::from_value(
            result
                .data
                .ok_or_else(|| DomainError::Serialization("No data".into()))?,
        )
        .map_err(|e| DomainError::Serialization(e.to_string()))?;

        let filtered: Vec<RoomEntity> = rooms
            .into_iter()
            .filter(|r| r.participant_ids.contains(&user_id.to_string()))
            .collect();

        Ok(filtered)
    }

    async fn update(&self, room: &RoomEntity) -> Result<RoomEntity, DomainError> {
        let id = room
            .id
            .as_ref()
            .ok_or_else(|| DomainError::Validation("Room ID is required for update".to_string()))?;

        let data =
            serde_json::to_value(room).map_err(|e| DomainError::Serialization(e.to_string()))?;

        self.base_crud
            .update("rooms", id, data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(room.clone())
    }

    async fn delete(&self, id: &str, _user_id: &str) -> Result<(), DomainError> {
        self.base_crud
            .delete("rooms", id)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn add_participant(
        &self,
        id: &str,
        participant_id: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "participant_ids": [participant_id] });

        self.base_crud
            .update("rooms", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }

    async fn remove_participant(
        &self,
        id: &str,
        participant_id: &str,
        _user_id: &str,
    ) -> Result<(), DomainError> {
        let update_data = serde_json::json!({ "participant_ids": [participant_id] });

        self.base_crud
            .update("rooms", id, update_data)
            .await
            .map_err(DomainError::Infrastructure)?;

        Ok(())
    }
}
