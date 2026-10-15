// forge-thin-shell: Forge app template (≤10 lines)
use forge::prelude::*;

fn main() {
    ForgeApp::run(&TaskFlowApp).expect("forge app failed");
}

struct TaskFlowApp;
impl ForgeApp for TaskFlowApp {
    fn app_id(&self) -> &str { "com.tcs.taskflow" }
    fn app_name(&self) -> &str { "TaskFlow" }
    fn schema_path(&self) -> &std::path::Path { std::path::Path::new("schema.json") }
}
