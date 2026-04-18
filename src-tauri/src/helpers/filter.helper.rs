use nosql_orm::query::Filter;
use serde_json::Value;

pub struct FilterBuilder;

impl FilterBuilder {
  pub fn from_json(filter_value: &Value) -> Option<Filter> {
    if let Some(obj) = filter_value.as_object() {
      let mut filters = Vec::new();

      for (key, value) in obj {
        if key.starts_with('$') {
          continue;
        }

        if let Some(filter) = Self::build_single_filter(key, value) {
          filters.push(filter);
        }
      }

      if filters.is_empty() {
        None
      } else if filters.len() == 1 {
        Some(filters.remove(0))
      } else {
        Some(Filter::And(filters))
      }
    } else {
      None
    }
  }

  pub(crate) fn build_single_filter(key: &str, value: &Value) -> Option<Filter> {
    if value.is_null() {
      Some(Filter::Eq(key.to_string(), Value::Null))
    } else if let Some(arr) = value.as_array() {
      if arr
        .iter()
        .any(|v| v.is_string() && v.as_str().unwrap().starts_with('$'))
      {
        return None;
      }
      let values: Vec<serde_json::Value> = arr.iter().cloned().collect();
      Some(Filter::In(key.to_string(), values))
    } else {
      Some(Filter::Eq(key.to_string(), value.clone()))
    }
  }
}
