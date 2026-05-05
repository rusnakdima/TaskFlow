/* sys lib */
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubRepo {
  pub id: String,
  pub name: String,
  pub full_name: String,
  pub private: bool,
  pub html_url: String,
  pub description: Option<String>,
  pub default_branch: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubIssue {
  pub id: i64,
  pub number: i64,
  pub title: String,
  pub body: String,
  pub state: String,
  pub html_url: String,
  pub created_at: String,
  pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubComment {
  pub id: i64,
  pub body: String,
  pub html_url: String,
  pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubUser {
  pub id: i64,
  pub login: String,
  pub avatar_url: String,
  pub html_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GithubOAuthTokens {
  pub access_token: String,
  pub refresh_token: String,
  pub expires_in: i64,
  pub token_type: String,
}

pub struct GithubService {
  http_client: Client,
}

impl GithubService {
  pub fn new() -> Self {
    let http_client = Client::builder()
      .user_agent("TaskFlow/1.0")
      .build()
      .expect("Failed to create HTTP client");
    Self { http_client }
  }

  pub async fn get_authorization_url(&self, client_id: &str, redirect_uri: &str) -> String {
    let scope = "repo";
    format!(
      "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope={}",
      client_id, redirect_uri, scope
    )
  }

  pub async fn exchange_code_for_token(
    &self,
    client_id: &str,
    client_secret: &str,
    code: &str,
  ) -> Result<GithubOAuthTokens, String> {
    let params = [
      ("client_id", client_id),
      ("client_secret", client_secret),
      ("code", code),
    ];

    let response = self
      .http_client
      .post("https://github.com/login/oauth/access_token")
      .header("Accept", "application/json")
      .form(&params)
      .send()
      .await
      .map_err(|e| e.to_string())?;

    let tokens: GithubOAuthTokens = response.json().await.map_err(|e| e.to_string())?;

    Ok(tokens)
  }

  pub async fn get_user(&self, access_token: &str) -> Result<GithubUser, String> {
    let response = self
      .http_client
      .get("https://api.github.com/user")
      .header("Authorization", format!("Bearer {}", access_token))
      .header("Accept", "application/vnd.github.v3+json")
      .send()
      .await
      .map_err(|e| e.to_string())?;

    let user: GithubUser = response.json().await.map_err(|e| e.to_string())?;

    Ok(user)
  }

  pub async fn get_repos(&self, access_token: &str) -> Result<Vec<GithubRepo>, String> {
    let mut all_repos = Vec::new();
    let mut page = 1;
    let per_page = 100;

    loop {
      let response = self
        .http_client
        .get(&format!(
          "https://api.github.com/user/repos?page={}&per_page={}",
          page, per_page
        ))
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

      let repos: Vec<GithubRepo> = response.json().await.map_err(|e| e.to_string())?;

      if repos.is_empty() {
        break;
      }

      let repos_count = repos.len();
      all_repos.extend(repos);

      if repos_count < per_page {
        break;
      }

      page += 1;

      if page > 10 {
        break;
      }
    }

    Ok(all_repos)
  }

  pub async fn create_issue(
    &self,
    access_token: &str,
    repo_owner: &str,
    repo_name: &str,
    title: &str,
    body: &str,
  ) -> Result<GithubIssue, String> {
    let payload = serde_json::json!({
      "title": title,
      "body": body
    });

    let response = self
      .http_client
      .post(&format!(
        "https://api.github.com/repos/{}/{}/issues",
        repo_owner, repo_name
      ))
      .header("Authorization", format!("Bearer {}", access_token))
      .header("Accept", "application/vnd.github.v3+json")
      .header("Content-Type", "application/json")
      .json(&payload)
      .send()
      .await
      .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();
      return Err(format!("Status: {}, Response: {}", status, error_text));
    }

    let issue: GithubIssue = response.json().await.map_err(|e| e.to_string())?;

    Ok(issue)
  }

  pub async fn create_comment(
    &self,
    access_token: &str,
    repo_owner: &str,
    repo_name: &str,
    issue_number: i64,
    body: &str,
  ) -> Result<GithubComment, String> {
    let payload = serde_json::json!({
      "body": body
    });

    let response = self
      .http_client
      .post(&format!(
        "https://api.github.com/repos/{}/{}/issues/{}/comments",
        repo_owner, repo_name, issue_number
      ))
      .header("Authorization", format!("Bearer {}", access_token))
      .header("Accept", "application/vnd.github.v3+json")
      .header("Content-Type", "application/json")
      .json(&payload)
      .send()
      .await
      .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
      let status = response.status();
      let error_text = response.text().await.unwrap_or_default();
      return Err(format!("Status: {}, Response: {}", status, error_text));
    }

    let comment: GithubComment = response.json().await.map_err(|e| e.to_string())?;

    Ok(comment)
  }
}

impl Default for GithubService {
  fn default() -> Self {
    Self::new()
  }
}
