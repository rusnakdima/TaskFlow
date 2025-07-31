export enum ResponseStatus {
  SUCCESS = 'success',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
}

export enum ResponseStatusIcon {
  SUCCESS = 'check_circle_outlined',
  INFO = 'info_outlined',
  WARNING = 'warning_outline',
  ERROR = 'dangerous',
  '' = 'notifications',
}

export interface INotify {
  status: ResponseStatus;
  message: string;
}

export interface ActiveNotification extends INotify {
  id: number;
  width: number;
  color: string;
  icon: ResponseStatusIcon;
  intervalId?: number;
  timeoutId?: number;
}

export class Response {
  constructor(
    public status: ResponseStatus,
    public message: string,
    public data: any
  ) {}
}
