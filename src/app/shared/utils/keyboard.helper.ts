import { ShortcutService } from "@services/ui/shortcut.service";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

export function bindSaveShortcut(
  shortcutService: ShortcutService,
  callback: () => void
): Observable<unknown> {
  return shortcutService.save$.pipe(tap(() => callback()));
}
