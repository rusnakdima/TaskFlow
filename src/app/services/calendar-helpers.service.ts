import { TaskStatus } from "@models/task.model";

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: "todo" | "task";
  status: string;
  description?: string;
  todoId: string;
  isPrivate: boolean;
  isOwner: boolean;
}

export function getEventColor(event: CalendarEvent): string {
  if (event.status === "due") return "bg-red-500";
  if (event.status === "completed") return "bg-green-500";
  if (event.status === "skipped") return "bg-orange-500";
  if (event.status === "failed") return "bg-gray-500";
  return "bg-blue-500";
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString();
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function formatWeekRange(selectedDate: Date): string {
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  const startMonth = startOfWeek.toLocaleDateString("en-US", { month: "short" });
  const endMonth = endOfWeek.toLocaleDateString("en-US", { month: "short" });
  const year = startOfWeek.getFullYear();

  if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
    return `${startMonth} ${startOfWeek.getDate()} - ${endOfWeek.getDate()}, ${year}`;
  } else {
    return `${startMonth} ${startOfWeek.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${year}`;
  }
}

export function formatSelectedDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function getCurrentTitle(
  viewMode: "month" | "week" | "day",
  currentMonth: Date,
  selectedDate: Date
): string {
  if (viewMode === "month") {
    return formatMonthYear(currentMonth);
  } else if (viewMode === "week") {
    return formatWeekRange(selectedDate);
  } else if (viewMode === "day") {
    return formatSelectedDate(selectedDate);
  }
  return "";
}

export function getTaskStatusText(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.COMPLETED:
      return "completed";
    case TaskStatus.SKIPPED:
      return "skipped";
    case TaskStatus.FAILED:
      return "failed";
    default:
      return "due";
  }
}

export function getTaskEventTitle(status: TaskStatus, taskTitle: string): string {
  const statusText = getTaskStatusText(status);
  return `${statusText.charAt(0).toUpperCase() + statusText.slice(1)}: ${taskTitle}`;
}
