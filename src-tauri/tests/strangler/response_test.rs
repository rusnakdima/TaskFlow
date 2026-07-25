//! Strangler Fig test: Response::success serialization
//!
//! Phase 1 verified that `Response::success("OK", data)` now accepts `impl Into<String>`
//! directly, eliminating the need for `Some("OK")` that was required by the old
//! `tauri_shared::response::Response` type.
//!
//! These tests verify the local `Response<T>` implementation in
//! `src-tauri/src/models/response/model.rs` serializes correctly for the
//! Angular frontend's camelCase expectations.

use taskflow_lib::models::response::{Response, ResponseModel, Status};
use serde_json::Value;

/// Phase 1 fix verification: `Response::success` accepts `&str` message directly.
/// The old `tauri_shared::Response::success` required `Option<String>` (Some("OK")).
/// The new local implementation uses `impl Into<String>`, allowing `"OK"` directly.
#[test]
fn test_response_success_accepts_str_message() {
    let resp = Response::success("OK", serde_json::json!({"id": 1}));
    assert_eq!(resp.message, "OK");
    assert_eq!(resp.status, Status::Success);
}

/// Response::success with String message (not just &str)
#[test]
fn test_response_success_accepts_string_message() {
    let msg = String::from("Created");
    let resp = Response::success(msg, serde_json::json!({"id": 42}));
    assert_eq!(resp.message, "Created");
    assert_eq!(resp.status, Status::Success);
}

/// Response::success serializes to camelCase JSON matching Angular frontend contract
#[test]
fn test_response_success_serialization_camelcase() {
    let resp = Response::success("Found", serde_json::json!({"name": "test"}));
    let json: Value = serde_json::to_value(&resp).unwrap();

    // Top-level fields must be camelCase (as defined by #[serde(rename_all = "camelCase")])
    assert!(json.get("status").is_some(), "status field must be present");
    assert!(json.get("message").is_some(), "message field must be present");
    assert!(json.get("data").is_some(), "data field must be present");

    // status serializes as lowercase enum variant
    assert_eq!(json["status"], "success");
    assert_eq!(json["message"], "Found");
    assert_eq!(json["data"]["name"], "test");
}

/// ResponseModel (type alias for Response<Value>) serializes correctly
#[test]
fn test_response_model_serialization() {
    let resp: ResponseModel = ResponseModel {
        status: Status::Success,
        message: "Operation successful".into(),
        data: serde_json::json!({"count": 5}),
    };
    let json: Value = serde_json::to_value(&resp).unwrap();

    assert_eq!(json["status"], "success");
    assert_eq!(json["message"], "Operation successful");
    assert_eq!(json["data"]["count"], 5);
}

/// Roundtrip: serialize then deserialize preserves data
#[test]
fn test_response_success_roundtrip() {
    let original = Response::success("Count", serde_json::json!({"total": 10}));
    let json = serde_json::to_string(&original).unwrap();
    let parsed: Response<serde_json::Value> = serde_json::from_str(&json).unwrap();

    assert_eq!(parsed.status, original.status);
    assert_eq!(parsed.message, original.message);
    assert_eq!(parsed.data, original.data);
}

/// Status enum serializes as lowercase (#[serde(rename_all = "lowercase")])
#[test]
fn test_status_enum_lowercase_serialization() {
    let cases = vec![
        (Status::Success, "success"),
        (Status::Info, "info"),
        (Status::Warning, "warning"),
        (Status::Error, "error"),
        (Status::Created, "created"),
        (Status::Updated, "updated"),
        (Status::Deleted, "deleted"),
        (Status::ValidationError, "validationerror"),
        (Status::NotFound, "notfound"),
        (Status::Unauthorized, "unauthorized"),
        (Status::Forbidden, "forbidden"),
    ];
    for (status, expected) in cases {
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, format!("\"{}\"", expected), "Status::{:?}", status);
    }
}

/// Response::error also serializes correctly
#[test]
fn test_response_error_serialization() {
    let resp: Response<()> = Response::error(Status::NotFound, "Not found");
    let json: Value = serde_json::to_value(&resp).unwrap();

    assert_eq!(json["status"], "notfound");
    assert_eq!(json["message"], "Not found");
    assert!(json["data"].is_null());
}
