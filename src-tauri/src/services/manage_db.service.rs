/* helpers */
use crate::{
  helpers::{json_provider::JsonProvider, mongodb_provider::MongodbProvider},
  models::response_model::{DataValue, ResponseStatus},
};

/* models */
use crate::models::response_model::ResponseModel;

#[allow(non_snake_case)]
pub struct ManageDbService {
  pub jsonProvider: JsonProvider,
  pub mongodbProvider: MongodbProvider,
}

impl ManageDbService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider, mongodbProvider: MongodbProvider) -> Self {
    Self {
      jsonProvider: jsonProvider,
      mongodbProvider: mongodbProvider,
    }
  }

  #[allow(non_snake_case)]
  pub async fn importToJsonDb(&self) -> Result<ResponseModel, ResponseModel> {
    return Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "".to_string(),
      data: DataValue::String("".to_string()),
    });
  }

  #[allow(non_snake_case)]
  pub async fn exportFromJsonDb(&self) -> Result<ResponseModel, ResponseModel> {
    return Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "".to_string(),
      data: DataValue::String("".to_string()),
    });
  }

  #[allow(non_snake_case)]
  pub async fn importToMongoDb(&self) -> Result<ResponseModel, ResponseModel> {
    return Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "".to_string(),
      data: DataValue::String("".to_string()),
    });
  }

  #[allow(non_snake_case)]
  pub async fn exportFromMongoDb(&self) -> Result<ResponseModel, ResponseModel> {
    return Err(ResponseModel {
      status: ResponseStatus::Error,
      message: "".to_string(),
      data: DataValue::String("".to_string()),
    });
  }
}
