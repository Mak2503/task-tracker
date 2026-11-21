import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export type AuthenticatedPrincipal = {
  userId: string;
  tokenId: string;
  expiresAt: Date;
};

export type IssuedAccessToken = {
  token: string;
  principal: AuthenticatedPrincipal;
};

export class TokenService {
  private readonly issuer = "taskmaster-api";
  private readonly audience = "taskmaster-api";

  constructor(
    private readonly secret = env.JWT_SECRET,
    private readonly ttlSeconds = env.JWT_ACCESS_TOKEN_TTL_SECONDS,
  ) {}

  assertConfiguration(): void {
    if (Buffer.byteLength(this.secret, "utf8") < 32) {
      throw new Error("JWT_SECRET must be configured with at least 32 bytes");
    }
  }

  async issue(userId: string): Promise<IssuedAccessToken> {
    this.assertConfiguration();
    const tokenId = randomUUID();
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((issuedAt + this.ttlSeconds) * 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(userId)
      .setJti(tokenId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(this.key());

    return { token, principal: { userId, tokenId, expiresAt } };
  }

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.key(), {
        algorithms: ["HS256"],
        issuer: this.issuer,
        audience: this.audience,
      });
      if (!payload.sub || !payload.jti || !payload.exp) {
        throw new Error("Required JWT claims are missing");
      }

      return {
        userId: payload.sub,
        tokenId: payload.jti,
        expiresAt: new Date(payload.exp * 1000),
      };
    } catch {
      throw new AppError("The access token is invalid or expired", 401, "INVALID_TOKEN");
    }
  }

  private key(): Uint8Array {
    this.assertConfiguration();
    return new TextEncoder().encode(this.secret);
  }
}
