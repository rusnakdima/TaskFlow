//! Group KAS Handler
//!
//! Knowledge Action Service handler for Group operations.

use crate::application::state::AppState;
use crate::domain::entities::group::{GroupEntity, GroupCreateModel};
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize};
use std::sync::Arc;

pub type HandlerResult<T> = Result<Response<T>, String>;

#[derive(Debug, Deserialize)]
pub struct CreateGroupData {
    pub name: String,
    pub room_id: String,
    pub owner_id: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGroupData {
    pub name: Option<String>,
    pub avatar: Option<String>,
}

pub struct GroupHandler {
    state: Arc<AppState>,
}

impl GroupHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn get(&self, id: String) -> HandlerResult<GroupEntity> {
        let result = self.state.group_service.get_by_id(&id).await;

        match result {
            Ok(Some(group)) => Ok(Response::success(group, Some("Found"))),
            Ok(None) => Ok(Response::not_found("Group")),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn list_by_room(&self, room_id: String) -> HandlerResult<Vec<GroupEntity>> {
        let result = self.state.group_service.get_by_room(&room_id).await;

        match result {
            Ok(groups) => Ok(Response::success(groups, Some("Found"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn create(&self, data: CreateGroupData) -> HandlerResult<GroupEntity> {
        if data.name.is_empty() {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Group name cannot be empty",
            ));
        }

        let model = GroupCreateModel {
            name: data.name,
            avatar: None,
            room_id: data.room_id,
            owner_id: data.owner_id,
            member_ids: vec![],
        };

        let result = self.state.group_service.create(&model).await;

        match result {
            Ok(group) => Ok(Response::success(group, Some("Created"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn update(&self, id: String, data: UpdateGroupData) -> HandlerResult<GroupEntity> {
        // First get the existing group
        let existing = match self.state.group_service.get_by_id(&id).await {
            Ok(Some(group)) => group,
            Ok(None) => return Ok(Response::not_found("Group")),
            Err(e) => return Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        };

        let mut updated_group = existing.clone();
        if let Some(name) = data.name {
            updated_group.name = name;
        }
        if let Some(avatar) = data.avatar {
            updated_group.avatar = Some(avatar);
        }

        let result = self.state.group_service.update(&updated_group).await;

        match result {
            Ok(group) => Ok(Response::success(group, Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn delete(&self, id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.group_service.delete(&id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Deleted"}), Some("Deleted"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn add_member(&self, id: String, member_id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.group_service.add_member(&id, &member_id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Member added"}), Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }

    pub async fn remove_member(&self, id: String, member_id: String, user_id: String) -> HandlerResult<serde_json::Value> {
        let result = self.state.group_service.remove_member(&id, &member_id, &user_id).await;

        match result {
            Ok(_) => Ok(Response::success(serde_json::json!({"message": "Member removed"}), Some("Updated"))),
            Err(e) => Ok(Response::error(dioxus_shared::response::Status::Error, e.to_string())),
        }
    }
}
