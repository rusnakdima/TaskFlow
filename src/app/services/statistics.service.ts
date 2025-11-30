/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response";
import { StatisticsResponse } from "@models/statistics";

@Injectable({
  providedIn: "root",
})
export class StatisticsService {
  constructor() {}

  async getStatistics(
    userId: string,
    timeRange: string = "week"
  ): Promise<Response<StatisticsResponse>> {
    return await invoke<Response<StatisticsResponse>>("statisticsGet", {
      userId,
      timeRange,
    });
  }
}
