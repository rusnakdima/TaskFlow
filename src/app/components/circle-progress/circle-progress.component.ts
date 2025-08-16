/* sys lib */
import { CommonModule } from "@angular/common";
import { AfterViewInit, Component, Input, OnChanges, OnInit, SimpleChanges } from "@angular/core";
import * as ProgressBar from "progressbar.js";

@Component({
  selector: "app-circle-progress",
  imports: [CommonModule],
  templateUrl: "./circle-progress.component.html",
})
export class CircleProgressComponent implements OnInit, OnChanges, AfterViewInit {
  constructor() {}

  bar: any = ProgressBar.Circle;

  @Input() percentCompletedTasks: number = 0;
  @Input() index: number = 0;

  ngOnInit(): void {
    setTimeout(() => {
      this.bar = new ProgressBar.Circle(`#progressRing${this.index}`, {
        color: "#55f",
        strokeWidth: 5,
        trailColor: "#ddd",
        trailWidth: 5,
        easing: "easeInOut",
        text: {
          autoStyleContainer: false,
          value: `<p>${Math.floor(this.percentCompletedTasks * 100)}%</p>`,
          style: {
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            padding: 0,
            margin: 0,
            fontSize: "1.7rem",
          },
        },
      });

      this.bar.animate(this.percentCompletedTasks);
    }, 200);
  }

  ngOnChanges(changes: SimpleChanges): void {
    setTimeout(() => {
      if (this.bar) {
        this.bar.animate(this.percentCompletedTasks);
      }
    }, 200);
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (this.bar) {
        this.bar.animate(this.percentCompletedTasks);
      }
    }, 200);
  }
}
