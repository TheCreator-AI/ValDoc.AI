import { hash } from "bcryptjs";

export const hashPassword = async (password: string) => {
  return await hash(password, 10);
};

