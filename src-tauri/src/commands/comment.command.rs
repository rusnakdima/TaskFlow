use crate::crud_route;
crud_route!(get_comment, "comments", "get");
crud_route!(get_comments, "comments", "getAll");
crud_route!(create_comment, "comments", "create");
crud_route!(update_comment, "comments", "update");
crud_route!(delete_comment, "comments", "delete");
