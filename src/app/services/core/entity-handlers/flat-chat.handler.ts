import { WritableSignal } from "@angular/core";
import { BaseHandler } from "./base.handler";
import { Chat } from "@models/chat.model";

export class FlatChatHandler extends BaseHandler<Chat> {
  constructor(signal: WritableSignal<Chat[]>) {
    super(signal);
  }
}
