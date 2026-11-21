import type { RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors/app-error.js";
import { AuthService, type RegisterInput } from "../auth/auth.service.js";
import { loginSchema, registerSchema } from "../auth/auth.validation.js";

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new AppError("Request body is invalid", 400, "VALIDATION_ERROR");
    }
    throw error;
  }
}

export class AuthController {
  constructor(private readonly auth: AuthService) {}

  register: RequestHandler = async (req, res) => {
    const input = parseBody<RegisterInput>(registerSchema, req.body);
    const user = await this.auth.register(input);
    res.status(201).json({ success: true, data: { user } });
  };

  login: RequestHandler = async (req, res) => {
    const input = parseBody(loginSchema, req.body);
    const session = await this.auth.login(input.email, input.password);
    res.status(200).json({ success: true, data: session });
  };

  logout: RequestHandler = async (req, res) => {
    if (!req.auth) {
      throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
    }
    await this.auth.logout(req.auth);
    res.status(204).end();
  };
}
