use serde_json::Value;

pub struct DbSchemaService;

impl DbSchemaService {
  pub fn validate_model(_model: &str, _data: &Value) -> Result<(), String> {
    Ok(())
  }

  pub fn validate_field(_table: &str, _field: &str, _value: &Value) -> Result<(), String> {
    Ok(())
  }
}
