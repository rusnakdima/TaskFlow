use crate::crud_route;
crud_route!(get_daily_activity, "daily_activities", "get");
crud_route!(get_daily_activities, "daily_activities", "getAll");
crud_route!(create_daily_activity, "daily_activities", "create");
crud_route!(update_daily_activity, "daily_activities", "update");
crud_route!(delete_daily_activity, "daily_activities", "delete");
