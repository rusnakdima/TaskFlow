export enum ResponseStatus {
  SUCCESS = "Success",
  INFO = "info",
  WARNING = "Warning",
  ERROR = "Error",
}

export enum ResponseStatusIcon {
  SUCCESS = "check_circle_outlined",
  INFO = "info_outlined",
  WARNING = "warning_outline",
  ERROR = "dangerous",
  "" = "notifications",
}

export interface INotify {
  status: ResponseStatus;
  message: string;
}

export interface ActiveNotification extends INotify {
  id: number;
  icon: ResponseStatusIcon;
  intervalId?: number;
  timeoutId?: number;
}

export interface Response<T> {
  status: ResponseStatus;
  message: string;
  data: T;
}
