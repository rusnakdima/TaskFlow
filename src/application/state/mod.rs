use crate::domain::services::{
    CategoryService, GroupService, RoomService, SubtaskService, TaskService, TodoService,
};
use crate::infrastructure::externals::dioxus_shared::BaseCrudService;
use crate::infrastructure::{
    CategoryRepository, GroupRepository, RoomRepository, SubtaskRepository, TaskRepository,
    TodoRepository,
};
use dioxus_shared::storage::SignalStore;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub json_provider: Arc<dioxus_shared::storage::JsonProvider>,
    pub signal_store: Arc<SignalStore>,
    pub current_user: RwLock<Option<dioxus_shared::entities::user::User>>,
    pub todo_service: Arc<dyn TodoService>,
    pub task_service: Arc<dyn TaskService>,
    pub category_service: Arc<dyn CategoryService>,
    pub subtask_service: Arc<dyn SubtaskService>,
    pub group_service: Arc<dyn GroupService>,
    pub room_service: Arc<dyn RoomService>,
}

impl AppState {
    pub fn new(json_provider: Arc<dioxus_shared::storage::JsonProvider>) -> Self {
        let base_crud = Arc::new(BaseCrudService::new(json_provider.clone()));

        let todo_service: Arc<dyn TodoService> = Arc::new(TodoRepository::new(base_crud.clone()));
        let task_service: Arc<dyn TaskService> = Arc::new(TaskRepository::new(base_crud.clone()));
        let category_service: Arc<dyn CategoryService> =
            Arc::new(CategoryRepository::new(base_crud.clone()));
        let subtask_service: Arc<dyn SubtaskService> =
            Arc::new(SubtaskRepository::new(base_crud.clone()));
        let group_service: Arc<dyn GroupService> =
            Arc::new(GroupRepository::new(base_crud.clone()));
        let room_service: Arc<dyn RoomService> = Arc::new(RoomRepository::new(base_crud.clone()));

        Self {
            json_provider,
            signal_store: Arc::new(SignalStore::new()),
            current_user: RwLock::new(None),
            todo_service,
            task_service,
            category_service,
            subtask_service,
            group_service,
            room_service,
        }
    }

    pub async fn set_current_user(&self, user: dioxus_shared::entities::user::User) {
        *self.current_user.write().await = Some(user);
    }

    pub async fn clear_current_user(&self) {
        *self.current_user.write().await = None;
    }

    pub async fn get_current_user(&self) -> Option<dioxus_shared::entities::user::User> {
        self.current_user.read().await.clone()
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        Self {
            json_provider: self.json_provider.clone(),
            signal_store: self.signal_store.clone(),
            current_user: RwLock::new(None),
            todo_service: self.todo_service.clone(),
            task_service: self.task_service.clone(),
            category_service: self.category_service.clone(),
            subtask_service: self.subtask_service.clone(),
            group_service: self.group_service.clone(),
            room_service: self.room_service.clone(),
        }
    }
}
