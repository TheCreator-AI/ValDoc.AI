import { hash } from "bcryptjs";

const complexityPattern = {
  uppercase: /[A-Z]/,
  lowercase: /[a-z]/,
  digit: /[0-9]/,
  special: /[^A-Za-z0-9]/
};

export const getPasswordPolicyErrors = (password: string) => {
  const errors: string[] = [];
  if (password.length < 12) {
    errors.push("Password must be at least 12 characters.");
  }
  if (!complexityPattern.uppercase.test(password)) {
    errors.push("Password must include at least one uppercase letter.");
  }
  if (!complexityPattern.lowercase.test(password)) {
    errors.push("Password must include at least one lowercase letter.");
  }
  if (!complexityPattern.digit.test(password)) {
    errors.push("Password must include at least one number.");
  }
  if (!complexityPattern.special.test(password)) {
    errors.push("Password must include at least one special character.");
  }
  if (/\s/.test(password)) {
    errors.push("Password must not contain spaces.");
  }
  return errors;
};

export const hashPassword = async (password: string) => {
  return await hash(password, 10);
};
