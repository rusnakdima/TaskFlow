pub fn parse_load_param(load: Option<String>) -> Vec<String> {
  match load {
    Some(l) => {
      if let Ok(arr) = serde_json::from_str::<Vec<String>>(&l) {
        return arr;
      }
      l.split(',').map(|s| s.trim().to_string()).collect()
    }
    None => vec![],
  }
}
