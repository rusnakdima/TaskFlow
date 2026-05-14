use crate::crud_route;

crud_route!(get_todo, "todos", "get");
crud_route!(get_todos, "todos", "getAll");
crud_route!(create_todo, "todos", "create");
crud_route!(update_todo, "todos", "update");
crud_route!(delete_todo, "todos", "delete");

crud_route!(get_task, "tasks", "get");
crud_route!(get_tasks, "tasks", "getAll");
crud_route!(create_task, "tasks", "create");
crud_route!(update_task, "tasks", "update");
crud_route!(delete_task, "tasks", "delete");

crud_route!(get_subtask, "subtasks", "get");
crud_route!(get_subtasks, "subtasks", "getAll");
crud_route!(create_subtask, "subtasks", "create");
crud_route!(update_subtask, "subtasks", "update");
crud_route!(delete_subtask, "subtasks", "delete");

crud_route!(get_category, "categories", "get");
crud_route!(get_categories, "categories", "getAll");
crud_route!(create_category, "categories", "create");
crud_route!(update_category, "categories", "update");
crud_route!(delete_category, "categories", "delete");

crud_route!(get_chat, "chats", "get");
crud_route!(get_chats, "chats", "getAll");
crud_route!(create_chat, "chats", "create");
crud_route!(update_chat, "chats", "update");
crud_route!(delete_chat, "chats", "delete");

crud_route!(get_comment, "comments", "get");
crud_route!(get_comments, "comments", "getAll");
crud_route!(create_comment, "comments", "create");
crud_route!(update_comment, "comments", "update");
crud_route!(delete_comment, "comments", "delete");

crud_route!(get_profile, "profiles", "get");
crud_route!(get_profiles, "profiles", "getAll");
crud_route!(create_profile, "profiles", "create");
crud_route!(update_profile, "profiles", "update");
crud_route!(delete_profile, "profiles", "delete");

crud_route!(get_user, "users", "get");
crud_route!(get_users, "users", "getAll");
