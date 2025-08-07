/* services */
use crate::services::todo_service;

/* models */
use crate::models::{response::ResponseModel, todo_model::TodoModel};

#[allow(non_snake_case)]
pub struct TodoController {
  pub todoService: todo_service::TodoService,
}

impl TodoController {
  pub fn new() -> Self {
    Self {
      todoService: todo_service::TodoService::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn get_all(&self) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.get_all().await;
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.get(id).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: TodoModel) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(&self, id: String, data: TodoModel) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.todoService.delete(id).await;
  }
}
