/**
 * Profile Store - Manages user profile state using Angular signals
 */

import { Injectable, signal, computed, Signal, WritableSignal } from "@angular/core";
import { Profile } from "@models/profile.model";
import { findById } from "./utils/store-helpers";

interface ProfileState {
  profile: Profile | null;
  loading: boolean;
  loaded: boolean;
  lastLoaded: Date | null;
}

const initialState: ProfileState = {
  profile: null,
  loading: false,
  loaded: false,
  lastLoaded: null,
};

@Injectable({
  providedIn: "root",
})
export class ProfileStore {
  private readonly state: WritableSignal<ProfileState> = signal(initialState);

  readonly profile: Signal<Profile | null> = computed(() => this.state().profile);
  readonly loading: Signal<boolean> = computed(() => this.state().loading);
  readonly loaded: Signal<boolean> = computed(() => this.state().loaded);
  readonly lastLoaded: Signal<Date | null> = computed(() => this.state().lastLoaded);

  profileExists(): boolean {
    return this.profile() !== null;
  }

  setLoading(loading: boolean): void {
    this.state.update((state) => ({ ...state, loading }));
  }

  setLoaded(loaded: boolean): void {
    this.state.update((state) => ({
      ...state,
      loaded,
      lastLoaded: loaded ? new Date() : state.lastLoaded,
    }));
  }

  setProfile(profile: Profile | null): void {
    this.state.update((state) => ({ ...state, profile }));
  }

  updateProfile(updates: Partial<Profile>): void {
    this.state.update((state) => ({
      ...state,
      profile: state.profile ? { ...state.profile, ...updates } : null,
    }));
  }

  clearProfile(): void {
    this.state.update((state) => ({ ...state, profile: null }));
  }

  clear(): void {
    this.state.set(initialState);
  }
}
