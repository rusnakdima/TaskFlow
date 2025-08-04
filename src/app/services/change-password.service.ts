/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response";

@Injectable({
  providedIn: "root",
})
export class ChangePasswordService {
  constructor() {}

  checkToken(data: { username: string; token: string }): Promise<Response> {
    return invoke<Response>("checkToken", data);
  }

  sendRequest(data: { username: string; password: string; token: string }): Promise<Response> {
    return invoke<Response>("changePassword", data);
  }
}
