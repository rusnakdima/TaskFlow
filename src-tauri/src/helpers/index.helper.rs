use serde_json::Value;
use std::collections::HashMap;

/// Indexes a vector of JSON Values by their ID field
pub fn indexById(items: &[Value]) -> HashMap<String, Value> {
    let mut map: HashMap<String, Value> = HashMap::new();
    for item in items {
        if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
            map.insert(id.to_string(), item.clone());
        }
    }
    map
}

/// Indexes a vector of JSON Values by a custom field
pub fn indexByField(items: &[Value], fieldName: &str) -> HashMap<String, Value> {
    let mut map: HashMap<String, Value> = HashMap::new();
    for item in items {
        if let Some(key) = item.get(fieldName).and_then(|v| v.as_str()) {
            map.insert(key.to_string(), item.clone());
        }
    }
    map
}

/// Groups items by a string field value
pub fn groupByField(items: &[Value], fieldName: &str) -> HashMap<String, Vec<Value>> {
    let mut map: HashMap<String, Vec<Value>> = HashMap::new();
    for item in items {
        if let Some(key) = item.get(fieldName).and_then(|v| v.as_str()) {
            map.entry(key.to_string()).or_insert_with(Vec::new).push(item.clone());
        }
    }
    map
}

/// Finds an item by ID
pub fn findById(items: &[Value], id: &str) -> Option<Value> {
    items.iter().find(|item| item.get("id").and_then(|v| v.as_str()) == Some(id)).cloned()
}

/// Finds an item by a custom field
pub fn findByField(items: &[Value], fieldName: &str, value: &str) -> Option<Value> {
    items
        .iter()
        .find(|item| item.get(fieldName).and_then(|v| v.as_str()) == Some(value))
        .cloned()
}
