/* sys lib */
import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { Response, ResponseStatus } from '@models/response';

@Injectable({
  providedIn: 'root'
})
export class NotifyService {
  public notify = new Subject<Response>();

  showNotify(status: ResponseStatus, message: string) {
    try {
      this.notify.next(new Response(status, message, null));
    } catch (error) {
      console.error('Error in showNotify:', error);
    }
  }

  showSuccess(message: string) {
    this.showNotify(ResponseStatus.SUCCESS, message);
  }

  showInfo(message: string) {
    this.showNotify(ResponseStatus.INFO, message);
  }

  showWarning(message: string) {
    this.showNotify(ResponseStatus.WARNING, message);
  }

  showError(message: string) {
    this.showNotify(ResponseStatus.ERROR, message);
  }
}
