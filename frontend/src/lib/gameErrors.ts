import axios from "axios";

/**
 * The backend's machine-readable marker for "this subject has no questions in
 * the bank yet" — `GET /games/{id}/questions/` answers 503 with
 * `{detail, code: "no_questions_for_subject", subject}`.
 *
 * Distinguishing it from a real failure matters: a student whose subject simply
 * isn't stocked should be told that (and not be left retrying a request that
 * will never succeed), while a network blip should still offer a retry.
 */
const NO_QUESTIONS_CODE = "no_questions_for_subject";

export const NO_QUESTIONS_TITLE = "Bu fan uchun savollar hali yo'q";
export const NO_QUESTIONS_HINT = `O'yinni o'ynash uchun avval bu fandan savollar qo'shilishi kerak. O'qituvchi yoki direktor savollar qo'shgach, o'yin shu fan bilan ishlaydi.`;

/** Whether an axios error is the "subject has no questions" empty state. */
export function isNoQuestionsError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const data = error.response?.data as { code?: string } | undefined;
  return data?.code === NO_QUESTIONS_CODE;
}
