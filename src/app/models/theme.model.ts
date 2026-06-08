export interface ThemePreset {
  id: string;
  name: string;
  accentColor: string;
}

export interface AppearanceSettings {
  mode: "light" | "dark" | "system";
  preset: ThemePreset;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: "pink-dream", name: "Pink Dream", accentColor: "#ec4899" },
  { id: "ocean-blue", name: "Ocean Blue", accentColor: "#3b82f6" },
  { id: "forest-green", name: "Forest Green", accentColor: "#10b981" },
  { id: "royal-purple", name: "Royal Purple", accentColor: "#8b5cf6" },
  { id: "sunset-orange", name: "Sunset Orange", accentColor: "#f97316" },
  { id: "cyan-wave", name: "Cyan Wave", accentColor: "#06b6d4" },
];

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  mode: "dark",
  preset: THEME_PRESETS[0],
};

export function getAccentShades(hexColor: string): Record<string, string> {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  return {
    "50": `rgba(${r}, ${g}, ${b}, 0.05)`,
    "100": `rgba(${r}, ${g}, ${b}, 0.1)`,
    "200": `rgba(${r}, ${g}, ${b}, 0.2)`,
    "300": `rgba(${r}, ${g}, ${b}, 0.3)`,
    "400": `rgba(${r}, ${g}, ${b}, 0.4)`,
    "500": hexColor,
    "600": `rgba(${r}, ${g}, ${b}, 0.85)`,
    "700": `rgba(${r}, ${g}, ${b}, 0.7)`,
    "800": `rgba(${r}, ${g}, ${b}, 0.55)`,
    "900": `rgba(${r}, ${g}, ${b}, 0.45)`,
  };
}
