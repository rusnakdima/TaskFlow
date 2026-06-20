import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
@Component({
  selector: "app-voice-message",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./voice-message.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceMessageComponent {
  @Input() duration = "0:00";
  @Input() isPlaying = false;
  @Input() isRecording = false;
  @Output() togglePlay = new EventEmitter<void>();
  @Output() startRecording = new EventEmitter<void>();
  @Output() stopRecording = new EventEmitter<void>();
  waveformBars = Array(20)
    .fill(0)
    .map(() => Math.random() * 40 + 10);
  onRecordingClick(): void {
    if (this.isRecording) {
      this.stopRecording.emit();
    } else {
      this.startRecording.emit();
    }
  }
}
