/* models */
import { SyncMetadata } from "@models/sync-metadata";

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

  static formatTime(date: Date | string): string {
    if (typeof date === "string") {
      date = new Date(date);
    }
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  static formatLocaleDate(date: Date | string): string {
    if (typeof date === "string" && date == "") {
      date = new Date();
    }
    if (typeof date === "string") {
      date = new Date(date);
    }
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  static formatDate(time: string): string {
    const dateRec = new Date(time);
    const curDate = new Date();
    const year = dateRec.getFullYear();
    const month = dateRec.getMonth();
    const day = dateRec.getDate();
    const curYear = curDate.getFullYear();
    const curMonth = curDate.getMonth();
    const curDay = curDate.getDate();

    if (day === curDay && month === curMonth && year === curYear) {
      return this.formatTime(dateRec);
    }
    const yesterday = new Date(curDate);
    yesterday.setDate(curDate.getDate() - 1);
    if (
      day === yesterday.getDate() &&
      month === yesterday.getMonth() &&
      year === yesterday.getFullYear()
    ) {
      return `Yesterday ${this.formatTime(dateRec)}`;
    }

    if (dateRec < yesterday) {
      return this.formatLocaleDate(dateRec);
    }
    return "";
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail|yandex|outlook|yahoo|mail|xmail)\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  static getProviderType(syncMetadata: SyncMetadata) {
    const { isOwner, isPrivate } = syncMetadata;
    if (isOwner && isPrivate) return "json";
    if (!isOwner && !isPrivate) return "mongo";
    if (isOwner && !isPrivate) return "mongo";
    if (!isOwner && isPrivate) return null;
    return null;
  }
}
