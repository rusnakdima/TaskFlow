use crate::crud_route;
crud_route!(get_category, "categories", "get");
crud_route!(get_categories, "categories", "getAll");
crud_route!(create_category, "categories", "create");
crud_route!(update_category, "categories", "update");
crud_route!(delete_category, "categories", "delete");
