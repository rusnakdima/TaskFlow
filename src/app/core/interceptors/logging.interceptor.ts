import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpEventFn,
  HttpErrorResponse,
} from "@angular/common/http";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { inject } from "@angular/core";
import { LoggingService, LogLevel } from "@app/shared/services/logging.service";
import { sanitizeRequestBody } from "@helpers/sanitize.helper";

export const loggingInterceptor: HttpInterceptorFn = (
  req: HttpRequest<any>,
  next: HttpHandlerFn
): Observable<any> => {
  const loggingService = inject(LoggingService);
  const requestId = LoggingService.generateRequestId();
  const startTime = Date.now();

  const sanitizedUrl = sanitizeUrl(req.url);
  const sanitizedBody = req.body ? sanitizeRequestBody(req.body) : null;

  loggingService.debug(
    "HttpInterceptor",
    "REQUEST",
    {
      request_id: requestId,
      method: req.method,
      url: sanitizedUrl,
      body: sanitizedBody,
    },
    undefined
  );

  const enhancedReq = req.clone({
    setHeaders: {
      ...req.headers.keys().reduce(
        (acc, key) => {
          if (!isSensitiveHeader(key)) {
            acc[key] = req.headers.get(key) || "";
          }
          return acc;
        },
        {} as Record<string, string>
      ),
      "X-Request-ID": requestId,
    },
  });

  return next(enhancedReq).pipe(
    tap((event) => {
      const duration = Date.now() - startTime;
      if (event && event.type === 0) {
        loggingService.debug(
          "HttpInterceptor",
          "RESPONSE",
          {
            request_id: requestId,
            duration_ms: duration,
            status: "pending",
          },
          undefined
        );
      }
    }),
    catchError((error: HttpErrorResponse) => {
      const duration = Date.now() - startTime;
      loggingService.error(
        "HttpInterceptor",
        "RESPONSE ERROR",
        {
          request_id: requestId,
          duration_ms: duration,
          status: error.status,
          statusText: error.statusText,
          error: error.message,
        },
        error
      );

      return throwError(() => error);
    })
  );
};

function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url, window.location.origin);
    const sanitizedPath = urlObj.pathname.replace(/[\d-]+(?=\/)/g, "[id]");
    return `${urlObj.protocol}//${urlObj.host}${sanitizedPath}${urlObj.search}`;
  } catch {
    return url;
  }
}

function isSensitiveHeader(key: string): boolean {
  const sensitiveHeaders = ["authorization", "x-api-key", "x-auth-token", "cookie"];
  return sensitiveHeaders.some((h) => key.toLowerCase().includes(h));
}
