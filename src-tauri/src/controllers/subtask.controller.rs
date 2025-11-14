/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::{
  daily_activity_service::DailyActivityService, subtask_service::SubtaskService,
  task_service::TaskService, todo_service::TodoService,
};

/* models */
use crate::models::{
  response_model::ResponseModel,
  subtask_model::{SubtaskCreateModel, SubtaskModel, SubtaskUpdateModel},
};

#[allow(non_snake_case)]
pub struct SubtaskController {
  pub subtaskService: SubtaskService,
  pub taskService: TaskService,
  pub todoService: TodoService,
  pub dailyActivityService: DailyActivityService,
}

impl SubtaskController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider, dailyActivityService: DailyActivityService) -> Self {
    let todoService = TodoService::new(jsonProvider.clone(), dailyActivityService.clone());
    let taskService = TaskService::new(
      jsonProvider.clone(),
      todoService.clone(),
      dailyActivityService.clone(),
    );
    return Self {
      subtaskService: SubtaskService::new(
        jsonProvider.clone(),
        taskService.clone(),
        todoService.clone(),
        dailyActivityService.clone(),
      ),
      taskService,
      todoService,
      dailyActivityService,
    };
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.getAllByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: SubtaskCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.createAndLog(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: SubtaskUpdateModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.updateAndLog(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn updateAll(&self, data: Vec<SubtaskModel>) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.updateAll(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.subtaskService.deleteAndLog(id).await;
  }
}
