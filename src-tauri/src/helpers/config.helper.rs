/* sys lib */
use std::env;

#[derive(Debug, Clone)]

pub struct ConfigHelper {
  pub name_app: String,
  pub app_home_folder: String,
  pub json_db_name: String,
  pub mongo_db_uri: String,
  pub mongo_db_name: String,
  pub jwt_secret: String,
  pub smtp_username: String,
  pub smtp_password: String,
  pub smtp_server: String,
  pub smtp_port: u16,
  pub reset_token_expiry_hours: u64,
  pub rp_domain: String,
  pub enable_query_logging: bool,
  pub github_client_id: String,
  pub github_client_secret: String,
  pub github_callback_url: String,
}

impl ConfigHelper {
  pub fn new() -> Self {
    dotenvy::dotenv().ok();

    Self {
      name_app: env::var("NAME_APP").unwrap_or_else(|_| {
        eprintln!("WARNING: NAME_APP not set in .env, using default");
        "TaskFlow".to_string()
      }),
      app_home_folder: env::var("APP_HOME_FOLDER").unwrap_or_else(|_| {
        eprintln!("WARNING: APP_HOME_FOLDER not set in .env, using default");
        ".taskflow".to_string()
      }),
      json_db_name: env::var("JSONDB_NAME").unwrap_or_else(|_| {
        eprintln!("WARNING: JSONDB_NAME not set in .env, using default");
        "task_flow_db.json".to_string()
      }),
      mongo_db_uri: env::var("MONGODB_URI").unwrap_or_else(|_| {
        eprintln!("WARNING: MONGODB_URI not set in .env, using default");
        "mongodb://localhost:27017".to_string()
      }),
      mongo_db_name: env::var("MONGODB_NAME").unwrap_or_else(|_| {
        eprintln!("WARNING: MONGODB_NAME not set in .env, using default");
        "taskflow".to_string()
      }),
      jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| {
        eprintln!("WARNING: JWT_SECRET not set in .env, using default");
        "default_secret_change_in_production".to_string()
      }),
      smtp_username: env::var("SMTP_USERNAME").unwrap_or_else(|_| {
        eprintln!("WARNING: SMTP_USERNAME not set in .env, using default");
        "".to_string()
      }),
      smtp_password: env::var("SMTP_PASSWORD").unwrap_or_else(|_| {
        eprintln!("WARNING: SMTP_PASSWORD not set in .env, using default");
        "".to_string()
      }),
      smtp_server: env::var("SMTP_SERVER").unwrap_or_else(|_| {
        eprintln!("WARNING: SMTP_SERVER not set in .env, using default");
        "smtp.example.com".to_string()
      }),
      smtp_port: env::var("SMTP_PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(587),
      reset_token_expiry_hours: env::var("RESET_TOKEN_EXPIRY_HOURS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(1),
      rp_domain: env::var("RP_DOMAIN").unwrap_or_else(|_| "taskflow.tcs.com".to_string()),
      enable_query_logging: env::var("ENABLE_QUERY_LOGGING")
        .map(|s| s.to_lowercase() == "true")
        .unwrap_or(false),
      github_client_id: env::var("GITHUB_CLIENT_ID").unwrap_or_else(|_| "".to_string()),
      github_client_secret: env::var("GITHUB_CLIENT_SECRET").unwrap_or_else(|_| "".to_string()),
      github_callback_url: env::var("GITHUB_CALLBACK_URL").unwrap_or_else(|_| "".to_string()),
    }
  }
}
