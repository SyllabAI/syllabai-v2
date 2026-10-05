/**
 * Answer-input module barrel (T-MIG-034) — the transcription validation
 * shell + the dormant provider seam. The LLM-chain lane binds the real
 * provider; until then the surface answers 503 transcription_unavailable
 * on every VALIDATED request (frozen chain-exhausted parity).
 */
import { AnswerInputTranscriptionService, type TranscriptionProvider } from "./service";

export {
  AnswerInputTranscriptionService,
  isStandardBase64,
  MAX_DECODED_BYTES,
  TRANSCRIPTION_SYSTEM_PROMPT,
} from "./service";
export type {
  Transcription,
  TranscriptionProvider,
  TranscriptionProviderRequest,
  TranscriptionProviderResponse,
  TranscriptionMedia,
  AnswerInputComponents,
} from "./service";
export {
  TranscriptionBadRequestError,
  TranscriptionImageTooLargeError,
  TranscriptionNothingReadableError,
  TranscriptionUnavailableError,
} from "./service";

export const buildAnswerInputModule = buildAnswerInputComponents;

export function buildAnswerInputComponents(
  provider: TranscriptionProvider | null = null,
): { transcription: AnswerInputTranscriptionService } {
  return { transcription: new AnswerInputTranscriptionService(provider) };
}
