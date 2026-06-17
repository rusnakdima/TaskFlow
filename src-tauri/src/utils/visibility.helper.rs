use serde_json::Value;

pub fn get_visibility(doc: &Value) -> &str {
  doc
    .get("visibility")
    .and_then(|v| v.as_str())
    .unwrap_or("private")
}
