pub struct DbMigrationService;

impl DbMigrationService {
  pub fn get_current_version(&self) -> u32 {
    1
  }

  pub fn migrate(&self, _from: u32, _to: u32) -> Result<(), String> {
    Ok(())
  }

  pub fn rollback(&self, _version: u32) -> Result<(), String> {
    Ok(())
  }
}
