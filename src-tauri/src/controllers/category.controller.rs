/* helpers */
use crate::helpers::json_provider::JsonProvider;

/* services */
use crate::services::category_service::CategoriesService;

/* models */
use crate::models::{
  category_model::{CategoryCreateModel, CategoryModel},
  response_model::ResponseModel,
};

#[allow(non_snake_case)]
pub struct CategoriesController {
  pub categoriesService: CategoriesService,
}

impl CategoriesController {
  #[allow(non_snake_case)]
  pub fn new(jsonProvider: JsonProvider) -> Self {
    Self {
      categoriesService: CategoriesService::new(jsonProvider),
    }
  }

  #[allow(non_snake_case)]
  pub async fn getAllByField(
    &self,
    nameField: String,
    value: String,
  ) -> Result<ResponseModel, ResponseModel> {
    return self.categoriesService.getAllByField(nameField, value).await;
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
