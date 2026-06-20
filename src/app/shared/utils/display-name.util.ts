import { Profile } from "@entities/generated/api.types";
export function getProfileDisplayName(profile: Profile): string {
  const name = profile.name?.trim() || "";
  const lastName = profile.last_name?.trim() || "";
  if (name && lastName) return `${name} ${lastName}`;
  if (name) return name;
  if (lastName) return lastName;
  return profile.user?.username || "Unknown";
}
