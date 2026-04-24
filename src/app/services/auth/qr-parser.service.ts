import { Injectable } from "@angular/core";

export interface QrParseResult {
  token: string | null;
  isDesktopTarget: boolean;
}

@Injectable({
  providedIn: "root",
})
export class QrParserService {
  parseQrData(qrData: string): QrParseResult {
    if (!qrData) {
      return { token: null, isDesktopTarget: false };
    }

    try {
      if (qrData.startsWith("taskflow://qrlogin?data=")) {
        const dataPart = qrData.replace("taskflow://qrlogin?data=", "");
        const parsed = JSON.parse(decodeURIComponent(dataPart));
        return {
          token: parsed.t || parsed.token || null,
          isDesktopTarget: parsed.d === "desktop",
        };
      }

      if (qrData.startsWith("taskflow://qrlogin?")) {
        const params = new URLSearchParams(qrData.replace("taskflow://qrlogin?", ""));
        return {
          token: params.get("t"),
          isDesktopTarget: params.get("d") === "desktop",
        };
      }

      try {
        const parsed = JSON.parse(qrData);
        return {
          token: parsed.t || parsed.token || null,
          isDesktopTarget: parsed.d === "desktop",
        };
      } catch {}

      try {
        const params = new URLSearchParams(qrData.split("?")[1] || "");
        return {
          token: params.get("t"),
          isDesktopTarget: params.get("d") === "desktop",
        };
      } catch {}
    } catch {}

    return { token: null, isDesktopTarget: false };
  }
}
