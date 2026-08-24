//! Infrastructure Repositories Module
//!
//! Repository implementations that implement domain service traits.
//!
//! Each repository implements a domain service trait using
//! infrastructure components (database, dioxus_shared services).

pub mod category_repository;
pub mod group_repository;
pub mod in_memory_todo_service;
pub mod room_repository;
pub mod subtask_repository;
pub mod task_repository;
pub mod todo_repository;

// TODO: Add more repositories as needed
// - chat_repository.rs
