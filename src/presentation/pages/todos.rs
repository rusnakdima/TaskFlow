use std::sync::Arc;

use dioxus::prelude::*;

use crate::application::commands::create_todo::CreateTodo;
use crate::application::commands::update_todo::UpdateTodo;
use crate::domain::entities::todo::{TodoCreateModel, TodoEntity};
use crate::domain::services::todo_service::TodoService;
use crate::presentation::components::TodoCard;
use crate::presentation::InMemoryTodoService;

#[derive(Debug, Clone, PartialEq)]
pub struct TodoUiModel {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: String,
    pub visibility: String,
    pub tasks_count: i32,
    pub completed_tasks_count: i32,
    pub is_completed: bool,
}

impl From<TodoEntity> for TodoUiModel {
    fn from(entity: TodoEntity) -> Self {
        Self {
            id: entity.id.unwrap_or_default(),
            title: entity.title,
            description: entity.description,
            priority: entity.priority,
            visibility: entity.visibility,
            tasks_count: entity.tasks_count,
            completed_tasks_count: entity.completed_tasks_count,
            is_completed: entity.tasks_count > 0
                && entity.completed_tasks_count == entity.tasks_count,
        }
    }
}

#[derive(Props, Clone, PartialEq)]
struct TodoItemProps {
    todo: TodoUiModel,
    service: Arc<InMemoryTodoService>,
    todos: Signal<Vec<TodoUiModel>>,
    error_msg: Signal<Option<String>>,
}

#[allow(non_snake_case)]
fn TodoItem(props: TodoItemProps) -> Element {
    let todo_id_toggle = props.todo.id.clone();
    let todo_id_delete = props.todo.id.clone();

    let service_toggle = props.service.clone();
    let todos_toggle = props.todos;
    let error_msg_toggle = props.error_msg;

    let on_toggle = move |_| {
        let svc = service_toggle.clone();
        let todos_clone = todos_toggle;
        let tid = todo_id_toggle.clone();
        let mut err_msg = error_msg_toggle;
        spawn(async move {
            let current = todos_clone.read().iter().find(|t| t.id == tid).cloned();
            if let Some(t) = current {
                let new_completed = !t.is_completed;
                let new_count = if new_completed {
                    t.tasks_count.max(1)
                } else {
                    0
                };
                let entity = TodoEntity {
                    id: Some(tid.clone()),
                    user_id: "default-user".to_string(),
                    title: t.title,
                    description: t.description,
                    start_date: None,
                    end_date: None,
                    categories: Vec::new(),
                    assignees: Vec::new(),
                    assignee_roles: std::collections::HashMap::new(),
                    visibility: t.visibility,
                    priority: t.priority,
                    order: 0,
                    github_repo_id: None,
                    github_repo_name: None,
                    tasks_count: new_count,
                    completed_tasks_count: if new_completed { new_count } else { 0 },
                    created_at: Some(chrono::Utc::now()),
                    updated_at: Some(chrono::Utc::now()),
                    deleted_at: None,
                };
                let cmd = UpdateTodo { todo: entity };
                match cmd.execute(svc.as_ref()).await {
                    Ok(updated) => {
                        let ui: TodoUiModel = updated.into();
                        let mut todos2 = todos_clone;
                        if let Some(pos) = todos_clone.read().iter().position(|t| t.id == tid) {
                            todos2.write()[pos] = ui;
                        }
                    }
                    Err(e) => {
                        err_msg.set(Some(e.to_string()));
                    }
                }
            }
        });
    };

    let service_delete = props.service.clone();
    let todos_delete = props.todos;
    let error_msg_delete = props.error_msg;

    let on_delete = move |_| {
        let svc = service_delete.clone();
        let mut todos_clone = todos_delete;
        let tid = todo_id_delete.clone();
        let mut err_msg = error_msg_delete;
        spawn(async move {
            match svc.delete(&tid, "default-user").await {
                Ok(()) => {
                    todos_clone.write().retain(|t| t.id != tid);
                    err_msg.set(None);
                }
                Err(e) => {
                    err_msg.set(Some(e.to_string()));
                }
            }
        });
    };

    rsx! {
        TodoCard {
            key: "{props.todo.id}",
            id: props.todo.id.clone(),
            title: props.todo.title.clone(),
            description: props.todo.description.clone(),
            priority: props.todo.priority.clone(),
            is_completed: props.todo.is_completed,
            on_toggle: on_toggle,
            on_delete: on_delete,
        }
    }
}

#[allow(non_snake_case)]
pub fn TodosPage() -> Element {
    let todos = use_signal(Vec::<TodoUiModel>::new);
    let mut new_title = use_signal(String::new);
    let mut new_description = use_signal(String::new);
    let mut new_priority = use_signal(|| "medium".to_string());
    let mut is_adding = use_signal(|| false);
    let mut error_msg = use_signal(|| Option::<String>::None);

    let service = use_hook(|| Arc::new(InMemoryTodoService::new("default-user")));

    let service_for_effect = service.clone();
    let todos_for_effect = todos;
    use_effect(move || {
        let svc = service_for_effect.clone();
        let mut todos_clone = todos_for_effect;
        spawn(async move {
            match svc.get_by_user("default-user").await {
                Ok(items) => {
                    todos_clone.set(items.into_iter().map(TodoUiModel::from).collect());
                }
                Err(e) => {
                    error_msg.set(Some(e.to_string()));
                }
            }
        });
    });

    rsx! {
        div {
            class: "space-y-6",
            div {
                class: "flex items-center justify-between",
                h2 {
                    class: "text-2xl font-bold text-gray-900",
                    "My Todos"
                }
                button {
                    class: "px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2",
                    onclick: move |_| is_adding.set(!is_adding()),
                    if !is_adding() {
                        "+ Add Todo"
                    } else {
                        "Cancel"
                    }
                }
            }

            if let Some(err) = error_msg.read().as_ref() {
                div {
                    class: "bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm",
                    "{err}"
                }
            }

            if is_adding() {
                div {
                    class: "bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4",
                    h3 { class: "text-lg font-semibold text-gray-900", "New Todo" }

                    div {
                        class: "space-y-1",
                        label { class: "block text-sm font-medium text-gray-700", "Title" }
                        input {
                            class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                            r#type: "text",
                            placeholder: "Enter todo title...",
                            value: "{new_title}",
                            oninput: move |e| new_title.set(e.value().to_string()),
                        }
                    }

                    div {
                        class: "space-y-1",
                        label { class: "block text-sm font-medium text-gray-700", "Description" }
                        textarea {
                            class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none",
                            rows: "3",
                            placeholder: "Optional description...",
                            oninput: move |e| new_description.set(e.value().to_string()),
                        }
                    }

                    div {
                        class: "space-y-1",
                        label { class: "block text-sm font-medium text-gray-700", "Priority" }
                        select {
                            class: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500",
                            onchange: move |e| new_priority.set(e.value().to_string()),
                            option { value: "low", "Low" }
                            option { value: "medium", selected: true, "Medium" }
                            option { value: "high", "High" }
                            option { value: "urgent", "Urgent" }
                        }
                    }

                    button {
                        class: "px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors",
                        onclick: {
                            let service = service.clone();
                            let mut new_title = new_title;
                            let mut new_description = new_description;
                            let mut new_priority = new_priority;
                            let mut is_adding = is_adding;
                            let mut error_msg = error_msg;
                            move |_| {
                                let title = new_title().trim().to_string();
                                if title.is_empty() {
                                    error_msg.set(Some("Title cannot be empty".to_string()));
                                    return;
                                }
                                let svc = service.clone();
                                let mut todos_clone = todos;
                                let title_val = title.clone();
                                let desc_val = new_description().trim().to_string();
                                let priority_val = new_priority().to_string();
                                spawn(async move {
                                    let model = TodoCreateModel {
                                        user_id: "default-user".to_string(),
                                        title: title_val,
                                        description: if desc_val.is_empty() { None } else { Some(desc_val) },
                                        start_date: None,
                                        end_date: None,
                                        categories: Vec::new(),
                                        assignees: Vec::new(),
                                        assignee_roles: None,
                                        visibility: "private".to_string(),
                                        priority: priority_val,
                                        order: 0,
                                        github_repo_id: None,
                                        github_repo_name: None,
                                    };
                                    let cmd = CreateTodo { model };
                                    match cmd.execute(svc.as_ref()).await {
                                        Ok(entity) => {
                                            let ui_model: TodoUiModel = entity.into();
                                            todos_clone.write().push(ui_model);
                                            new_title.set(String::new());
                                            new_description.set(String::new());
                                            new_priority.set("medium".to_string());
                                            is_adding.set(false);
                                            error_msg.set(None);
                                        }
                                        Err(e) => {
                                            error_msg.set(Some(e.to_string()));
                                        }
                                    }
                                });
                            }
                        },
                        "Create Todo"
                    }
                }
            }

            div {
                class: "space-y-3",
                if todos.read().is_empty() {
                    div {
                        class: "text-center py-12 text-gray-500",
                        p { "No todos yet" }
                        p { class: "text-sm mt-1", "Click Add Todo to create your first one" }
                    }
                } else {
                    for todo in todos.read().iter() {
                        TodoItem {
                            key: "{todo.id}",
                            todo: todo.clone(),
                            service: service.clone(),
                            todos: todos,
                            error_msg: error_msg,
                        }
                    }
                }
            }
        }
    }
}
