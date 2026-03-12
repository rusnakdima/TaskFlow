export class Common {
  static truncateString(str: string, length: number = 25): string {
    if (str) {
      const endIndex: number = length;
      if (str.length <= endIndex) {
        return str;
      }

      return str.slice(0, endIndex) + "...";
    }
    return "";
  }

  static isValidEmail(email: string): boolean {
    // FIX: Allow all valid email formats, not just specific providers
    // RFC 5322 compliant email regex (simplified but comprehensive)
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  }
}
