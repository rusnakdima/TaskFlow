use serde_json::Value;
use tauri_shared::response::Response as R;

pub type ResponseModel = R<Value>;
pub type ResponseStatus = tauri_shared::response::Status;

pub use tauri_shared::response::Response;
pub use tauri_shared::response::Status;
