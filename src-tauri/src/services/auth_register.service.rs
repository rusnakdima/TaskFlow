/* sys lib */
use bcrypt::hash;
use mongodb::bson::{doc, oid::ObjectId, to_bson, Bson, Uuid};
use std::sync::Arc;

/* providers */
use crate::providers::mongodb_provider::MongodbProvider;

/* models */
use crate::models::{
  response_model::{DataValue, ResponseModel, ResponseStatus},
  signup_form_model::SignupForm,
  user_model::UserModel,
};

pub struct AuthRegisterService {
  pub mongodbProvider: Arc<MongodbProvider>,
}

impl AuthRegisterService {
  pub fn new(mongodbProvider: Arc<MongodbProvider>) -> Self {
    Self { mongodbProvider }
  }

  pub async fn register(&self, signupForm: SignupForm) -> Result<ResponseModel, ResponseModel> {
    let nameTable = "users".to_string();

    let filter = doc! { "email": signupForm.email.clone() };
    match self
      .mongodbProvider
      .get(&nameTable, Some(filter), None, "")
      .await
    {
      Ok(_) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: "User with this email already exists".to_string(),
        data: DataValue::String("".to_string()),
      }),
      Err(e) if e.to_string().contains("Document not found") => {
        let user: UserModel = UserModel {
          _id: ObjectId::new(),
          id: Uuid::new().to_string(),
          email: signupForm.email.clone(),
          username: signupForm.username.clone(),
          password: match hash(&signupForm.password, 10) {
            Ok(hashed) => hashed,
            Err(_) => {
              return Err(ResponseModel {
                status: ResponseStatus::Error,
                message: "Error hashing password".to_string(),
                data: DataValue::String("".to_string()),
              });
            }
          },
          role: "user".to_string(),
          temporaryCode: "".to_string(),
          codeExpiresAt: "".to_string(),
          profileId: "".to_string(),
          createdAt: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
          updatedAt: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true),
        };

        let recordUser = match to_bson(&user) {
          Ok(Bson::Document(doc)) => doc,
          Ok(_) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: "Error serializing user: not a document".to_string(),
              data: DataValue::String("".to_string()),
            });
          }
          Err(e) => {
            return Err(ResponseModel {
              status: ResponseStatus::Error,
              message: format!("Error serializing user: {}", e),
              data: DataValue::String("".to_string()),
            });
          }
        };

        match self.mongodbProvider.create(&nameTable, recordUser).await {
          Ok(_) => Ok(ResponseModel {
            status: ResponseStatus::Success,
            message: "User created successfully".to_string(),
            data: DataValue::String("".to_string()),
          }),
          Err(e) => Err(ResponseModel {
            status: ResponseStatus::Error,
            message: format!("Error creating user: {}", e),
            data: DataValue::String("".to_string()),
          }),
        }
      }
      Err(e) => Err(ResponseModel {
        status: ResponseStatus::Error,
        message: format!("Error checking existing user: {}", e),
        data: DataValue::String("".to_string()),
      }),
    }
  }
}
