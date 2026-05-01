import { ShortcutService } from "@services/ui/shortcut.service";
import { Subscription } from "rxjs";

export function bindSaveShortcut(
  shortcutService: ShortcutService,
  callback: () => void
): Subscription {
  return shortcutService.save$.subscribe(callback);
}
