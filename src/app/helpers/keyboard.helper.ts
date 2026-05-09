import { ShortcutService } from "@services/ui/shortcut.service";
import { Observable } from "rxjs";

export function bindSaveShortcut(
  shortcutService: ShortcutService,
  _callback: () => void
): Observable<unknown> {
  return shortcutService.save$.pipe();
}
