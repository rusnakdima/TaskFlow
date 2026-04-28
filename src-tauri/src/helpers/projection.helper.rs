use nosql_orm::query::Projection;
use serde_json::Value;

pub fn _create_projection_exclude(fields: &[&str]) -> Projection {
  Projection::exclude(fields)
}

pub fn _create_projection_include(fields: &[&str]) -> Projection {
  Projection::select(fields)
}

pub fn _apply_projection_recursive(docs: Vec<Value>, projection: &Projection) -> Vec<Value> {
  docs
    .into_iter()
    .map(|doc| projection.apply_recursive(&doc))
    .collect()
}
