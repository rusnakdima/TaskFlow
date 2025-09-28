/* sys lib */
use crate::AppState;
use tauri::State;

/* models */
use crate::models::{
  profile_model::{ProfileCreateModel, ProfileUpdateModel},
  response_model::ResponseModel,
};

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetAllByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  match &state.profileController {
    Some(profileController) => {
      let result = profileController.getAllByField(nameField, value).await;
      result
    }
    None => Err(ResponseModel {
      status: crate::models::response_model::ResponseStatus::Error,
      message: "Profile management not available".to_string(),
      data: crate::models::response_model::DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileGetByField(
  state: State<'_, AppState>,
  nameField: String,
  value: String,
) -> Result<ResponseModel, ResponseModel> {
  match &state.profileController {
    Some(profileController) => {
      let result = profileController.getByField(nameField, value).await;
      result
    }
    None => Err(ResponseModel {
      status: crate::models::response_model::ResponseStatus::Error,
      message: "Profile management not available".to_string(),
      data: crate::models::response_model::DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileCreate(
  state: State<'_, AppState>,
  data: ProfileCreateModel,
) -> Result<ResponseModel, ResponseModel> {
  match &state.profileController {
    Some(profileController) => {
      let result = profileController.create(data).await;
      result
    }
    None => Err(ResponseModel {
      status: crate::models::response_model::ResponseStatus::Error,
      message: "Profile management not available".to_string(),
      data: crate::models::response_model::DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileUpdate(
  state: State<'_, AppState>,
  id: String,
  data: ProfileUpdateModel,
) -> Result<ResponseModel, ResponseModel> {
  match &state.profileController {
    Some(profileController) => {
      let result = profileController.update(id, data).await;
      result
    }
    None => Err(ResponseModel {
      status: crate::models::response_model::ResponseStatus::Error,
      message: "Profile management not available".to_string(),
      data: crate::models::response_model::DataValue::String("".to_string()),
    }),
  }
}

#[allow(non_snake_case)]
#[tauri::command]
pub async fn profileDelete(
  state: State<'_, AppState>,
  id: String,
) -> Result<ResponseModel, ResponseModel> {
  match &state.profileController {
    Some(profileController) => {
      let result = profileController.delete(id).await;
      result
    }
    None => Err(ResponseModel {
      status: crate::models::response_model::ResponseStatus::Error,
      message: "Profile management not available".to_string(),
      data: crate::models::response_model::DataValue::String("".to_string()),
    }),
  }
}
