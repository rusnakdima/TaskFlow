/* sys lib */
use std::env;
use std::path::Path;
const ENV_CONTENT: &str = include_str!("../../.env");
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
  pub client_id_github: String,
  pub client_secret_github: String,
  pub callback_url_github: String,
}
fn parse_env_content(content: &str) -> Vec<(String, String)> {
  let mut vars = Vec::new();
  for line in content.lines() {
    let line = line.trim();
    if line.is_empty() || line.starts_with('#') {
      continue;
    }
    if let Some((key, value)) = line.split_once('=') {
      let key = key.trim();
      let mut value = value.trim().to_string();
      if (value.starts_with('"') && value.ends_with('"'))
        || (value.starts_with('\'') && value.ends_with('\''))
      {
        value = value[1..value.len() - 1].to_string();
      }
      if !key.is_empty() {
        vars.push((key.to_string(), value));
      }
    }
  }
  vars
}
fn load_env_from_file(path: &Path) -> bool {
  if let Ok(content) = std::fs::read_to_string(path) {
    let vars = parse_env_content(&content);
    for (key, value) in &vars {
      env::set_var(key, value);
    }
    return true;
  }
  false
}
#[cfg(feature = "embedded_env")]
fn load_embedded_env() {
  let vars = parse_env_content(ENV_CONTENT);
  for (key, value) in &vars {
    env::set_var(key, value);
  }
}
impl ConfigHelper {
  pub fn new() -> Self {
    dotenvy::dotenv().ok();
    let fallback_env_paths = [
      Path::new("/data/data/com.tcs.taskflow/files/.env"),
      Path::new("resource/.env"),
      Path::new("./resource/.env"),
    ];
    load_embedded_env();
    for path in &fallback_env_paths {
      if load_env_from_file(path) {
        break;
      }
    }
    Self {
      name_app: env::var("NAME_APP").unwrap_or_else(|_| "TaskFlow".to_string()),
      app_home_folder: env::var("APP_HOME_FOLDER").unwrap_or_else(|_| ".taskflow".to_string()),
      json_db_name: env::var("JSONDB_NAME").unwrap_or_else(|_| "task_flow_db".to_string()),
      mongo_db_uri: env::var("MONGODB_URI")
        .unwrap_or_else(|_| "mongodb://localhost:27017".to_string()),
      mongo_db_name: env::var("MONGODB_NAME").unwrap_or_else(|_| "taskflow".to_string()),
      jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET environment variable must be set"),
      smtp_username: env::var("SMTP_USERNAME").unwrap_or_else(|_| "".to_string()),
      smtp_password: env::var("SMTP_PASSWORD").unwrap_or_else(|_| "".to_string()),
      smtp_server: env::var("SMTP_SERVER").unwrap_or_else(|_| "smtp.example.com".to_string()),
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
      client_id_github: env::var("CLIENT_ID_GITHUB").unwrap_or_else(|_| "".to_string()),
      client_secret_github: env::var("CLIENT_SECRET_GITHUB").unwrap_or_else(|_| "".to_string()),
      callback_url_github: env::var("CALLBACK_URL_GITHUB").unwrap_or_else(|_| "".to_string()),
    }
  }
}
