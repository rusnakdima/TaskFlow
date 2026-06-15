import { Observable } from "rxjs";

export abstract class BaseRepository<T> {
  abstract getAll(): Observable<T[]>;
  abstract getById(id: string): Observable<T | null>;
  abstract create(data: Partial<T>): Observable<T>;
  abstract update(id: string, data: Partial<T>): Observable<T>;
  abstract delete(id: string): Observable<void>;
}
