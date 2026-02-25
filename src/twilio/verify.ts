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
    // Twilio voice/SMS webhooks are form-encoded POST requests.
    // validateRequest (sorted-params HMAC-SHA1) is the correct method for these.
    // validateRequestWithBody is only for JSON or other non-form-encoded payloads.
    const params = (req.body ?? {}) as Record<string, string>;
    const ok = twilio.validateRequest(opts.authToken, signature, url, params);

    if (!ok) return res.status(403).send("Invalid Twilio signature");
    return next();
  };
}

