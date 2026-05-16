use serde_json::Value;

pub fn get_visibility(doc: &Value) -> &str {
  doc
    .get("visibility")
    .and_then(|v| v.as_str())
    .unwrap_or("private")
}

pub fn is_private_visibility(doc: &Value) -> bool {
  get_visibility(doc) == "private"
}

pub fn is_shared_visibility(visibility: &str) -> bool {
  visibility == "shared" || visibility == "team"
}
