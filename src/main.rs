#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use taskflow_lib::presentation::Root;

fn main() {
    dioxus::LaunchBuilder::desktop().launch(Root);
}
