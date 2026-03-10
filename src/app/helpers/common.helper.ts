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
    const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail|yandex|outlook|yahoo|mail|xmail)\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }
}
