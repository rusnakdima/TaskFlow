//! Infrastructure Externals Module
//!
//! Bridge code to call `dioxus_shared` services.
//!
//! # Purpose
//! This module re-exports types from `dioxus_shared` for use
//! by infrastructure layer implementations.
//!
//! # Key Rule
//! Domain layer NEVER imports from this module.
//! Only infrastructure layer uses these re-exports.

pub mod dioxus_shared;

// Re-export dioxus_shared for convenience in infrastructure
pub use dioxus_shared::*;
