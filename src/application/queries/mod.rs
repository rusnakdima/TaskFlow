//! Application Queries Module
//!
//! Query handlers for read operations.
//!
//! # Architecture
//! Queries are read-only operations that:
//! - Never modify domain state
//! - May call infrastructure for data access
//! - Return domain entities or DTOs
//!
//! # Naming Convention
//! - `GetTodo` - gets a single todo
//! - `ListTodos` - lists todos
//! - `SearchTodos` - searches todos

pub mod get_todo;
pub mod list_todos;
pub mod search_todos;

// Re-exports
pub use get_todo::GetTodo;
pub use list_todos::ListTodos;
pub use search_todos::SearchTodos;
