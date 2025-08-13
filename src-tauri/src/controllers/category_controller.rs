/* services */
use crate::services::category_service;

/* models */
use crate::models::{
  category_model::{CategoryCreateModel, CategoryModel},
  response::ResponseModel,
};

#[allow(non_snake_case)]
pub struct CategoriesController {
  pub categoriesService: category_service::CategoriesService,
}

impl CategoriesController {
  pub fn new() -> Self {
    Self {
      categoriesService: category_service::CategoriesService::new(),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAll(&self) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.getAll().await;
  }

  #[allow(non_snake_case)]
  pub async fn getByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.getByField(nameField, value).await;
  }

  #[allow(non_snake_case)]
  pub async fn get(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.get(id).await;
  }

  #[allow(non_snake_case)]
  pub async fn create(&self, data: CategoryCreateModel) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.create(data).await;
  }

  #[allow(non_snake_case)]
  pub async fn update(
    &self,
    id: String,
    data: CategoryModel,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.update(id, data).await;
  }

  #[allow(non_snake_case)]
  pub async fn delete(&self, id: String) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.delete(id).await;
  }
}
