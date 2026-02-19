import { jwtVerify, SignJWT } from "jose";
import { getRequiredEnv } from "@/server/config/env";

export type SessionToken = {
  userId: string;
  organizationId: string;
  role: "ADMIN" | "USER" | "APPROVER" | "REVIEWER" | "VIEWER" | "AUTHOR" | "ENGINEER";
  email: string;
};

const secret = new TextEncoder().encode(getRequiredEnv().JWT_SECRET);

export const signSessionToken = async (payload: SessionToken) => {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret);
};

export const verifySessionToken = async (token: string) => {
  const verified = await jwtVerify(token, secret);
  return verified.payload as SessionToken;
};
