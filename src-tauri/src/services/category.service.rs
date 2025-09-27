/* sys lib */
use serde_json::{json, to_value, Value};

/* helpers */
use crate::helpers::{
  common::{convertDataToArray, convertDataToObject},
  json_provider::JsonProvider,
};

/* models */
use crate::models::{
  category_model::{CategoryCreateModel, CategoryModel},
  relation_obj::{RelationObj, TypesField},
  response_model::{DataValue, ResponseModel, ResponseStatus},
};

#[derive(Clone)]
#[allow(non_snake_case)]
pub struct CategoriesService {
  pub jsonProvider: JsonProvider,
  relations: Vec<RelationObj>,
}

impl CategoriesService {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      jsonProvider: jsonProvider,
      relations: vec![
        RelationObj {
          nameTable: "todos".to_string(),
          typeField: TypesField::ManyToMany,
          nameField: "categories".to_string(),
          newNameField: "todos".to_string(),
          relations: Some(vec![RelationObj {
            nameTable: "tasks".to_string(),
            typeField: TypesField::OneToMany,
            nameField: "todoId".to_string(),
            newNameField: "tasks".to_string(),
            relations: Some(vec![RelationObj {
              nameTable: "subtasks".to_string(),
              typeField: TypesField::OneToMany,
              nameField: "taskId".to_string(),
              newNameField: "subtasks".to_string(),
              relations: None,
            }]),
          }]),
        },
        RelationObj {
          nameTable: "users".to_string(),
          typeField: TypesField::OneToOne,
          nameField: "userId".to_string(),
          newNameField: "user".to_string(),
          relations: Some(vec![RelationObj {
            nameTable: "profiles".to_string(),
            typeField: TypesField::OneToOne,
            nameField: "profileId".to_string(),
            newNameField: "profile".to_string(),
            relations: None,
          }]),
        },
      ],
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let listCategories = self
      .jsonProvider
      .getAllByField(
        "categories",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
      )
      .await;
    match listCategories {
      Ok(categories) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToArray(&categories),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a list of categories! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    let category = self
      .jsonProvider
      .getByField(
        "categories",
        if nameField != "" {
          Some(json!({ nameField: value }))
        } else {
          None
        },
        Some(self.relations.clone()),
        "",
      )
      .await;
    match category {
      Ok(category) => {
        return Ok(ResponseModel {
          status: ResponseStatus::Success,
          message: "".to_string(),
          data: convertDataToObject(&category),
        });
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't get a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: CategoryCreateModel) -> Result<ResponseModel, ResponseModel> {
    let modelData: CategoryModel = data.into();
    let record: Value = to_value(&modelData).unwrap();
    let category = self.jsonProvider.create("categories", record).await;
    match category {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't create a category!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't create a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: CategoryModel,
  ) -> Result<ResponseModel, ResponseModel> {
    let record: Value = to_value(&data).unwrap();
    let category = self
      .jsonProvider
      .update("categories", &id.as_str(), record)
      .await;
    match category {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't update a category!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't update a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    let category = self.jsonProvider.delete("categories", &id.as_str()).await;
    match category {
      Ok(result) => {
        if result {
          return Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "".to_string(),
            data: DataValue::String("".to_string()),
          });
        } else {
          return Ok(ResponseModel {
            status: ResponseStatus::Error,
            message: "Couldn't delete a category!".to_string(),
            data: DataValue::String("".to_string()),
          });
        }
      }
      Err(error) => {
        return Err(ResponseModel {
          status: ResponseStatus::Error,
          message: format!("Couldn't delete a category! {}", error.to_string()),
          data: DataValue::String("".to_string()),
        });
      }
    }
  }
}
