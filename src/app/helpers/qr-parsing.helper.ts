export interface ParsedQrData {
  token: string | null;
  isDesktopTarget: boolean;
}

export class QrParsingHelper {
  static parseQrData(qrData: string): ParsedQrData {
    if (!qrData) {
      return { token: null, isDesktopTarget: false };
    }

    let token: string | null = null;
    let isDesktopTarget = false;

    try {
      if (qrData.startsWith("taskflow://qrlogin?data=")) {
        const dataPart = qrData.replace("taskflow://qrlogin?data=", "");
        const parsed = JSON.parse(decodeURIComponent(dataPart));
        token = parsed.t;
        isDesktopTarget = parsed.d === "desktop";
      } else if (qrData.includes("t=")) {
        const params = new URLSearchParams(qrData.replace("taskflow://qrlogin?", ""));
        token = params.get("t");
        isDesktopTarget = params.get("d") === "desktop";
      } else {
        const parsed = JSON.parse(qrData);
        token = parsed.t || parsed.token;
        isDesktopTarget = parsed.d === "desktop";
      }
    } catch {
      try {
        const params = new URLSearchParams(qrData.split("?")[1] || "");
        token = params.get("t");
        isDesktopTarget = params.get("d") === "desktop";
      } catch {
        token = null;
      }
    }

    return { token, isDesktopTarget };
  }
}
