//! Settings Page

use dioxus::prelude::*;

#[allow(non_snake_case)]
pub fn SettingsPage() -> Element {
    rsx! {
        div {
            class: "space-y-6",
            div {
                class: "flex items-center justify-between",
                h2 {
                    class: "text-2xl font-bold text-gray-900",
                    "Settings"
                }
            }

            div {
                class: "bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-200",
                // Profile section
                div {
                    class: "p-6",
                    h3 {
                        class: "text-lg font-semibold text-gray-900 mb-4",
                        "Profile"
                    }
                    div {
                        class: "space-y-4",
                        div {
                            label {
                                class: "block text-sm font-medium text-gray-700",
                                "Display Name"
                            }
                            input {
                                class: "mt-1 w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                                r#type: "text",
                                value: "Default User",
                            }
                        }
                        div {
                            label {
                                class: "block text-sm font-medium text-gray-700",
                                "Email"
                            }
                            input {
                                class: "mt-1 w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                                r#type: "email",
                                value: "user@example.com",
                            }
                        }
                    }
                    div {
                        class: "mt-4",
                        button {
                            class: "px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors",
                            "Save Changes"
                        }
                    }
                }

                // Appearance section
                div {
                    class: "p-6",
                    h3 {
                        class: "text-lg font-semibold text-gray-900 mb-4",
                        "Appearance"
                    }
                    div {
                        class: "flex items-center gap-3",
                        span {
                            class: "text-sm text-gray-600",
                            "Theme"
                        }
                        select {
                            class: "px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                            option { value: "light", "Light" }
                            option { value: "dark", "Dark" }
                            option { value: "system", "System" }
                        }
                    }
                }

                // Notifications section
                div {
                    class: "p-6",
                    h3 {
                        class: "text-lg font-semibold text-gray-900 mb-4",
                        "Notifications"
                    }
                    div {
                        class: "space-y-3",
                        label {
                            class: "flex items-center gap-3 cursor-pointer",
                            input {
                                class: "w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500",
                                r#type: "checkbox",
                            }
                            span {
                                class: "text-sm text-gray-700",
                                "Email notifications"
                            }
                        }
                        label {
                            class: "flex items-center gap-3 cursor-pointer",
                            input {
                                class: "w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500",
                                r#type: "checkbox",
                                checked: true,
                            }
                            span {
                                class: "text-sm text-gray-700",
                                "Push notifications"
                            }
                        }
                    }
                }
            }
        }
    }
}
