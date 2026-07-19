pub use tauri_shared::response::Response;
pub use tauri_shared::response::Status;

use serde_json::Value;

pub type ResponseModel = Response<Value>;
pub type ResponseStatus = Status;
