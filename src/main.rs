// forge-thin-shell: the app is JSON; the library boots it.
fn main() {
  forge::start("com.tcs.taskflow").expect("forge app failed");
}
