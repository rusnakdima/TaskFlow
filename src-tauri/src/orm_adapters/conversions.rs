use nosql_orm::entity::Entity;
use nosql_orm::prelude::OrmResult;
use serde_json::Value;

pub trait EntityExt: Entity + Sized {
  fn to_entity(value: Value) -> OrmResult<Self>;
  fn from_entity(&self) -> OrmResult<Value>;
}

pub fn entity_to_value<E: Entity>(entity: &E) -> OrmResult<Value> {
  entity.to_value()
}

pub fn value_to_entity<E: Entity>(value: Value) -> OrmResult<E> {
  E::from_value(value)
}

pub fn extract_id_from_value(value: &Value, id_field: &str) -> Option<String> {
  value
    .get(id_field)
    .and_then(|v| v.as_str().map(|s| s.to_string()))
}
