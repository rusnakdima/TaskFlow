mod model;

pub use model::{err_response, err_response_formatted, success_response};
pub use model::{Response, ResponseModel, ResponseStatus, Status};

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_response_success() {
    let resp = Response::success("OK", serde_json::json!({"id": 1}));
    assert_eq!(resp.status, Status::Success);
    assert_eq!(resp.message, "OK");
  }

  #[test]
  fn test_response_error() {
    let resp: Response<()> = Response::error(Status::NotFound, "Not found");
    assert_eq!(resp.status, Status::NotFound);
  }

  #[test]
  fn test_response_model_backward_compat() {
    let rm = ResponseModel::new_false("error");
    assert_eq!(rm.status, ResponseStatus::Error);
  }
}
