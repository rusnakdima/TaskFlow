import { WritableSignal } from "@angular/core";
import { BaseHandler } from "./base.handler";
import { Comment } from "@models/comment.model";

export class FlatCommentHandler extends BaseHandler<Comment> {
  constructor(signal: WritableSignal<Comment[]>) {
    super(signal);
  }
}
