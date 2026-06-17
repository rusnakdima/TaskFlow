use crate::crud_route;

crud_route!(get_task, "tasks", "get");
crud_route!(get_tasks, "tasks", "getAll");
crud_route!(create_task, "tasks", "create");
crud_route!(update_task, "tasks", "update");
crud_route!(delete_task, "tasks", "delete");
