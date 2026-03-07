import { Injectable } from "@angular/core";
import { CalendarEvent } from "./calendar-helpers.service";

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  events: CalendarEvent[];
}

@Injectable({
  providedIn: "root",
})
export class CalendarGeneratorService {
  generateCalendarDays(
    currentMonth: Date,
    selectedDate: Date,
    events: CalendarEvent[]
  ): CalendarDay[] {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const newCalendarDays: CalendarDay[] = [];

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayEvents = events.filter((event) => this.isSameDay(event.date, date));

      newCalendarDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === month,
        isToday: this.isSameDay(date, new Date()),
        isSelected: this.isSameDay(date, selectedDate),
        events: dayEvents,
      });
    }

    return newCalendarDays;
  }

  generateWeekDays(selectedDate: Date, currentMonth: Date, events: CalendarEvent[]): CalendarDay[] {
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

    const newWeekDays: CalendarDay[] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const dayEvents = events.filter((event) => this.isSameDay(event.date, date));

      newWeekDays.push({
        date: new Date(date),
        isCurrentMonth: date.getMonth() === currentMonth.getMonth(),
        isToday: this.isSameDay(date, new Date()),
        isSelected: this.isSameDay(date, selectedDate),
        events: dayEvents,
      });
    }

    return newWeekDays;
  }

  generateDayView(selectedDate: Date, events: CalendarEvent[]): CalendarEvent[] {
    return events.filter((event) => this.isSameDay(event.date, selectedDate));
  }

  getWeeksForMobile(calendarDays: CalendarDay[]): CalendarDay[][] {
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.toDateString() === date2.toDateString();
  }
}
