import { ActionColors } from "@shared/utils/constants";

export const ACTION_COLOR_BASE = "rounded-lg p-1 transition-all duration-200 hover:scale-110";

export function getActionColor(action: string, baseClass = ACTION_COLOR_BASE): string {
  const colorKey = action as keyof typeof ActionColors;
  return `${baseClass} ${ActionColors[colorKey] || ActionColors.default}`;
}
