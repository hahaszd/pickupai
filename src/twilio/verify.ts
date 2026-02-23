import twilio from "twilio";
import type { Request, Response, NextFunction } from "express";

type RequestWithRawBody = Request & { rawBody?: string };

export function twilioValidateMiddleware(opts: {
  authToken: string;
  enabled: boolean;
  publicBaseUrl: string;
}) {
  return (req: RequestWithRawBody, res: Response, next: NextFunction) => {
    if (!opts.enabled) return next();

    const signature = req.header("X-Twilio-Signature");
    if (!signature) return res.status(401).send("Missing Twilio signature");

    const url = new URL(req.originalUrl, opts.publicBaseUrl).toString();
    const params = (req.body ?? {}) as Record<string, string>;
    const rawBody = req.rawBody;

    const ok = rawBody
      ? twilio.validateRequestWithBody(opts.authToken, signature, url, rawBody)
      : twilio.validateRequest(opts.authToken, signature, url, params);

    if (!ok) return res.status(401).send("Invalid Twilio signature");
    return next();
  };
}

