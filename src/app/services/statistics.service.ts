/* sys lib */
import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

/* models */
import { StatisticsResponse } from "@models/statistics.model";

/* providers */
import { DataSyncProvider } from "@providers/data-sync.provider";

@Injectable({
  providedIn: "root",
})
export class StatisticsService {
  private dataSyncProvider = inject(DataSyncProvider);

  getStatistics(userId: string, timeRange: string = "week"): Observable<StatisticsResponse> {
    return this.dataSyncProvider.getStatistics(userId, timeRange);
  }
}
