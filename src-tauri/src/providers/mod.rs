// Nested provider modules (source of truth)
pub mod json;
pub mod mongodb;

// Re-export nested modules' contents for backward compatibility
// This allows imports like `crate::providers::json_provider::JsonProvider` to work
pub use json::json_provider;
pub use mongodb::mongodb_provider;

// Base providers (not nested)
#[path = "base_crud.provider.rs"]
pub mod base_crud;

#[path = "email.provider.rs"]
pub mod email_provider;
