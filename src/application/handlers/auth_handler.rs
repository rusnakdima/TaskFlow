//! Auth KAS Handler
//!
//! Knowledge Action Service handler for authentication operations.

use crate::application::state::AppState;
use crate::infrastructure::externals::dioxus_shared::{dioxus_shared, Response};
use serde::{Deserialize};
use std::sync::Arc;

pub type HandlerResult<T> = Result<Response<T>, String>;

#[derive(Debug, Deserialize)]
pub struct LoginData {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterData {
    pub email: String,
    pub password: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordData {
    pub user_id: String,
    pub old_password: String,
    pub new_password: String,
}

pub struct AuthHandler {
    state: Arc<AppState>,
}

impl AuthHandler {
    pub fn new(state: Arc<AppState>) -> Self {
        Self { state }
    }

    pub async fn login(&self, data: LoginData) -> HandlerResult<serde_json::Value> {
        let base_crud = dioxus_shared::services::BaseCrudService::new(self.state.json_provider.clone());
        
        // Find user by email
        let result = base_crud
            .get_all("users")
            .await
            .map_err(|e| e.to_string())?;

        let users = serde_json::from_value::<Vec<crate::domain::entities::user::UserEntity>>(result.data)
            .map_err(|e| e.to_string())?;

        let user = users
            .into_iter()
            .find(|u| u.email == data.email);

        match user {
            Some(user) => {
                // Verify password (simplified - in production use bcrypt)
                if user.password_hash == data.password {
                    self.state.set_current_user(user.clone());
                    Ok(Response::success(
                        serde_json::json!({
                            "user_id": user.id,
                            "email": user.email,
                            "name": user.name
                        }),
                        Some("Login successful")
                    ))
                } else {
                    Ok(Response::error(
                        dioxus_shared::response::Status::Unauthorized,
                        "Invalid credentials",
                    ))
                }
            }
            None => Ok(Response::error(
                dioxus_shared::response::Status::NotFound,
                "User not found",
            )),
        }
    }

    pub async fn register(&self, data: RegisterData) -> HandlerResult<crate::domain::entities::user::UserEntity> {
        let base_crud = dioxus_shared::services::BaseCrudService::new(self.state.json_provider.clone());
        
        // Check if user already exists
        let result = base_crud
            .get_all("users")
            .await
            .map_err(|e| e.to_string())?;

        let users = serde_json::from_value::<Vec<crate::domain::entities::user::UserEntity>>(result.data)
            .map_err(|e| e.to_string())?;

        if users.iter().any(|u| u.email == data.email) {
            return Ok(Response::error(
                dioxus_shared::response::Status::ValidationError,
                "Email already registered",
            ));
        }

        let user = crate::domain::entities::user::UserEntity {
            id: None,
            email: data.email,
            name: data.name,
            password_hash: data.password, // In production, hash this!
            created_at: Some(chrono::Utc::now()),
            updated_at: Some(chrono::Utc::now()),
        };

        let value = serde_json::to_value(&user).map_err(|e| e.to_string())?;

        let result = base_crud
            .create("users", value)
            .await
            .map_err(|e| e.to_string())?;

        Ok(Response::success(user, Some("Registered")))
    }

    pub async fn logout(&self) -> HandlerResult<serde_json::Value> {
        self.state.clear_current_user();
        
        Ok(Response::success(
            serde_json::json!({"message": "Logged out"}),
            Some("Logout successful")
        ))
    }

    pub async fn get_current_user(&self) -> HandlerResult<serde_json::Value> {
        match self.state.get_current_user() {
            Some(user) => Ok(Response::success(
                serde_json::json!({
                    "user_id": user.id,
                    "email": user.email,
                    "name": user.name
                }),
                Some("User found")
            )),
            None => Ok(Response::error(
                dioxus_shared::response::Status::Unauthorized,
                "Not authenticated",
            )),
        }
    }

    pub async fn change_password(&self, data: ChangePasswordData) -> HandlerResult<serde_json::Value> {
        let base_crud = dioxus_shared::services::BaseCrudService::new(self.state.json_provider.clone());
        
        let update_data = serde_json::json!({
            "password_hash": data.new_password,
            "updated_at": chrono::Utc::now().to_rfc3339()
        });

        base_crud
            .update("users", &data.user_id, update_data)
            .await
            .map_err(|e| e.to_string())?;

        Ok(Response::success(
            serde_json::json!({"message": "Password changed"}),
            Some("Password updated")
        ))
    }
}
