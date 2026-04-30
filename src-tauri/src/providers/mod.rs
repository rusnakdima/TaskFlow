/* providers - nosql_orm providers with pooling support */

pub mod json_provider {
  pub use nosql_orm::providers::JsonProvider;
}

pub mod mongodb_provider {
  pub use nosql_orm::providers::MongoProvider;
}

#[path = "email.provider.rs"]
pub mod email_provider;

#[path = "data.provider.rs"]
pub mod data_provider;
