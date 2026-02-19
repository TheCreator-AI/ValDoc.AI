import { ApiError } from "@/server/api/http";

const defaultSystemOwnerEmail = "aphvaldoc@gmail.com";

export const isSystemOwnerEmail = (email: string) => {
  const configured = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase();
  const allowed = configured || defaultSystemOwnerEmail;
  return email.trim().toLowerCase() === allowed;
};

export const assertSystemOwnerOrThrow = (email: string) => {
  if (!isSystemOwnerEmail(email)) {
    throw new ApiError(403, "Only the system owner can manage organizations.");
  }
};
