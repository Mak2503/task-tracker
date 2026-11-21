import type { RequestHandler } from "express";
import { DatabaseService } from "../database/database.service.js";

export class DatabaseHealthController {
  constructor(private readonly database: DatabaseService) {}

  check: RequestHandler = async (_req, res) => {
    const ready = await this.database.isReady();
    res.status(ready ? 200 : 503).json({
      success: ready,
      status: ready ? "ready" : "unavailable",
      database: ready ? "connected" : "disconnected",
    });
  };
}
