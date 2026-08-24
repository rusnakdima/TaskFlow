//! Room KAS Handler
//!
//! Knowledge Action Service handler for Room operations.

use crate::application::state::AppState;
use crate::domain::entities::room::{RoomEntity, RoomCreateModel};
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize};
use std::sync::Arc;

pub type HandlerResult<T> = Result<Response<T>, String>;

#[derive(Debug, Deserialize)]
pub struct CreateRoomData {
    pub name: Option<String>,
    pub room: String,
    pub is_group: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRoomData {
    pub name: Option<String>,
}

pub struct RoomHandler {
    state: Arc<AppState>,
}

impl RoomHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn get(&self, id: String) -> HandlerResult<RoomEntity> {
        let result = self.state.room_service.get_by_id(&id).await;

        match result {
            Ok(Some(room)) => Ok(Response::success(room, Some("Found"))),
            Ok(None) => Ok(Response::not_found("Room")),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn list_by_user(&self, user_id: String) -> HandlerResult<Vec<RoomEntity>> {
        let result = self.state.room_service.get_by_user(&user_id).await;

        match result {
            Ok(rooms) => Ok(Response::success(rooms, Some("Found"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn create(&self, data: CreateRoomData) -> HandlerResult<RoomEntity> {
        if data.room.is_empty() {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Room identifier cannot be empty",
            ));
        }

        let model = RoomCreateModel {
            name: data.name,
            room: data.room,
            is_group: data.is_group,
            participant_ids: vec![],
        };

        let result = self.state.room_service.create(&model).await;

        match result {
            Ok(room) => Ok(Response::success(room, Some("Created"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn update(&self, id: String, data: UpdateRoomData) -> HandlerResult<RoomEntity> {
        // First get the existing room
        let existing = match self.state.room_service.get_by_id(&id).await {
            Ok(Some(room)) => room,
            Ok(None) => return Ok(Response::not_found("Room")),
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        let mut updated_room = existing.clone();
        if let Some(name) = data.name {
            updated_room.name = Some(name);
        }

        let result = self.state.room_service.update(&updated_room).await;

        match result {
            Ok(room) => Ok(Response::success(room, Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn delete(&self, id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.room_service.delete(&id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Deleted"}), Some("Deleted"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn add_participant(&self, id: String, participant_id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.room_service.add_participant(&id, &participant_id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Participant added"}), Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn remove_participant(&self, id: String, participant_id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.room_service.remove_participant(&id, &participant_id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Participant removed"}), Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }
}
