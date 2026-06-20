use crate::crud_route;
crud_route!(get_subtask, "subtasks", "get");
crud_route!(get_subtasks, "subtasks", "getAll");
crud_route!(create_subtask, "subtasks", "create");
crud_route!(update_subtask, "subtasks", "update");
crud_route!(delete_subtask, "subtasks", "delete");
