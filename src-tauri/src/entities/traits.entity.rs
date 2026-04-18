pub trait Validatable {
  fn validate(&self) -> Result<(), String>;
}

#[allow(dead_code)]
pub trait FrontendProjection {
  fn excluded_fields() -> Vec<&'static str>;
}

#[allow(dead_code)]
pub trait EntityRelations {
  fn relation_paths() -> Vec<&'static str>;
  fn nested_relation_map() -> Vec<(&'static str, Vec<&'static str>)>;
}
