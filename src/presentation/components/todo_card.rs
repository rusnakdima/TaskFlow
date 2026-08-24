use dioxus::prelude::*;

#[component]
pub fn TodoCard(
    id: String,
    title: String,
    description: Option<String>,
    priority: String,
    is_completed: bool,
    on_toggle: EventHandler<()>,
    on_delete: EventHandler<()>,
) -> Element {
    let priority_color = match priority.as_str() {
        "urgent" => "bg-red-100 text-red-700 border-red-200",
        "high" => "bg-orange-100 text-orange-700 border-orange-200",
        "medium" => "bg-yellow-100 text-yellow-700 border-yellow-200",
        "low" => "bg-green-100 text-green-700 border-green-200",
        _ => "bg-gray-100 text-gray-700 border-gray-200",
    };

    let priority_label = match priority.as_str() {
        "urgent" => "Urgent",
        "high" => "High",
        "medium" => "Medium",
        "low" => "Low",
        _ => "Unknown",
    };

    let title_class = if is_completed {
        "font-medium text-gray-900 line-through text-gray-400"
    } else {
        "font-medium text-gray-900"
    };

    let checkbox_class = if is_completed {
        "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors bg-blue-600 border-blue-600"
    } else {
        "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors border-gray-300 hover:border-blue-400"
    };

    rsx! {
        div {
            class: "bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow",
            div {
                class: "flex items-start gap-3",
                button {
                    class: "{checkbox_class}",
                    onclick: move |_| on_toggle.call(()),
                    if is_completed {
                        svg {
                            class: "w-3 h-3 text-white",
                            fill: "none",
                            view_box: "0 0 24 24",
                            stroke: "currentColor",
                            stroke_width: "3",
                            path {
                                stroke_linecap: "round",
                                stroke_linejoin: "round",
                                d: "M5 13l4 4L19 7"
                            }
                        }
                    }
                }

                div {
                    class: "flex-1 min-w-0",
                    div {
                        class: "flex items-center gap-2 flex-wrap",
                        h3 {
                            class: "{title_class}",
                            "{title}"
                        }
                        span {
                            class: "px-2 py-0.5 text-xs font-medium rounded-full border {priority_color}",
                            "{priority_label}"
                        }
                    }

                    if let Some(desc) = &description {
                        if !desc.is_empty() {
                            p {
                                class: "mt-1 text-sm text-gray-500 line-clamp-2",
                                "{desc}"
                            }
                        }
                    }
                }

                button {
                    class: "p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0",
                    onclick: move |_| on_delete.call(()),
                    title: "Delete todo",
                    svg {
                        class: "w-4 h-4",
                        fill: "none",
                        view_box: "0 0 24 24",
                        stroke: "currentColor",
                        stroke_width: "2",
                        path {
                            stroke_linecap: "round",
                            stroke_linejoin: "round",
                            d: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        }
                    }
                }
            }
        }
    }
}
