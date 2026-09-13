import { describe, it, expect } from "vitest";
import { buildAnswer, buildApplication } from "../../src/domain/factories";
import { answerUsage, filterAnswers } from "../../src/domain/answers";

const NOW = "2026-09-11T00:00:00.000Z";
const answers = [
  buildAnswer({ kindId: "answer", title: "Why Shopify", body: "Commerce at scale", themeIds: ["why-company"], language: "en" }, "an_1", NOW),
  buildAnswer({ kindId: "star", title: "Outage story", body: "We lost the primary DB", themeIds: ["failure", "leadership"], language: "en", tags: ["infra"] }, "an_2", NOW),
  buildAnswer({ kindId: "answer", title: "지원동기", body: "성장 가능성", themeIds: ["motivation-ko"], language: "ko" }, "an_3", NOW),
];
const apps = [buildApplication({ companyId: "co", title: "A", countryId: "CA", channelId: "linkedin", statusId: "saved", answerIds: ["an_1", "an_2"] }, "app_1", NOW)];

describe("answers domain", () => {
  it("filters by text across title, question, body and tags; by kind, theme and language", () => {
    const f = { text: "", kindId: "", themeId: "", language: "" };
    expect(filterAnswers(answers, { ...f, text: "db" }).map((a) => a.id)).toEqual(["an_2"]);
    expect(filterAnswers(answers, { ...f, text: "infra" }).map((a) => a.id)).toEqual(["an_2"]);
    expect(filterAnswers(answers, { ...f, kindId: "answer" }).map((a) => a.id)).toEqual(["an_1", "an_3"]);
    expect(filterAnswers(answers, { ...f, themeId: "leadership" }).map((a) => a.id)).toEqual(["an_2"]);
    expect(filterAnswers(answers, { ...f, language: "ko" }).map((a) => a.id)).toEqual(["an_3"]);
    expect(filterAnswers(answers, { ...f, text: "성장" }).map((a) => a.id)).toEqual(["an_3"]);
  });
  it("reports which applications use an answer", () => {
    expect(answerUsage("an_1", apps).map((a) => a.id)).toEqual(["app_1"]);
    expect(answerUsage("an_3", apps)).toEqual([]);
  });
});
