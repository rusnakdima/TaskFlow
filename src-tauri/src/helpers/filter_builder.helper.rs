use nosql_orm::query::Filter;
use serde_json::json;

pub fn eq_filter(field: &str, value: impl Into<serde_json::Value>) -> Filter {
  Filter::Eq(field.to_string(), value.into())
}

pub fn gte_filter(field: &str, value: impl Into<serde_json::Value>) -> Filter {
  Filter::Gte(field.to_string(), value.into())
}

pub fn gt_filter(field: &str, value: impl Into<serde_json::Value>) -> Filter {
  Filter::Gt(field.to_string(), value.into())
}

pub fn lte_filter(field: &str, value: impl Into<serde_json::Value>) -> Filter {
  Filter::Lte(field.to_string(), value.into())
}

pub fn lt_filter(field: &str, value: impl Into<serde_json::Value>) -> Filter {
  Filter::Lt(field.to_string(), value.into())
}

pub fn and_filters(filters: Vec<Filter>) -> Filter {
  Filter::And(filters)
}

pub fn or_filters(filters: Vec<Filter>) -> Filter {
  Filter::Or(filters)
}
