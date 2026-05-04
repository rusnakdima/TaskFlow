/* sys lib */
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub enum TypesField {
  OneToOne,
  OneToMany,
  ManyToOne,
  ManyToMany,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub struct RelationObj {
  pub name_table: String,
  pub type_field: TypesField,
  pub name_field: String,
  pub new_name_field: String,
  pub target_field: Option<String>,
  pub relations: Option<Vec<RelationObj>>,
}
