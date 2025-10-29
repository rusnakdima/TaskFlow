/* sys lib */
use mongodb::bson::{oid::ObjectId, Uuid};
use serde::{Deserialize, Serialize};

/* models */
use crate::models::user_model::UserFullModel;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CategoryCreateModel {
  pub title: String,
  pub userId: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct CategoryModel {
  pub _id: ObjectId,
  pub id: String,
  pub title: String,
  pub userId: String,
  pub isDeleted: bool,
}

impl From<CategoryCreateModel> for CategoryModel {
  fn from(value: CategoryCreateModel) -> Self {
    CategoryModel {
      _id: ObjectId::new(),
      id: Uuid::new().to_string(),
      title: value.title,
      userId: value.userId,
      isDeleted: false,
    }
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
#[allow(unused)]
pub struct CategoryFullModel {
  pub _id: ObjectId,
  pub id: String,
  pub title: String,
  pub user: UserFullModel,
  pub isDeleted: bool,
}
