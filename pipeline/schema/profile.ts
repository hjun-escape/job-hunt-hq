// Hand-written company profile schema. Strict everywhere so unknown fields fail.
import { z } from "zod";

// Lower-case hostname: labels of a-z, 0-9 and inner hyphens, at least one dot.
const HOSTNAME = /^(?!-)[a-z0-9-]+(?<!-)(\.(?!-)[a-z0-9-]+(?<!-))+$/;

const httpsUrl = z.url({ protocol: /^https$/ });

export const SourceRef = z.strictObject({ url: httpsUrl, seen: z.iso.date() });
export type SourceRef = z.infer<typeof SourceRef>;

/** One summary, at most 280 characters per language, counted separately. The limit counts UTF-16 code units (an emoji counts as 2). */
export const Text280 = z.strictObject({
  en: z.string().min(1).max(280),
  ko: z.string().min(1).max(280).optional(),
});
export type Text280 = z.infer<typeof Text280>;

/** A claim with provenance: where it came from, whether the source is official, and when it was last checked. */
export const Fact = <V extends z.ZodType>(value: V) =>
  z.strictObject({
    value,
    kind: z.enum(["official", "reported"]),
    sources: z.array(SourceRef).min(1),
    checked: z.iso.date(),
  });

export const ProfileSchema = z.strictObject({
  id: z.string().regex(HOSTNAME, "id must be a lower-case hostname such as stripe.com"),
  name: z.string().min(1),
  otherNames: z.array(z.string().min(1)).optional(),
  countries: z.array(z.enum(["US", "CA", "KR"])).min(1),
  officialHosts: z.array(z.string().min(1)).optional(),
  wikidata: z.string().regex(/^Q\d+$/).optional(),
  dartCorpCode: z.string().regex(/^\d{8}$/).optional(),
  entities: z.strictObject({
    usFeins: z.array(z.string().regex(/^\d{9}$/)).optional(),
    usNames: z.array(z.string().min(1)).optional(),
    caNames: z
      .array(z.strictObject({ name: z.string().min(1), province: z.string().regex(/^[A-Z]{2}$/) }))
      .optional(),
  }),
  basics: z
    .strictObject({
      industry: Fact(z.string().min(1)).optional(),
      size: Fact(z.string().min(1)).optional(),
      hq: Fact(z.string().min(1)).optional(),
    })
    .optional(),
  mission: Fact(Text280).optional(),
  values: Fact(z.strictObject({ names: z.array(z.string().min(1)), summary: Text280 })).optional(),
  applicationRules: z.array(Fact(Text280)).optional(),
  hiringProcess: Fact(Text280).optional(),
  reapplyWait: z
    .array(Fact(z.strictObject({ after: z.enum(["resume", "phone", "onsite", "any"]), wait: Text280 })))
    .optional(),
  links: z.array(z.strictObject({ label: z.string().min(1), url: httpsUrl })).optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export function profileJsonSchema(): object {
  return z.toJSONSchema(ProfileSchema);
}
