/* sys lib */
import { Injectable } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";

/* models */
import { Response } from "@models/response";

@Injectable({
  providedIn: "root",
})
export class ResetPasswordService {
  constructor() {}

  sendRequest(email: string): Promise<Response> {
    return invoke<Response>("resetPassword", { email: email });
  }
}
