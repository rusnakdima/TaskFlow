import { Injectable, signal, computed } from "@angular/core";
import { GithubRepo, GithubConnection } from "@models/github.model";

interface GithubState {
  connected: boolean;
  username?: string;
  user_id?: string;
  avatar_url?: string;
  repos: GithubRepo[];
  loading: boolean;
  error: string | null;
}

const initialState: GithubState = {
  connected: false,
  repos: [],
  loading: false,
  error: null,
};

@Injectable({
  providedIn: "root",
})
export class GithubStore {
  private readonly state = signal<GithubState>(initialState);

  readonly isConnected = computed(() => this.state().connected);
  readonly username = computed(() => this.state().username);
  readonly userId = computed(() => this.state().user_id);
  readonly avatarUrl = computed(() => this.state().avatar_url);
  readonly repos = computed(() => this.state().repos);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);

  setConnectionStatus(status: GithubConnection): void {
    this.state.update((s) => ({
      ...s,
      connected: status.connected,
      username: status.username,
      user_id: status.user_id,
      avatar_url: status.avatar_url,
      error: null,
    }));
  }

  setRepos(repos: GithubRepo[]): void {
    this.state.update((s) => ({ ...s, repos }));
  }

  setLoading(loading: boolean): void {
    this.state.update((s) => ({ ...s, loading }));
  }

  setError(error: string | null): void {
    this.state.update((s) => ({ ...s, error }));
  }

  disconnect(): void {
    this.state.set(initialState);
  }

  clear(): void {
    this.state.set(initialState);
  }
}
