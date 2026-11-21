import type { RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import { AuthService } from "../auth/auth.service.js";
import { updateProfileSchema } from "../auth/auth.validation.js";

export class ProfileController {
  constructor(private readonly auth: AuthService) {}

  get: RequestHandler = async (req, res) => {
    if (!req.auth) {
      throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
    }
    const user = await this.auth.getProfile(req.auth.userId);
    res.status(200).json({ success: true, data: { user } });
  };

  update: RequestHandler = async (req, res) => {
    if (!req.auth) {
      throw new AppError("Authentication is required", 401, "UNAUTHENTICATED");
    }

    let input: { displayName: string };
    try {
      input = updateProfileSchema.parse(req.body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError("Request body is invalid", 400, "VALIDATION_ERROR");
      }
      throw error;
    }

    const user = await this.auth.updateProfile(req.auth.userId, input.displayName);
    res.status(200).json({ success: true, data: { user } });
  };
}
