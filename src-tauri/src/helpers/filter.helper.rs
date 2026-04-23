use nosql_orm::query::Filter;
use serde_json::Value;

pub struct FilterBuilder;

fn to_snake_case(s: &str) -> String {
  let mut result = String::with_capacity(s.len());
  for (i, c) in s.chars().enumerate() {
    if c.is_uppercase() && i > 0 {
      result.push('_');
    }
    result.extend(c.to_lowercase());
  }
  result
}

impl FilterBuilder {
  pub fn from_json(filter_value: &Value) -> Option<Filter> {
    tracing::debug!("[FilterBuilder] from_json input: {:?}", filter_value);

    if let Some(obj) = filter_value.as_object() {
      let mut filters = Vec::new();

      for (key, value) in obj {
        if key.starts_with('$') {
          continue;
        }

        let snake_key = to_snake_case(key);

        tracing::debug!(
          "[FilterBuilder] building filter for key '{}' -> '{}', value: {:?}",
          key,
          snake_key,
          value
        );

        if let Some(filter) = Self::build_single_filter(&snake_key, value) {
          tracing::debug!("[FilterBuilder] built filter: {:?}", filter);
          filters.push(filter);
        } else {
          tracing::warn!(
            "[FilterBuilder] could not build filter for key '{}', value: {:?}",
            key,
            value
          );
        }
      }

      tracing::debug!(
        "[FilterBuilder] total filters built: {}, filters: {:?}",
        filters.len(),
        filters
      );

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
      let values: Vec<serde_json::Value> = arr.to_vec();
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
        "$in" => op_value
          .as_array()
          .map(|arr| Filter::In(key.to_string(), arr.clone())),
        "$notIn" => op_value
          .as_array()
          .map(|arr| Filter::NotIn(key.to_string(), arr.clone())),
        "$contains" => op_value
          .as_str()
          .map(|s| Filter::Contains(key.to_string(), s.to_string())),
        "$startsWith" => op_value
          .as_str()
          .map(|s| Filter::StartsWith(key.to_string(), s.to_string())),
        "$endsWith" => op_value
          .as_str()
          .map(|s| Filter::EndsWith(key.to_string(), s.to_string())),
        "$like" => op_value
          .as_str()
          .map(|s| Filter::Like(key.to_string(), s.to_string())),
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
}
