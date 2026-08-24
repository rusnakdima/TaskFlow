//! Presentation Module
//!
//! Dioxus UI components and pages.

use dioxus::prelude::*;

pub mod components;
pub mod pages;

// Re-export for convenience
pub use components::{Button, TodoCard};
pub use pages::{Dashboard, SettingsPage, TodosPage};

// Re-export InMemoryTodoService from infrastructure (DDD: service implementation belongs in infrastructure)
pub use crate::infrastructure::InMemoryTodoService;

// =============================================================================
// ROOT COMPONENT
// =============================================================================

/// Root application component with navigation shell.
#[allow(non_snake_case)]
pub fn Root() -> Element {
    let mut active_page = use_signal(|| "todos".to_string());

    let dashboard_class = if active_page() == "dashboard" {
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-blue-100 text-blue-700"
    } else {
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-gray-600 hover:bg-gray-100"
    };

    let todos_class = if active_page() == "todos" {
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-blue-100 text-blue-700"
    } else {
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-gray-600 hover:bg-gray-100"
    };

    let settings_class = if active_page() == "settings" {
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-blue-100 text-blue-700"
    } else {
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors text-gray-600 hover:bg-gray-100"
    };

    rsx! {
        div {
            class: "min-h-screen bg-gray-100",
            header {
                class: "bg-white shadow-sm border-b border-gray-200",
                div {
                    class: "max-w-7xl mx-auto px-4 py-4",
                    div {
                        class: "flex items-center justify-between",
                        h1 {
                            class: "text-xl font-bold text-gray-900",
                            "TaskFlow"
                        }
                        nav {
                            class: "flex gap-4",
                            button {
                                class: "{dashboard_class}",
                                onclick: move |_| active_page.set("dashboard".to_string()),
                                "Dashboard"
                            }
                            button {
                                class: "{todos_class}",
                                onclick: move |_| active_page.set("todos".to_string()),
                                "Todos"
                            }
                            button {
                                class: "{settings_class}",
                                onclick: move |_| active_page.set("settings".to_string()),
                                "Settings"
                            }
                        }
                    }
                }
            }

            main {
                class: "max-w-7xl mx-auto px-4 py-6",
                if active_page() == "dashboard" {
                    Dashboard {}
                } else if active_page() == "todos" {
                    TodosPage {}
                } else if active_page() == "settings" {
                    SettingsPage {}
                }
            }
        }
    }
}
