/* models */
import { SyncMetadata } from "@models/sync-metadata";

export class Common {
  static isJson(data: Object): boolean {
    return typeof data === "object";
  }

  static isJsonAsString(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === "object" && parsed !== null;
    } catch (e) {
      return false;
    }
  }

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

  static formatTimeAgo(date: string | number | Date): string {
    const dateRec = new Date(date);
    const curDate = new Date();

    if (curDate.getTime() >= dateRec.getTime()) {
      const diff = curDate.getTime() - dateRec.getTime();

      const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
      if (years >= 1) {
        return `${years} year${years > 1 ? "s" : ""} ago`;
      }

      const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
      const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
      if (months >= 1) {
        return `${months} month${months > 1 ? "s" : ""}${
          days > 0 ? ` ${days} day${days > 1 ? "s" : ""}` : ""
        } ago`;
      }

      const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (totalDays >= 1) {
        return `${totalDays} day${totalDays > 1 ? "s" : ""} ${hours
          .toString()
          .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")} ago`;
      }

      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")} ago`;
    }

    return "";
  }

  static formatTimeIn(date: string | number | Date): string {
    const dateRec = new Date(date);
    const curDate = new Date();

    if (dateRec.getTime() >= curDate.getTime()) {
      const diff = dateRec.getTime() - curDate.getTime();

      const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
      if (years >= 1) {
        return `in ${years} year${years > 1 ? "s" : ""}`;
      }

      const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
      const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
      if (months >= 1) {
        return `in ${months} month${months > 1 ? "s" : ""}${
          days > 0 ? ` ${days} day${days > 1 ? "s" : ""}` : ""
        }`;
      }

      const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (totalDays >= 1) {
        return `in ${totalDays} day${totalDays > 1 ? "s" : ""} ${hours
          .toString()
          .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")}`;
      }

      return `in ${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }

    return "";
  }

  static formatTimeLeft(date: string | number | Date): string {
    const dateRec = new Date(date);
    const curDate = new Date();

    if (dateRec.getTime() >= curDate.getTime()) {
      const diff = dateRec.getTime() - curDate.getTime();

      const years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365));
      if (years >= 1) {
        return `${years} year${years > 1 ? "s" : ""} left`;
      }

      const months = Math.floor(diff / (1000 * 60 * 60 * 24 * 30));
      const days = Math.floor((diff % (1000 * 60 * 60 * 24 * 30)) / (1000 * 60 * 60 * 24));
      if (months >= 1) {
        return `${months} month${months > 1 ? "s" : ""}${
          days > 0 ? ` ${days} day${days > 1 ? "s" : ""}` : ""
        } left`;
      }

      const totalDays = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      if (totalDays >= 1) {
        return `${totalDays} day${totalDays > 1 ? "s" : ""} ${hours
          .toString()
          .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
          .toString()
          .padStart(2, "0")} left`;
      }

      return `${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}:${seconds.toString().padStart(2, "0")} left`;
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
