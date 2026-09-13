import type { Answer, Application } from "./types";

export interface AnswerFilter {
  text: string;
  kindId: string;
  themeId: string;
  language: string;
}

export function filterAnswers(answers: Answer[], f: AnswerFilter): Answer[] {
  const needle = f.text.trim().toLowerCase();
  return answers.filter((a) => {
    if (f.kindId && a.kindId !== f.kindId) return false;
    if (f.themeId && !a.themeIds.includes(f.themeId)) return false;
    if (f.language && a.language !== f.language) return false;
    if (needle) {
      const hay = `${a.title} ${a.question ?? ""} ${a.body} ${a.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function answerUsage(answerId: string, apps: Application[]): Application[] {
  return apps.filter((a) => a.answerIds.includes(answerId));
}
