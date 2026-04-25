#[allow(dead_code)]
pub trait EntityRelations {
  fn relation_paths() -> Vec<&'static str>;
  fn nested_relation_map() -> Vec<(&'static str, Vec<&'static str>)>;
}
