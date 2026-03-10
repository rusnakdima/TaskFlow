use serde_json::Value;

/// Compare updatedAt timestamps - returns true if source is newer than target
pub fn shouldUpdateTarget(source: &Value, target: &Value) -> bool {
  let sourceTs = source.get("updatedAt").and_then(|v| v.as_str());
  let targetTs = target.get("updatedAt").and_then(|v| v.as_str());

  match (sourceTs, targetTs) {
    (Some(s), Some(t)) => s > t,
    (Some(_), None) => true,
    (None, Some(_)) => false,
    (None, None) => true,
  }
}
