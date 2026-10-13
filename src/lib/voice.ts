import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceNote {
  transcript: string;
  listening: boolean;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((ev: {
        results: {
          length: number;
          [i: number]: { [j: number]: { transcript: string } } | undefined;
        };
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return ctor ?? null;
}

export function voiceNoteSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export function useVoiceNote(maxSec = 10): VoiceNote {
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => voiceNoteSupported());

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    try {
      recRef.current?.stop();
    } catch {
      void 0;
    }
    setListening(false);
  }, [clearTimer]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i += 1) {
        const alt = ev.results[i]?.[0];
        if (alt?.transcript) parts.push(alt.transcript);
      }
      setTranscript(parts.join(' ').trim());
    };
    rec.onend = () => {
      clearTimer();
      setListening(false);
    };
    rec.onerror = () => {
      clearTimer();
      setListening(false);
    };
    recRef.current = rec;
    setTranscript('');
    try {
      rec.start();
    } catch {
      return;
    }
    setListening(true);
    timerRef.current = window.setTimeout(() => {
      stop();
    }, maxSec * 1000);
  }, [clearTimer, maxSec, stop]);

  useEffect(
    () => () => {
      clearTimer();
      try {
        recRef.current?.stop();
      } catch {
        void 0;
      }
    },
    [clearTimer],
  );

  return { transcript, listening, supported, start, stop };
}
