use crate::crud_route;
crud_route!(get_room, "rooms", "get");
crud_route!(get_rooms, "rooms", "getAll");
crud_route!(create_room, "rooms", "create");
crud_route!(update_room, "rooms", "update");
crud_route!(delete_room, "rooms", "delete");
