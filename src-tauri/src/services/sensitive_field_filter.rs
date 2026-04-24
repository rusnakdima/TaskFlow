use serde_json::Value;

pub struct SensitiveFieldFilter;

impl SensitiveFieldFilter {
  pub fn new() -> Self {
    Self
  }

  pub fn filter_sensitive_fields_recursive(&self, value: &mut Value) {
    use crate::entities::relation_config::FRONTEND_EXCLUDED_FIELDS;

    if let Some(obj) = value.as_object_mut() {
      if let Some(user_val) = obj.get("user") {
        if let Some(user) = user_val.as_object() {
          let mut filtered = user.clone();
          for field in FRONTEND_EXCLUDED_FIELDS {
            filtered.remove(*field);
          }
          obj.insert("user".to_string(), Value::Object(filtered));
        }
      }

      for (_key, val) in obj.iter_mut() {
        self.filter_sensitive_fields_recursive(val);
      }
    } else if let Some(arr) = value.as_array_mut() {
      for item in arr.iter_mut() {
        self.filter_sensitive_fields_recursive(item);
      }
    }
  }

  pub fn ensure_user_projection(&self, docs: &mut Vec<Value>) {
    for doc in docs.iter_mut() {
      self.filter_sensitive_fields_recursive(doc);
    }
  }
}

impl Default for SensitiveFieldFilter {
  fn default() -> Self {
    Self::new()
  }
}
