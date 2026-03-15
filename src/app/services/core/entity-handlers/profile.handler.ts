import { WritableSignal } from "@angular/core";
import { EntityHandler } from "./entity-handler.base";
import { Profile } from "@models/profile.model";

export class ProfileHandler extends EntityHandler<Profile> {
  constructor(private signal: WritableSignal<Profile | null>) {
    super();
  }

  add(data: Profile): void {
    this.signal.set(data);
  }

  update(id: string, updates: Partial<Profile>): void {
    this.signal.update((profile) => (profile ? { ...profile, ...updates } : null));
  }

  remove(): void {
    this.signal.set(null);
  }

  getById(): Profile | undefined {
    return this.signal() || undefined;
  }
}
