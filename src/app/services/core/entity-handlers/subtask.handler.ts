import { WritableSignal } from "@angular/core";
import { BaseHandler } from "./base.handler";
import { Subtask } from "@models/subtask.model";

export class SubtaskHandler extends BaseHandler<Subtask> {
  constructor(signal: WritableSignal<Subtask[]>) {
    super(signal);
  }
}
