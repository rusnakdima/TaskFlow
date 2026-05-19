import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  signal,
  OnDestroy,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { EmojiTab, ChatMessage } from "@models/chat.model";

@Component({
  selector: "app-chat-input",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: "./chat-input.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatInputComponent implements OnDestroy {
  @Input() messageInput = "";
  @Input() showEmojiPicker = false;
  @Input() showAttachmentMenu = false;
  @Input() activeEmojiTab: EmojiTab = "smileys";
  @Input() recentEmojis: string[] = [];
  @Input() smileysEmojis: string[] = [];
  @Input() gesturesEmojis: string[] = [];
  @Input() objectsEmojis: string[] = [];
  @Input() recentEmojisDefault: string[] = [];
  @Input() replyTo: ChatMessage | null = null;

  @Output() inputChange = new EventEmitter<string>();
  @Output() send = new EventEmitter<void>();
  @Output() keydown = new EventEmitter<KeyboardEvent>();
  @Output() emojiSelect = new EventEmitter<string>();
  @Output() toggleEmojiPicker = new EventEmitter<void>();
  @Output() toggleAttachmentMenu = new EventEmitter<void>();
  @Output() setEmojiTab = new EventEmitter<EmojiTab>();
  @Output() cancelReply = new EventEmitter<void>();
  @Output() voiceRecorded = new EventEmitter<Blob>();

  isRecordingVoice = signal(false);
  recordedVoiceBlob = signal<Blob | null>(null);
  recordingDuration = signal(0);
  permissionError = signal<string | null>(null);

  liveAmplitudes: number[] = Array(15).fill(0);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private analyserNode: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private durationInterval: ReturnType<typeof setInterval> | null = null;

  onVoiceDown(): void {
    this.startRecording();
  }

  onVoiceUp(): void {
    if (this.isRecordingVoice()) {
      this.stopRecording();
    }
  }

  onSendVoice(): void {
    const blob = this.recordedVoiceBlob();
    if (blob) {
      this.voiceRecorded.emit(blob);
      this.resetRecording();
    }
  }

  onVoiceCancel(): void {
    this.resetRecording();
  }

  private startRecording(): void {
    if (this.isRecordingVoice()) return;

    this.permissionError.set(null);
    this.audioChunks = [];
    this.isRecordingVoice.set(true);
    this.recordingDuration.set(0);
    this.liveAmplitudes = Array(15).fill(10);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.mediaRecorder = new MediaRecorder(stream);
        this.audioChunks = [];

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        this.analyserNode = audioContext.createAnalyser();
        this.analyserNode.fftSize = 64;
        source.connect(this.analyserNode);

        this.startAmplitudeAnimation();

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const blob = new Blob(this.audioChunks, { type: "audio/webm" });
          this.recordedVoiceBlob.set(blob);
        };

        this.mediaRecorder.start(100);
        this.startDurationTimer();
      })
      .catch((err) => {
        console.error("Error accessing microphone:", err);
        this.isRecordingVoice.set(false);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          this.permissionError.set("Microphone access denied");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          this.permissionError.set("No microphone found");
        } else {
          this.permissionError.set("Microphone error");
        }
        setTimeout(() => this.permissionError.set(null), 3000);
      });
  }

  private stopRecording(): void {
    if (this.mediaRecorder && this.isRecordingVoice()) {
      this.mediaRecorder.stop();
      this.isRecordingVoice.set(false);
      this.stopAmplitudeAnimation();
      this.stopDurationTimer();
    }
  }

  private resetRecording(): void {
    this.stopRecording();
    this.recordedVoiceBlob.set(null);
    this.recordingDuration.set(0);
    this.liveAmplitudes = Array(15).fill(10);
  }

  private startDurationTimer(): void {
    this.durationInterval = setInterval(() => {
      this.recordingDuration.update((d) => d + 1);
    }, 1000);
  }

  private stopDurationTimer(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  private startAmplitudeAnimation(): void {
    const update = () => {
      if (this.analyserNode) {
        const dataArray = new Uint8Array(this.analyserNode.frequencyBinCount);
        this.analyserNode.getByteFrequencyData(dataArray);

        const step = Math.max(1, Math.floor(dataArray.length / this.liveAmplitudes.length));
        for (let i = 0; i < this.liveAmplitudes.length; i++) {
          const value = dataArray[i * step] || 0;
          const normalized = (value / 255) * 100;
          this.liveAmplitudes[i] = Math.max(10, normalized);
        }
      }
      this.animationFrameId = requestAnimationFrame(update);
    };
    this.animationFrameId = requestAnimationFrame(update);
  }

  private stopAmplitudeAnimation(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  formatRecordingDuration(): string {
    const mins = Math.floor(this.recordingDuration() / 60);
    const secs = this.recordingDuration() % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  onInputChange(value: string): void {
    this.inputChange.emit(value);
  }

  onSend(): void {
    this.send.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    this.keydown.emit(event);
  }

  onEmojiSelect(emoji: string): void {
    this.emojiSelect.emit(emoji);
  }

  onToggleEmojiPicker(): void {
    this.toggleEmojiPicker.emit();
  }

  onToggleAttachmentMenu(): void {
    this.toggleAttachmentMenu.emit();
  }

  onSetEmojiTab(tab: EmojiTab): void {
    this.setEmojiTab.emit(tab);
  }

  onCancelReply(): void {
    this.cancelReply.emit();
  }

  get currentEmojis(): string[] {
    switch (this.activeEmojiTab) {
      case "recent":
        return this.recentEmojis.length > 0 ? this.recentEmojis : this.recentEmojisDefault;
      case "smileys":
        return this.smileysEmojis || [];
      case "gestures":
        return this.gesturesEmojis || [];
      case "objects":
        return this.objectsEmojis || [];
      default:
        return [];
    }
  }

  ngOnDestroy(): void {
    this.stopAmplitudeAnimation();
    this.stopDurationTimer();
  }
}
