import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import { AuthService } from "../auth/auth.service.js";

export class AuthenticationMiddleware {
  constructor(private readonly auth: AuthService) {}

  authenticate: RequestHandler = async (req, _res, next) => {
    const authorization = req.get("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) {
      next(new AppError("A bearer access token is required", 401, "UNAUTHENTICATED"));
      return;
    }

    try {
      req.auth = await this.auth.authenticate(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}
