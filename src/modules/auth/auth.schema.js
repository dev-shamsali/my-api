import { z } from "@rheajs/core";
import { isCommonPassword } from "@rheajs/auth";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

const registerSchema = z.object({
  email,
  // At least 12 characters. Length matters more than symbols. Hashing allows up to 128.
  password: z
    .string()
    .min(12, "must be at least 12 characters")
    .max(128)
    .refine((p) => !isCommonPassword(p), "is too common. Choose a longer, less guessable password"),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

/** Body mode: the client sends the refresh token it was given. In cookie mode the body is ignored and the cookie is used. */
const refreshSchema = z.object({
  refreshToken: z.string().length(43),
});

export { registerSchema, loginSchema, refreshSchema };
