/* sys lib */
import { Injectable, inject, OnDestroy } from "@angular/core";
import { BehaviorSubject, Observable, fromEvent, merge, of, Subscription } from "rxjs";
import { map, distinctUntilChanged } from "rxjs/operators";

/* services */
import { ApiProvider } from "@providers/api.provider";

interface QueuedOperation {
  id: string;
  operation: "create" | "update" | "delete";
  table: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

@Injectable({
  providedIn: "root",
})
export class OfflineQueueService implements OnDestroy {
  private apiProvider = inject(ApiProvider);

  private readonly QUEUE_KEY = "offline_queue";
  private readonly MAX_RETRIES = 3;

  private queueSubject = new BehaviorSubject<QueuedOperation[]>([]);
  private isProcessingSubject = new BehaviorSubject<boolean>(false);
  private isOnlineSubject = new BehaviorSubject<boolean>(navigator.onLine);
  private networkSub: Subscription | null = null;

  constructor() {
    this.loadQueueFromStorage();
    this.setupNetworkListeners();
  }

  ngOnDestroy(): void {
    if (this.networkSub) {
      this.networkSub.unsubscribe();
    }
  }


