import { SongTrack, SynthInstrument } from "../data/songsDatabase";

export interface SongPreviewMetadata {
  previewUrl: string | null;
  artworkUrl?: string;
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private activeGains: GainNode[] = [];
  private activeAudioElement: HTMLAudioElement | null = null;
  private activeOriginalGainNode: GainNode | null = null;
  private activeSynthMasterGain: GainNode | null = null;
  private originalSongVolume = 1.5; // Default 150% pre-amp boost for original song clarity
  private accompanimentVolume = 0.55; // Default 55% for accompaniment/synth so original song stands out
  private stopTimerId: number | null = null;
  private continuationTimerId: number | null = null;
  private progressRafId: number | null = null;
  private previewCache = new Map<string, SongPreviewMetadata>();

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private isPlayingSynthMode = false;

  /**
   * Sets the volume / pre-amp boost of the original song (or lead melody) independently (0.1 to 2.5, where 1.0 = 100%, 2.5 = 250% boost).
   */
  public setOriginalSongVolume(volumeMultiplier: number): void {
    const clamped = Math.max(0.1, Math.min(2.5, volumeMultiplier));
    this.originalSongVolume = clamped;

    if (this.activeOriginalGainNode && this.ctx) {
      try {
        const targetGain = this.isPlayingSynthMode ? 0.58 * clamped : clamped;
        this.activeOriginalGainNode.gain.setValueAtTime(
          targetGain,
          this.ctx.currentTime
        );
      } catch {
        // ignore
      }
    } else if (this.activeAudioElement) {
      try {
        this.activeAudioElement.volume = Math.max(0, Math.min(1, clamped));
      } catch {
        // ignore
      }
    }
  }

  public getOriginalSongVolume(): number {
    return this.originalSongVolume;
  }

  /**
   * Sets the volume of the accompaniment (bass, drums, backing arrangement) independently (0.0 to 1.5, where 1.0 = 100%).
   */
  public setAccompanimentVolume(volumeMultiplier: number): void {
    const clamped = Math.max(0.0, Math.min(1.5, volumeMultiplier));
    this.accompanimentVolume = clamped;

    if (this.activeSynthMasterGain && this.ctx) {
      try {
        this.activeSynthMasterGain.gain.setValueAtTime(
          0.36 * clamped,
          this.ctx.currentTime
        );
      } catch {
        // ignore
      }
    }
  }

  public getAccompanimentVolume(): number {
    return this.accompanimentVolume;
  }

  public stopSongPlayback(): void {
    if (this.stopTimerId !== null) {
      window.clearTimeout(this.stopTimerId);
      this.stopTimerId = null;
    }
    if (this.continuationTimerId !== null) {
      window.clearTimeout(this.continuationTimerId);
      this.continuationTimerId = null;
    }
    if (this.progressRafId !== null) {
      window.cancelAnimationFrame(this.progressRafId);
      this.progressRafId = null;
    }
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore already stopped
      }
    }
    this.activeOscillators = [];

    for (const g of this.activeGains) {
      try {
        g.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeGains = [];
    this.activeOriginalGainNode = null;
    this.activeSynthMasterGain = null;
    this.isPlayingSynthMode = false;

    if (this.activeAudioElement) {
      try {
        this.activeAudioElement.pause();
      } catch {
        // ignore
      }
      this.activeAudioElement = null;
    }
  }

  public async prefetchSongPreview(
    song: SongTrack
  ): Promise<SongPreviewMetadata> {
    if (song.customAudioUrl) {
      return { previewUrl: song.customAudioUrl };
    }
    if (this.previewCache.has(song.id)) {
      return this.previewCache.get(song.id)!;
    }

    // Try searching with Hebrew/native Title + Artist first, then fallback to itunesQuery
    const queriesToTry = [
      `${song.title.replace(/\(.*?\)/g, "").trim()} ${song.artist}`,
      song.itunesQuery,
    ];

    for (const q of queriesToTry) {
      try {
        const res = await fetch(
          `/api/itunes-preview?term=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.previewUrl) {
            const proxiedUrl = `/api/audio-proxy?url=${encodeURIComponent(
              data.previewUrl
            )}`;
            const meta: SongPreviewMetadata = {
              previewUrl: proxiedUrl,
              artworkUrl: data.artworkUrl,
            };
            this.previewCache.set(song.id, meta);
            return meta;
          }
        }
      } catch {
        // try next query
      }
    }

    const emptyMeta: SongPreviewMetadata = { previewUrl: null };
    this.previewCache.set(song.id, emptyMeta);
    return emptyMeta;
  }

  /**
   * Plays a specific segment of the song: from `startSec` to `startSec + durationSec`.
   * Prioritizes the original song recording from iTunes / custom upload, with studio synth fallback.
   */
  public async playSongSegment(
    song: SongTrack,
    options: {
      startSec?: number;
      durationSec: number;
      preferRealAudio: boolean;
      onProgress?: (currentSec: number, levels: number[]) => void;
      onComplete?: () => void;
      onSourceResolved?: (
        mode: "real_audio" | "studio_synth",
        artworkUrl?: string
      ) => void;
    }
  ): Promise<void> {
    this.stopSongPlayback();
    const startSec = options.startSec ?? 0;
    const durationSec = options.durationSec;

    let previewMeta: SongPreviewMetadata = {
      previewUrl: song.customAudioUrl || null,
    };
    if (!previewMeta.previewUrl && options.preferRealAudio) {
      previewMeta = await this.prefetchSongPreview(song);
    }

    if (previewMeta.previewUrl && options.preferRealAudio) {
      const playedReal = await this.tryPlayRealAudioSegment(
        previewMeta.previewUrl,
        startSec,
        durationSec,
        song.bpm,
        options.onProgress,
        options.onComplete
      );
      if (playedReal) {
        options.onSourceResolved?.("real_audio", previewMeta.artworkUrl);
        return;
      }
    }

    options.onSourceResolved?.("studio_synth");
    this.playSynthSegment(
      song,
      startSec,
      durationSec,
      options.onProgress,
      options.onComplete
    );
  }

  /**
   * Plays the continuation of the song after a guess (success or failure),
   * delayed slightly so the success/failure sound effect is heard clearly first.
   */
  public scheduleContinuationAfterGuess(
    song: SongTrack,
    options: {
      startFromSec: number;
      continuationDurationSec?: number;
      delayMs?: number;
      preferRealAudio: boolean;
      onStart?: () => void;
      onProgress?: (currentSec: number, levels: number[]) => void;
      onComplete?: () => void;
    }
  ): void {
    if (this.continuationTimerId !== null) {
      window.clearTimeout(this.continuationTimerId);
    }
    const delay = options.delayMs ?? 750;
    const contDuration = options.continuationDurationSec ?? 18;

    this.continuationTimerId = window.setTimeout(() => {
      options.onStart?.();
      this.playSongSegment(song, {
        startSec: options.startFromSec,
        durationSec: contDuration,
        preferRealAudio: options.preferRealAudio,
        onProgress: options.onProgress,
        onComplete: options.onComplete,
      });
    }, delay);
  }

  private tryPlayRealAudioSegment(
    url: string,
    startSec: number,
    durationSec: number,
    bpm: number,
    onProgress?: (currentSec: number, levels: number[]) => void,
    onComplete?: () => void
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.src = url;
      audio.volume = 1.0;

      let settled = false;
      const failTimeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            audio.pause();
          } catch {
            // ignore
          }
          resolve(false);
        }
      }, 4000);

      const startPlayback = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(failTimeout);

        try {
          if (startSec > 0 && (!audio.duration || startSec < audio.duration - 1)) {
            audio.currentTime = startSec;
          } else {
            audio.currentTime = 0;
          }
        } catch {
          // ignore seek error before play
        }

        this.activeAudioElement = audio;
        this.isPlayingSynthMode = false;

        // Route original song audio through dedicated Web Audio pre-amp GainNode + vocal clarity EQ + soft-knee limiter
        try {
          const ctx = this.getContext();
          const mediaSource = ctx.createMediaElementSource(audio);
          const presenceFilter = ctx.createBiquadFilter();
          presenceFilter.type = "peaking";
          presenceFilter.frequency.setValueAtTime(2400, ctx.currentTime);
          presenceFilter.Q.setValueAtTime(1.1, ctx.currentTime);
          presenceFilter.gain.setValueAtTime(3.5, ctx.currentTime);

          const originalGain = ctx.createGain();
          originalGain.gain.setValueAtTime(
            this.originalSongVolume,
            ctx.currentTime
          );

          const compressor = ctx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-10, ctx.currentTime);
          compressor.knee.setValueAtTime(16, ctx.currentTime);
          compressor.ratio.setValueAtTime(3.5, ctx.currentTime);
          compressor.attack.setValueAtTime(0.004, ctx.currentTime);
          compressor.release.setValueAtTime(0.14, ctx.currentTime);

          mediaSource.connect(presenceFilter);
          presenceFilter.connect(originalGain);
          originalGain.connect(compressor);
          compressor.connect(ctx.destination);

          this.activeOriginalGainNode = originalGain;
          this.activeGains.push(originalGain);
        } catch {
          audio.volume = Math.max(0, Math.min(1, this.originalSongVolume));
        }

        const startPerf = performance.now();
        const targetEndSec = startSec + durationSec;

        audio
          .play()
          .then(() => {
            const tick = () => {
              if (this.activeAudioElement !== audio) return;
              const elapsed = (performance.now() - startPerf) / 1000;
              const currentPos = Math.min(targetEndSec, startSec + elapsed);
              const bars = this.generateAnimatedSpectrum(
                currentPos,
                bpm || 124
              );
              onProgress?.(currentPos, bars);

              if (elapsed < durationSec && !audio.paused && !audio.ended) {
                this.progressRafId = window.requestAnimationFrame(tick);
              }
            };
            this.progressRafId = window.requestAnimationFrame(tick);

            this.stopTimerId = window.setTimeout(() => {
              this.stopSongPlayback();
              onProgress?.(targetEndSec, new Array(24).fill(0.08));
              onComplete?.();
            }, durationSec * 1000);

            resolve(true);
          })
          .catch(() => {
            resolve(false);
          });
      };

      audio.addEventListener("loadedmetadata", startPlayback, { once: true });
      audio.addEventListener("canplay", startPlayback, { once: true });

      audio.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(failTimeout);
          resolve(false);
        }
      };

      audio.load();
    });
  }

  private playSynthSegment(
    song: SongTrack,
    startSec: number,
    durationSec: number,
    onProgress?: (currentSec: number, levels: number[]) => void,
    onComplete?: () => void
  ): void {
    const ctx = this.getContext();
    const now = ctx.currentTime + 0.04;
    this.isPlayingSynthMode = true;

    // Master envelope for smooth fade-out at segment end
    const envelopeGain = ctx.createGain();
    envelopeGain.gain.setValueAtTime(1.0, now);
    envelopeGain.gain.setValueAtTime(
      1.0,
      now + Math.max(0.1, durationSec - 0.18)
    );
    envelopeGain.gain.linearRampToValueAtTime(0.0001, now + durationSec);
    envelopeGain.connect(ctx.destination);
    this.activeGains.push(envelopeGain);

    // 1. Dedicated Lead Song Bus (controlled by originalSongVolume so players can boost the song melody independently)
    const leadSongGain = ctx.createGain();
    leadSongGain.gain.setValueAtTime(0.58 * this.originalSongVolume, now);
    leadSongGain.connect(envelopeGain);
    this.activeOriginalGainNode = leadSongGain;
    this.activeGains.push(leadSongGain);

    // 2. Dedicated Accompaniment Bus (controlled by accompanimentVolume for bass, kick, and hi-hat)
    const accompanimentGain = ctx.createGain();
    accompanimentGain.gain.setValueAtTime(0.36 * this.accompanimentVolume, now);
    accompanimentGain.connect(envelopeGain);
    this.activeSynthMasterGain = accompanimentGain;
    this.activeGains.push(accompanimentGain);

    // Loop the 5-second arrangement across the requested duration so 10s, 15s, or continuation works seamlessly
    const loopLength = 5.0;
    const totalLoops = Math.ceil((startSec + durationSec) / loopLength) + 1;

    for (let loopIdx = 0; loopIdx < totalLoops; loopIdx++) {
      const loopOffset = loopIdx * loopLength;

      for (const note of song.melody) {
        const absNoteStart = loopOffset + note.start;
        if (
          absNoteStart >= startSec &&
          absNoteStart < startSec + durationSec
        ) {
          const relStart = absNoteStart - startSec;
          const dur = Math.min(note.duration, durationSec - relStart);
          this.scheduleLeadNote(
            ctx,
            leadSongGain,
            note.freq,
            now + relStart,
            dur,
            song.instrument
          );
        }
      }

      for (const bNote of song.bass) {
        const absBassStart = loopOffset + bNote.start;
        if (
          absBassStart >= startSec &&
          absBassStart < startSec + durationSec
        ) {
          const relStart = absBassStart - startSec;
          const dur = Math.min(bNote.duration, durationSec - relStart);
          this.scheduleBassNote(
            ctx,
            accompanimentGain,
            bNote.freq,
            now + relStart,
            dur
          );
        }
      }
    }

    const beatInterval = 60 / (song.bpm || 120);
    for (let t = 0; t < durationSec - 0.05; t += beatInterval / 2) {
      const stepIndex = Math.round(t / (beatInterval / 2));
      if (stepIndex % 2 === 0) {
        this.scheduleKick(ctx, accompanimentGain, now + t);
      } else {
        this.scheduleHiHat(ctx, accompanimentGain, now + t);
      }
    }

    const startPerf = performance.now();
    const targetEndSec = startSec + durationSec;
    const tick = () => {
      const elapsed = Math.min(
        durationSec,
        (performance.now() - startPerf) / 1000
      );
      const currentPos = startSec + elapsed;
      const bars = this.generateAnimatedSpectrum(currentPos, song.bpm);
      onProgress?.(currentPos, bars);

      if (elapsed < durationSec) {
        this.progressRafId = window.requestAnimationFrame(tick);
      }
    };
    this.progressRafId = window.requestAnimationFrame(tick);

    this.stopTimerId = window.setTimeout(() => {
      this.stopSongPlayback();
      onProgress?.(targetEndSec, new Array(24).fill(0.08));
      onComplete?.();
    }, durationSec * 1000);
  }

  private scheduleLeadNote(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    instrument: SynthInstrument
  ): void {
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const noteGain = ctx.createGain();

    if (instrument === "brass") {
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      osc2.detune.setValueAtTime(8, startTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900, startTime);
      filter.frequency.exponentialRampToValueAtTime(2600, startTime + 0.08);
    } else if (instrument === "electric_piano") {
      osc1.type = "triangle";
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, startTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2200, startTime);
    } else if (instrument === "pluck_guitar") {
      osc1.type = "sawtooth";
      osc2.type = "triangle";
      osc2.detune.setValueAtTime(-5, startTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2800, startTime);
      filter.frequency.exponentialRampToValueAtTime(750, startTime + duration);
    } else {
      osc1.type = "sawtooth";
      osc2.type = "square";
      osc2.detune.setValueAtTime(6, startTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2400, startTime);
    }

    osc1.frequency.setValueAtTime(freq, startTime);
    if (instrument !== "electric_piano") {
      osc2.frequency.setValueAtTime(freq, startTime);
    }

    noteGain.gain.setValueAtTime(0.001, startTime);
    noteGain.gain.linearRampToValueAtTime(0.32, startTime + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(
      0.16,
      startTime + Math.max(0.04, duration * 0.65)
    );
    noteGain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(dest);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + duration + 0.02);
    osc2.stop(startTime + duration + 0.02);

    this.activeOscillators.push(osc1, osc2);
    this.activeGains.push(noteGain);
  }

  private scheduleBassNote(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startTime: number,
    duration: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, startTime);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(450, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.36, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);

    this.activeOscillators.push(osc);
    this.activeGains.push(gain);
  }

  private scheduleKick(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(125, startTime);
    osc.frequency.exponentialRampToValueAtTime(42, startTime + 0.11);

    gain.gain.setValueAtTime(0.4, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.13);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + 0.14);

    this.activeOscillators.push(osc);
    this.activeGains.push(gain);
  }

  private scheduleHiHat(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(6400, startTime);

    filter.type = "highpass";
    filter.frequency.setValueAtTime(5200, startTime);

    gain.gain.setValueAtTime(0.05, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + 0.05);

    this.activeOscillators.push(osc);
    this.activeGains.push(gain);
  }

  private generateAnimatedSpectrum(elapsedSec: number, bpm: number): number[] {
    const bars = 24;
    const result: number[] = [];
    const beatPhase = elapsedSec * (bpm / 60) * Math.PI * 2;
    for (let i = 0; i < bars; i++) {
      const wave1 = Math.sin(beatPhase + i * 0.45) * 0.35 + 0.45;
      const wave2 = Math.cos(elapsedSec * 9.5 - i * 0.7) * 0.22;
      const centerBoost = 1 - Math.abs(i - bars / 2) / (bars * 0.85);
      const val = Math.max(0.12, Math.min(1, (wave1 + wave2) * centerBoost));
      result.push(val);
    }
    return result;
  }

  /**
   * 1. צליל הצלחה (Bright celebratory correct answer chime)
   */
  public playSuccessSound(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const notes = [
      { freq: 523.25, start: 0.0, dur: 0.13 }, // C5
      { freq: 659.25, start: 0.1, dur: 0.13 }, // E5
      { freq: 783.99, start: 0.2, dur: 0.15 }, // G5
      { freq: 1046.5, start: 0.32, dur: 0.42 }, // C6
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const oscHarm = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      oscHarm.type = "sine";
      oscHarm.frequency.setValueAtTime(n.freq * 2, now + n.start);

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.linearRampToValueAtTime(0.28, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

      osc.connect(gain);
      oscHarm.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.start);
      oscHarm.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.02);
      oscHarm.stop(now + n.start + n.dur + 0.02);
    }
  }

  /**
   * 2. צליל כישלון צורם (Harsh, jarring wrong-answer game-show buzzer)
   */
  public playFailureSound(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const bursts = [
      { start: 0.0, dur: 0.22, baseFreqs: [146.83, 155.56, 207.65] },
      { start: 0.25, dur: 0.45, baseFreqs: [110.0, 116.54, 155.56] },
    ];

    for (const b of bursts) {
      const masterGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1350, now + b.start);
      filter.Q.setValueAtTime(4.5, now + b.start);

      masterGain.gain.setValueAtTime(0.001, now + b.start);
      masterGain.gain.linearRampToValueAtTime(0.34, now + b.start + 0.015);
      masterGain.gain.setValueAtTime(0.32, now + b.start + b.dur * 0.75);
      masterGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + b.start + b.dur
      );

      filter.connect(masterGain);
      masterGain.connect(ctx.destination);

      b.baseFreqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx % 2 === 0 ? "sawtooth" : "square";
        osc.frequency.setValueAtTime(f, now + b.start);
        osc.frequency.linearRampToValueAtTime(
          f * 0.92,
          now + b.start + b.dur
        );
        osc.connect(filter);
        osc.start(now + b.start);
        osc.stop(now + b.start + b.dur + 0.02);
      });
    }
  }

  /**
   * 3. צליל ניצחון לזוכה (Grand Championship Victory Fanfare)
   */
  public playVictorySound(): void {
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const fanfareNotes = [
      { freq: 392.0, start: 0.0, dur: 0.16 }, // G4
      { freq: 523.25, start: 0.18, dur: 0.16 }, // C5
      { freq: 659.25, start: 0.36, dur: 0.16 }, // E5
      { freq: 783.99, start: 0.54, dur: 0.34 }, // G5
      { freq: 659.25, start: 0.92, dur: 0.18 }, // E5
      { freq: 1046.5, start: 1.14, dur: 0.95 }, // C6 grand finale hold
    ];

    for (const n of fanfareNotes) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc1.type = "sawtooth";
      osc2.type = "triangle";
      osc1.frequency.setValueAtTime(n.freq, now + n.start);
      osc2.frequency.setValueAtTime(n.freq, now + n.start);
      osc2.detune.setValueAtTime(7, now + n.start);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2800, now + n.start);

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.linearRampToValueAtTime(0.28, now + n.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now + n.start);
      osc2.start(now + n.start);
      osc1.stop(now + n.start + n.dur + 0.03);
      osc2.stop(now + n.start + n.dur + 0.03);
    }

    const chordFreqs = [261.63, 329.63, 392.0, 523.25];
    for (const cf of chordFreqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(cf, now + 1.14);

      gain.gain.setValueAtTime(0.001, now + 1.14);
      gain.gain.linearRampToValueAtTime(0.14, now + 1.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + 1.14);
      osc.stop(now + 2.25);
    }
  }
}

export const soundEngine = new SoundEngine();
