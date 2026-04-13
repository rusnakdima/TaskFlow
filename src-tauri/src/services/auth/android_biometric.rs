// Android biometric using raw JNI FFI

#[cfg(not(target_os = "android"))]
static JAVA_VM: std::sync::OnceLock<std::os::fd::RawFd> = std::sync::OnceLock::new();

#[cfg(not(target_os = "android"))]
pub fn init_java_vm(vm: std::os::fd::RawFd) {
  let _ = JAVA_VM.set(vm);
}

pub fn check_biometric_available() -> Result<bool, String> {
  // For now, return true to allow testing the flow
  // The actual JNI call would go here
  Ok(true)
}

pub fn authenticate_biometric(title: &str, subtitle: &str) -> Result<bool, String> {
  // For now, return true to allow testing the flow
  // The actual JNI call would go here
  Ok(true)
}
