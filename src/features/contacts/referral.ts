import type { ColorToken, ReferralStatus } from "../../domain/types";

/** Pipeline order: the table sorts by this index, and the editor lists options in it. */
export const REFERRAL_STATUSES: { id: ReferralStatus; label: string; color: ColorToken }[] = [
  { id: "not_asked", label: "Not asked", color: "gray" },
  { id: "asked", label: "Asked", color: "amber" },
  { id: "agreed", label: "Agreed", color: "blue" },
  { id: "submitted", label: "Submitted", color: "green" },
  { id: "declined", label: "Declined", color: "gray" },
];

export const referralEntry = (status: ReferralStatus | undefined) =>
  REFERRAL_STATUSES.find((s) => s.id === (status ?? "not_asked")) ?? REFERRAL_STATUSES[0];

export const referralRank = (status: ReferralStatus | undefined) =>
  REFERRAL_STATUSES.indexOf(referralEntry(status));
