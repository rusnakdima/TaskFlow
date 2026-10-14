// forge-thin-shell: Forge app template (≤10 lines)
use forge::prelude::*;
fn main() -> Result<(), String> {
  ForgeApp::new()
    .schema(include_str!("../schema.json"))
    .run()
}