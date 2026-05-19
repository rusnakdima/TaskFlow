import {
  Component,
  Output,
  EventEmitter,
  OnDestroy,
  ChangeDetectionStrategy,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";

@Component({
  selector: "app-voice-recorder",
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: "./voice-recorder.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRecorderComponent implements OnDestroy {
  @Output() voiceReady = new EventEmitter<Blob>();
  @Output() voiceCancel = new EventEmitter<void>();

  isRecording = signal(false);
  isPlaying = signal(false);
  recordedBlob = signal<Blob | null>(null);
  recordingDuration = signal(0);
  recordedDuration = signal(0);
  playbackPosition = signal(0);
  permissionError = signal<string | null>(null);

  liveAmplitudes: number[] = Array(20).fill(0);
  playbackAmplitudes: number[] = Array(30)
    .fill(0)
    .map(() => Math.random() * 60 + 20);

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordedUrl: string | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animationFrameId: number | null = null;
  private durationInterval: ReturnType<typeof setInterval> | null = null;

  onMouseUp(): void {
    if (this.isRecording()) {
      this.stopRecording();
    }
  }

  onMouseLeave(): void {
    if (this.isRecording()) {
      this.stopRecording();
    }
  }

  startRecording(): void {
    if (this.isRecording()) return;

    this.permissionError.set(null);
    this.audioChunks = [];
    this.isRecording.set(true);
    this.recordingDuration.set(0);
    this.liveAmplitudes = Array(20).fill(0);

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
          this.recordedBlob.set(blob);
          this.recordedDuration.set(this.recordingDuration());
          this.generatePlaybackAmplitudes();
        };

        this.mediaRecorder.start(100);
        this.startDurationTimer();
      })
      .catch((err) => {
        console.error("Error accessing microphone:", err);
        this.isRecording.set(false);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          this.permissionError.set(
            "Microphone access denied. Please allow microphone access in your browser settings."
          );
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          this.permissionError.set("No microphone found. Please connect a microphone.");
        } else {
          this.permissionError.set("Failed to access microphone: " + err.message);
        }
      });
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.isRecording()) {
      this.mediaRecorder.stop();
      this.isRecording.set(false);
      this.stopAmplitudeAnimation();
      this.stopDurationTimer();
    }
  }

  togglePlayback(): void {
    if (!this.recordedBlob()) return;

    if (!this.audioElement) {
      this.recordedUrl = URL.createObjectURL(this.recordedBlob()!);
      this.audioElement = new Audio(this.recordedUrl);
      this.audioElement.onended = () => {
        this.isPlaying.set(false);
        this.playbackPosition.set(0);
      };
      this.audioElement.ontimeupdate = () => {
        if (this.audioElement) {
          const progress = (this.audioElement.currentTime / this.audioElement.duration) * 100;
          this.playbackPosition.set(progress);
        }
      };
    }

    if (this.isPlaying()) {
      this.audioElement?.pause();
      this.isPlaying.set(false);
    } else {
      this.audioElement?.play();
      this.isPlaying.set(true);
    }
  }

  cancelRecording(): void {
    this.cleanup();
    this.voiceCancel.emit();
  }

  deleteRecording(): void {
    this.cleanup();
    this.recordedBlob.set(null);
    this.recordedDuration.set(0);
    this.playbackPosition.set(0);
  }

  sendVoiceMessage(): void {
    const blob = this.recordedBlob();
    if (blob) {
      this.voiceReady.emit(blob);
      this.recordedBlob.set(null);
      this.recordedDuration.set(0);
      this.playbackPosition.set(0);
    }
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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

        const step = Math.floor(dataArray.length / this.liveAmplitudes.length);
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

  private generatePlaybackAmplitudes(): void {
    this.playbackAmplitudes = Array(30)
      .fill(0)
      .map(() => Math.random() * 60 + 20);
  }

  private cleanup(): void {
    this.stopRecording();
    this.stopAmplitudeAnimation();
    this.stopDurationTimer();

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }
    if (this.recordedUrl) {
      URL.revokeObjectURL(this.recordedUrl);
      this.recordedUrl = null;
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}
