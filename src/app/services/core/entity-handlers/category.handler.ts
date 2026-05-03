import { WritableSignal } from "@angular/core";
import { BaseHandler } from "./base.handler";
import { Category } from "@models/category.model";

export class CategoryHandler extends BaseHandler<Category> {
  constructor(signal: WritableSignal<Category[]>) {
    super(signal);
  }
}
