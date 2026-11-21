import type { AuthenticatedPrincipal } from "../auth/token.service.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedPrincipal;
    }
  }
}

export {};
