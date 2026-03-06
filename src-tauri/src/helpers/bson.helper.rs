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

/// Converts a JSON Value to BSON (for filter operations)
pub fn valueToBson(value: &Value) -> Bson {
    to_bson(value).unwrap_or(Bson::Null)
}

/// Extracts a string field from a Document
pub fn getStringField(doc: &Document, field: &str) -> Option<String> {
    doc.get_str(field).map(|s| s.to_string()).ok()
}

/// Extracts ID and title from a document for logging
pub fn extractRecordInfo(doc: &Document) -> (String, String) {
    let id = getStringField(doc, "id").unwrap_or_else(|| "unknown".to_string());
    let title = getStringField(doc, "title").unwrap_or_else(|| "unknown".to_string());
    (id, title)
}

/// Extracts ID and title from a JSON Value for logging
pub fn extractValueInfo(value: &Value) -> (String, String) {
    let id = value
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let title = value
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    (id, title)
}

/// Safely converts a Value to Document with error handling
pub fn safeValueToDocument(value: &Value) -> Result<Document, String> {
    mongodb::bson::to_document(value).map_err(|e| format!("Failed to convert to document: {}", e))
}
