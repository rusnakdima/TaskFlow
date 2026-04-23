/* sys lib */
use std::collections::HashMap;

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
}

impl ConfigHelper {
  pub fn new() -> Self {
    let dotenv_content = include_str!("../../.env");
    let env_vars = Self::parse_dotenv(dotenv_content);

    Self {
      name_app: env_vars
        .get("NAME_APP")
        .expect("NAME_APP not set in .env")
        .clone(),
      app_home_folder: env_vars
        .get("APP_HOME_FOLDER")
        .expect("APP_HOME_FOLDER not set in .env")
        .clone(),
      json_db_name: env_vars
        .get("JSONDB_NAME")
        .expect("JSONDB_NAME not set in .env")
        .clone(),
      mongo_db_uri: env_vars
        .get("MONGODB_URI")
        .expect("MONGODB_URI not set in .env")
        .clone(),
      mongo_db_name: env_vars
        .get("MONGODB_NAME")
        .expect("MONGODB_NAME not set in .env")
        .clone(),
      jwt_secret: env_vars
        .get("JWT_SECRET")
        .expect("JWT_SECRET not set in .env")
        .clone(),
      smtp_username: env_vars
        .get("SMTP_USERNAME")
        .expect("SMTP_USERNAME not set in .env")
        .clone(),
      smtp_password: env_vars
        .get("SMTP_PASSWORD")
        .expect("SMTP_PASSWORD not set in .env")
        .clone(),
      smtp_server: env_vars
        .get("SMTP_SERVER")
        .expect("SMTP_SERVER not set in .env")
        .clone(),
      smtp_port: env_vars
        .get("SMTP_PORT")
        .map(|s| s.parse::<u16>().expect("SMTP_PORT must be a valid number"))
        .unwrap_or(587),
      reset_token_expiry_hours: env_vars
        .get("RESET_TOKEN_EXPIRY_HOURS")
        .map(|s| {
          s.parse::<u64>()
            .expect("RESET_TOKEN_EXPIRY_HOURS must be a valid number")
        })
        .unwrap_or(1),
      rp_domain: env_vars
        .get("RP_DOMAIN")
        .cloned()
        .unwrap_or_else(|| "taskflow.tcs.com".to_string()),
      enable_query_logging: env_vars
        .get("ENABLE_QUERY_LOGGING")
        .map(|s| s.to_lowercase() == "true")
        .unwrap_or(false),
    }
  }

  fn parse_dotenv(dotenv_content: &str) -> HashMap<String, String> {
    dotenv_content
      .lines()
      .filter_map(|line| {
        if line.trim().is_empty() || line.starts_with('#') {
          return None;
        }
        let mut parts = line.splitn(2, '=');
        let key = parts.next()?.trim().to_string();
        let value = parts.next()?.trim().to_string();
        Some((key, value))
      })
      .collect()
  }
}
