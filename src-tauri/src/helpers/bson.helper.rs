use mongodb::bson::{doc, to_bson, Bson, Document};
use serde_json::Value;

/// Converts a JSON Value to BSON Document
pub fn valueToDocument(value: &Value) -> Document {
  if let Some(obj) = value.as_object() {
    let mut doc = Document::new();
    for (k, v) in obj {
      doc.insert(k, to_bson(v).unwrap_or(Bson::Null));
    }
    doc
  } else {
    doc! {}
  }
}
