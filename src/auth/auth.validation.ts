import { z } from "zod";

const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());
const passwordSchema = z.string().min(12).refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
  message: "Password must be no more than 72 UTF-8 bytes",
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, "utf8") <= 72),
}).strict();

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
}).strict();
