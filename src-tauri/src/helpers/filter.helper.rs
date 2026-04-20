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
      Some(Filter::IsNull(key.to_string()))
    } else if let Some(arr) = value.as_array() {
      if arr
        .iter()
        .any(|v| v.is_string() && v.as_str().unwrap().starts_with('$'))
      {
        return None;
      }
      let values: Vec<serde_json::Value> = arr.iter().cloned().collect();
      Some(Filter::In(key.to_string(), values))
    } else if let Some(obj) = value.as_object() {
      Self::build_operators_filter(key, obj)
    } else {
      Some(Filter::Eq(key.to_string(), value.clone()))
    }
  }

  fn build_operators_filter(
    key: &str,
    operators: &serde_json::Map<String, Value>,
  ) -> Option<Filter> {
    let mut filters = Vec::new();

    for (op, op_value) in operators {
      let filter = match op.as_str() {
        "$eq" => Some(Filter::Eq(key.to_string(), op_value.clone())),
        "$ne" => Some(Filter::Ne(key.to_string(), op_value.clone())),
        "$gt" => Some(Filter::Gt(key.to_string(), op_value.clone())),
        "$gte" => Some(Filter::Gte(key.to_string(), op_value.clone())),
        "$lt" => Some(Filter::Lt(key.to_string(), op_value.clone())),
        "$lte" => Some(Filter::Lte(key.to_string(), op_value.clone())),
        "$in" => {
          if let Some(arr) = op_value.as_array() {
            Some(Filter::In(key.to_string(), arr.clone()))
          } else {
            None
          }
        }
        "$notIn" => {
          if let Some(arr) = op_value.as_array() {
            Some(Filter::NotIn(key.to_string(), arr.clone()))
          } else {
            None
          }
        }
        "$contains" => {
          if let Some(s) = op_value.as_str() {
            Some(Filter::Contains(key.to_string(), s.to_string()))
          } else {
            None
          }
        }
        "$startsWith" => {
          if let Some(s) = op_value.as_str() {
            Some(Filter::StartsWith(key.to_string(), s.to_string()))
          } else {
            None
          }
        }
        "$endsWith" => {
          if let Some(s) = op_value.as_str() {
            Some(Filter::EndsWith(key.to_string(), s.to_string()))
          } else {
            None
          }
        }
        "$like" => {
          if let Some(s) = op_value.as_str() {
            Some(Filter::Like(key.to_string(), s.to_string()))
          } else {
            None
          }
        }
        "$exists" => {
          if let Some(b) = op_value.as_bool() {
            if b {
              Some(Filter::IsNotNull(key.to_string()))
            } else {
              Some(Filter::IsNull(key.to_string()))
            }
          } else {
            None
          }
        }
        _ => None,
      };
      if let Some(f) = filter {
        filters.push(f);
      }
    }

    if filters.is_empty() {
      None
    } else if filters.len() == 1 {
      Some(filters.remove(0))
    } else {
      Some(Filter::And(filters))
    }
  }

  #[allow(dead_code)]
  pub fn from_filter_group(filter_value: &Value) -> Option<Filter> {
    if let Some(obj) = filter_value.as_object() {
      if let Some(or_arr) = obj.get("$or").and_then(|v| v.as_array()) {
        let or_filters: Vec<Filter> = or_arr.iter().filter_map(|v| Self::from_json(v)).collect();
        if !or_filters.is_empty() {
          return Some(Filter::Or(or_filters));
        }
      }
      if let Some(and_arr) = obj.get("$and").and_then(|v| v.as_array()) {
        let and_filters: Vec<Filter> = and_arr.iter().filter_map(|v| Self::from_json(v)).collect();
        if !and_filters.is_empty() {
          return Some(Filter::And(and_filters));
        }
      }
      if let Some(not_obj) = obj.get("$not").and_then(|v| v.as_object()) {
        let inner = Self::from_json(&Value::Object(not_obj.clone()));
        if let Some(f) = inner {
          return Some(Filter::Not(Box::new(f)));
        }
      }
      Self::from_json(filter_value)
    } else {
      None
    }
  }
}
