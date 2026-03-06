use crate::models::response_model::{DataValue, ResponseModel, ResponseStatus};

/// Creates an error response with the given message
pub fn errResponse(message: &str) -> ResponseModel {
    ResponseModel {
        status: ResponseStatus::Error,
        message: message.to_string(),
        data: DataValue::String("".to_string()),
    }
}

/// Creates an error response with a formatted message
pub fn errResponseFormatted(prefix: &str, error: &str) -> ResponseModel {
    ResponseModel {
        status: ResponseStatus::Error,
        message: format!("{}: {}", prefix, error),
        data: DataValue::String("".to_string()),
    }
}

/// Creates a success response with data
pub fn successResponse<T: Into<DataValue>>(data: T) -> ResponseModel {
    ResponseModel {
        status: ResponseStatus::Success,
        message: "Operation successful".to_string(),
        data: data.into(),
    }
}

/// Creates a MongoDB unavailable error response
pub fn mongodbUnavailableError() -> ResponseModel {
    errResponse("MongoDB not available")
}

/// Creates a validation error response
pub fn validationError(message: &str) -> ResponseModel {
    errResponseFormatted("Validation error", message)
}

/// Creates a not found error response
pub fn notFoundError(resource: &str) -> ResponseModel {
    errResponse(&format!("{} not found", resource))
}
