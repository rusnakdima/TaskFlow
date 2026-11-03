// forge-thin-shell: the app is JSON; the library boots it.
fn main() {
  // The app runs the native GPUI shell by default; `--no-default-features`
  // keeps the WebView path as the parity reference until Q7 deletes it.
  #[cfg(feature = "native-shell")]
  forge::shell::install(std::sync::Arc::new(forge::shell_gpui::GpuShell::new()));

  forge::start("com.tcs.taskflow").expect("forge app failed");
}
