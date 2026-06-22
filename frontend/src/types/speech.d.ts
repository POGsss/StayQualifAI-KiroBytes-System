/**
 * Ambient declarations for the Web Speech API's recognition half.
 *
 * The standard TypeScript DOM lib ships the synthesis types
 * (`SpeechSynthesisUtterance`, `SpeechSynthesisErrorEvent`, …) and the result
 * types (`SpeechRecognitionResult`, `SpeechRecognitionAlternative`, …) but does
 * NOT declare `SpeechRecognition`, `SpeechRecognitionEvent`, or
 * `SpeechRecognitionErrorEvent` because recognition was never standardised in
 * lib.dom.d.ts. Chrome/Edge expose them (often prefixed as
 * `webkitSpeechRecognition`). These minimal declarations let the
 * `useSpeechRecognition` hook type-check against the real browser API.
 */

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;

  onaudiostart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onsoundstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onstart: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onend: ((this: SpeechRecognition, ev: Event) => unknown) | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown)
    | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown)
    | null;

  start(): void;
  stop(): void;
  abort(): void;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
