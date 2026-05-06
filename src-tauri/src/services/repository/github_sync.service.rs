use serde_json::Value;
use crate::entities::response_entity::ResponseModel;
use crate::helpers::response_helper::err_response;
use crate::services::github_service::GithubService;

pub struct GithubSyncService {
    github_service: GithubService,
}

impl GithubSyncService {
    pub fn new() -> Self {
        Self {
            github_service: GithubService::new(),
        }
    }

    pub async fn publish_task_to_github(
        &self,
        task_record: Value,
        repo_owner: &str,
        repo_name: &str,
        access_token: &str,
    ) -> Result<Value, ResponseModel> {
        let task_title = task_record
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Task");
        let task_description = task_record
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let task_priority = task_record
            .get("priority")
            .and_then(|v| v.as_str())
            .unwrap_or("medium");
        let task_end_date = task_record
            .get("end_date")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let issue_body = format!(
            "**Task Details**\n\n**Description:** {}\n\n**Priority:** {}\n**Due Date:** {}\n**Created in:** TaskFlow\n\n---\n[View in TaskFlow](taskflow://tasks/{})",
            task_description,
            task_priority,
            task_end_date,
            task_record.get("id").and_then(|v| v.as_str()).unwrap_or("")
        );

        let issue = self.github_service
            .create_issue(access_token, repo_owner, repo_name, task_title, &issue_body)
            .await
            .map_err(|e| err_response(&format!("GitHub API error: {}", e)))?;

        let mut updated_record = task_record.clone();
        if let Some(obj) = updated_record.as_object_mut() {
            obj.insert("github_issue_id".to_string(), serde_json::json!(issue.id));
            obj.insert("github_issue_url".to_string(), serde_json::json!(issue.html_url));
        }

        Ok(updated_record)
    }

    pub async fn sync_comment_to_github(
        &self,
        comment_record: Value,
        repo_owner: &str,
        repo_name: &str,
        github_issue_id: i64,
        access_token: &str,
    ) -> Result<Value, ResponseModel> {
        let comment_content = comment_record
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        let gh_comment = self.github_service
            .create_comment(access_token, repo_owner, repo_name, github_issue_id, comment_content)
            .await
            .map_err(|e| err_response(&format!("GitHub API error: {}", e)))?;

        let mut updated_record = comment_record.clone();
        if let Some(obj) = updated_record.as_object_mut() {
            obj.insert("github_comment_id".to_string(), serde_json::json!(gh_comment.id));
            obj.insert("github_issue_id".to_string(), serde_json::json!(github_issue_id));
        }

        Ok(updated_record)
    }
}

impl Default for GithubSyncService {
    fn default() -> Self {
        Self::new()
    }
}