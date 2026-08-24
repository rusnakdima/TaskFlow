//! Button Component

use dioxus::prelude::*;

#[allow(non_snake_case)]
pub fn Button() -> Element {
    rsx! {
        button {
            class: "px-4 py-2 bg-blue-600 text-white rounded",
            "Button"
        }
    }
}
