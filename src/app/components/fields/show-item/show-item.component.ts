/* sys lib */
import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: 'app-show-item',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './show-item.component.html'
})
export class ShowItemComponent {
  @Output() perItemChanged: EventEmitter<number> = new EventEmitter<number>();

  perItem: number = 10;

  changePerItem(){
    this.perItemChanged.emit(this.perItem);
  }
};