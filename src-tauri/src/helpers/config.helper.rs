/* sys lib */
use std::collections::HashMap;

#[derive(Debug, Clone)]
#[allow(non_snake_case)]
pub struct ConfigHelper {
  pub nameApp: String,
  pub appHomeFolder: String,
  pub jsonDbName: String,
  pub mongoDbUri: String,
  pub mongoDbName: String,
  pub jwtSecret: String,
  pub smtpUsername: String,
  pub smtpPassword: String,
  pub smtpServer: String,
  pub smtpPort: u16,
  pub resetTokenExpiryHours: u64,
}

impl ConfigHelper {
  #[allow(non_snake_case)]
  pub fn new() -> Self {
    let dotenvContent = include_str!("../../.env");
    let envVars = Self::parse_dotenv(dotenvContent);

    Self {
      nameApp: envVars
        .get("NAME_APP")
        .expect("NAME_APP not set in .env")
        .clone(),
      appHomeFolder: envVars
        .get("APP_HOME_FOLDER")
        .expect("APP_HOME_FOLDER not set in .env")
        .clone(),
      jsonDbName: envVars
        .get("JSONDB_NAME")
        .expect("JSONDB_NAME not set in .env")
        .clone(),
      mongoDbUri: envVars
        .get("MONGODB_URI")
        .expect("MONGODB_URI not set in .env")
        .clone(),
      mongoDbName: envVars
        .get("MONGODB_NAME")
        .expect("MONGODB_NAME not set in .env")
        .clone(),
      jwtSecret: envVars
        .get("JWT_SECRET")
        .expect("JWT_SECRET not set in .env")
        .clone(),
      smtpUsername: envVars
        .get("SMTP_USERNAME")
        .expect("SMTP_USERNAME not set in .env")
        .clone(),
      smtpPassword: envVars
        .get("SMTP_PASSWORD")
        .expect("SMTP_PASSWORD not set in .env")
        .clone(),
      smtpServer: envVars
        .get("SMTP_SERVER")
        .expect("SMTP_SERVER not set in .env")
        .clone(),
      smtpPort: envVars
        .get("SMTP_PORT")
        .map(|s| s.parse::<u16>().expect("SMTP_PORT must be a valid number"))
        .unwrap_or(587),
      resetTokenExpiryHours: envVars
        .get("RESET_TOKEN_EXPIRY_HOURS")
        .map(|s| {
          s.parse::<u64>()
            .expect("RESET_TOKEN_EXPIRY_HOURS must be a valid number")
        })
        .unwrap_or(1),
    }
  }

  #[allow(non_snake_case)]
  fn parse_dotenv(dotenvContent: &str) -> HashMap<String, String> {
    dotenvContent
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
