import { WritableSignal } from "@angular/core";
import { BaseHandler } from "./base.handler";
import { Task } from "@models/task.model";

export class TaskHandler extends BaseHandler<Task> {
  constructor(signal: WritableSignal<Task[]>) {
    super(signal);
  }
}