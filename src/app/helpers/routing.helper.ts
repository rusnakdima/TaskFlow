import { Router, NavigationEnd } from "@angular/router";
import { Observable } from "rxjs";
import { filter } from "rxjs/operators";

export function watchNavigationEnd(router: Router): Observable<NavigationEnd> {
  return router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd));
}
