use crate::crud_route;

crud_route!(get_profile, "profiles", "get");
crud_route!(get_profiles, "profiles", "getAll");
crud_route!(create_profile, "profiles", "create");
crud_route!(update_profile, "profiles", "update");
crud_route!(delete_profile, "profiles", "delete");
