export interface GithubRepo {
  id: string;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  updated_at: string;
}

export interface GithubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
}

export interface GithubComment {
  id: number;
  body: string;
  html_url: string;
  created_at: string;
}

export interface GithubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GithubOAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface GithubConnection {
  connected: boolean;
  username?: string;
  user_id?: string;
  avatar_url?: string;
}
