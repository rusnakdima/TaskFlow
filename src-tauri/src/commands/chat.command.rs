use crate::crud_route;
crud_route!(get_chat, "chats", "get");
crud_route!(get_chats, "chats", "getAll");
crud_route!(create_chat, "chats", "create");
crud_route!(update_chat, "chats", "update");
crud_route!(delete_chat, "chats", "delete");
