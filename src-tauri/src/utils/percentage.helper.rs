pub fn calculate_percentage(completed: i32, total: i32) -> i32 {
  if total > 0 {
    ((completed as f32 / total as f32) * 100.0) as i32
  } else {
    0
  }
}
