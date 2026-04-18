use serde_json::Value;

use crate::entities::relation_config::user_projection;

#[allow(dead_code)]
pub struct ProjectionHelper;

impl ProjectionHelper {
  pub fn apply_frontend_projection(doc: &Value) -> Value {
    let projection = user_projection();
    projection.apply(doc)
  }

  pub fn apply_to_docs(docs: &[Value]) -> Vec<Value> {
    let projection = user_projection();
    docs.iter().map(|doc| projection.apply(doc)).collect()
  }
}
