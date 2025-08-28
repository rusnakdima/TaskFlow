/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub enum TypesField {
  OneToOne,
  OneToMany,
  ManyToOne,
  ManyToMany,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct RelationObj {
  pub nameTable: String,
  pub typeField: TypesField,
  pub nameField: String,
  pub newNameField: String,
  pub relations: Option<Vec<RelationObj>>,
}
