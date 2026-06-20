export enum ResponseStatus {
  SUCCESS = "success",
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
  VALIDATION_ERROR = "validationError",
  NOT_FOUND = "notFound",
  UNAUTHORIZED = "unauthorized",
  FORBIDDEN = "forbidden",
}

export enum ResponseStatusIcon {
  SUCCESS = "check_circle_outlined",
  INFO = "info_outlined",
  WARNING = "warning_outline",
  ERROR = "dangerous",
  EMPTY = "notifications",
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

export interface ResponseModel<T> {
  status: ResponseStatus;
  message: string;
  data: T;
}

export type Response<T> = ResponseModel<T>;

export function isSuccess<T>(r: Response<T>): boolean {
  return [
    ResponseStatus.SUCCESS,
    ResponseStatus.CREATED,
    ResponseStatus.UPDATED,
    ResponseStatus.DELETED,
  ].includes(r.status);
}

export function getData<T>(response: Response<unknown>): T | null {
  return (response.data as T) ?? null;
}
