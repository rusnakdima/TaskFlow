//! Dashboard Page
//!
//! Overview of user's task flow.

use dioxus::prelude::*;

#[allow(non_snake_case)]
pub fn Dashboard() -> Element {
    rsx! {
        div {
            class: "space-y-6",
            div {
                class: "flex items-center justify-between",
                h2 {
                    class: "text-2xl font-bold text-gray-900",
                    "Dashboard"
                }
            }

            // Stats cards
            div {
                class: "grid grid-cols-1 sm:grid-cols-3 gap-4",
                div {
                    class: "bg-white rounded-xl shadow-sm border border-gray-200 p-6",
                    p {
                        class: "text-sm font-medium text-gray-500",
                        "Total Todos"
                    }
                    p {
                        class: "mt-2 text-3xl font-bold text-gray-900",
                        "0"
                    }
                }
                div {
                    class: "bg-white rounded-xl shadow-sm border border-gray-200 p-6",
                    p {
                        class: "text-sm font-medium text-gray-500",
                        "Completed"
                    }
                    p {
                        class: "mt-2 text-3xl font-bold text-gray-900",
                        "0"
                    }
                }
                div {
                    class: "bg-white rounded-xl shadow-sm border border-gray-200 p-6",
                    p {
                        class: "text-sm font-medium text-gray-500",
                        "In Progress"
                    }
                    p {
                        class: "mt-2 text-3xl font-bold text-gray-900",
                        "0"
                    }
                }
            }

            // Quick actions
            div {
                class: "bg-white rounded-xl shadow-sm border border-gray-200 p-6",
                h3 {
                    class: "text-lg font-semibold text-gray-900 mb-4",
                    "Quick Actions"
                }
                div {
                    class: "grid grid-cols-1 sm:grid-cols-2 gap-3",
                    a {
                        class: "flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors",
                        href: "#",
                        div {
                            class: "w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center",
                            svg {
                                class: "w-5 h-5 text-blue-600",
                                fill: "none",
                                view_box: "0 0 24 24",
                                stroke: "currentColor",
                                stroke_width: "2",
                                path {
                                    stroke_linecap: "round",
                                    stroke_linejoin: "round",
                                    d: "M12 4v16m8-8H4"
                                }
                            }
                        }
                        div {
                            p { class: "font-medium text-gray-900", "Create Todo" }
                            p { class: "text-sm text-gray-500", "Add a new task to your list" }
                        }
                    }

                    a {
                        class: "flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors",
                        href: "#",
                        div {
                            class: "w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center",
                            svg {
                                class: "w-5 h-5 text-green-600",
                                fill: "none",
                                view_box: "0 0 24 24",
                                stroke: "currentColor",
                                stroke_width: "2",
                                path {
                                    stroke_linecap: "round",
                                    stroke_linejoin: "round",
                                    d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                }
                            }
                        }
                        div {
                            p { class: "font-medium text-gray-900", "View Completed" }
                            p { class: "text-sm text-gray-500", "See your finished tasks" }
                        }
                    }
                }
            }

            // Welcome message
            div {
                class: "bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl shadow-sm p-6 text-white",
                h3 {
                    class: "text-lg font-semibold",
                    "Welcome to TaskFlow"
                }
                p {
                    class: "mt-1 text-blue-100",
                    "Manage your todos and tasks efficiently. Click Todos to get started."
                }
            }
        }
    }
}
