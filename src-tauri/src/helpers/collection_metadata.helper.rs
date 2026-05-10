use serde_json::Value;

pub fn add_collection_metadata(mut docs: Vec<Value>, collection: &str) -> Vec<Value> {
  for doc in &mut docs {
    if let Some(obj) = doc.as_object_mut() {
      if !obj.contains_key("_collection") {
        obj.insert(
          "_collection".to_string(),
          Value::String(collection.to_string()),
        );
      }
    }
  }
  docs
}
