/* providers - nosql_orm providers */
pub use nosql_orm::providers::JsonProvider;
pub use nosql_orm::providers::MongoProvider;

pub mod json_provider {
  pub use nosql_orm::providers::JsonProvider;
}

pub mod mongodb_provider {
  pub use nosql_orm::providers::MongoProvider;
}

#[path = "base_crud.provider.rs"]
pub mod base_crud;

#[path = "email.provider.rs"]
pub mod email_provider;

#[path = "relation_loader.provider.rs"]
pub mod relation_loader;
