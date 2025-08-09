/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response";

@Injectable({
  providedIn: "root",
})
export class ProfileService {
  constructor() {}

  async get_by_user_id<R>(userId: string): Promise<Response<R>> {
    return await invoke<Response<R>>("profile_get_by_user_id", { userId: userId });
  }
}
