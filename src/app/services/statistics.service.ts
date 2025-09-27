/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response, ResponseStatus } from "@models/response";
import { Statistics, ChartData, Achievement, DetailedMetric } from "@models/statistics";

@Injectable({
  providedIn: "root",
})
export class StatisticsService {
  constructor() {}

  async getStatistics(
    userId: string,
    timeRange: string = "week"
  ): Promise<{
    statistics: Statistics;
    chartData: ChartData;
    achievements: Achievement[];
    detailedMetrics: DetailedMetric[];
  }> {
    const response: Response<any> = await invoke<Response<any>>("statisticsGet", {
      userId,
      timeRange,
    });

    if (response.status === ResponseStatus.SUCCESS) {
      return response.data;
    } else {
      throw new Error(response.message);
    }
  }
}
