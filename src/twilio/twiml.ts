import twilio from "twilio";

export function newVoiceResponse() {
  return new twilio.twiml.VoiceResponse();
}

export function sayFriendly(vr: { say: (...args: any[]) => any }, text: string) {
  vr.say({ voice: "Polly.Amy" }, text);
}

/** Returns TwiML that connects the call to a bidirectional media stream. */
export function connectStreamTwiml(wsUrl: string, callSid: string, streamToken?: string): string {
  const vr = newVoiceResponse();
  // Brief pause so Twilio has time to set up the media stream before speaking.
  vr.pause({ length: 1 });
  const connect = vr.connect();
  const stream = connect.stream({ url: wsUrl });
  stream.parameter({ name: "callSid", value: callSid });
  if (streamToken) stream.parameter({ name: "streamToken", value: streamToken });
  return vr.toString();
}

/**
 * Fallback TwiML used when the AI system is unavailable (OpenAI down, no API key, etc.).
 * Plays a friendly voicemail message and records up to 3 minutes.
 * The recording webhook posts to /twilio/voice/recording.
 */
export function voicemailFallbackTwiml(businessName: string, recordingCallbackUrl: string): string {
  const vr = newVoiceResponse();
  vr.pause({ length: 1 });
  vr.say(
    { voice: "Polly.Amy" },
    `G'day, thanks for calling ${businessName}! Sorry we missed your call. ` +
    `Please leave your name, number, and a quick message after the tone, and we'll get back to you as soon as we can. Cheers!`
  );
  vr.record({
    maxLength: 180,
    playBeep: true,
    transcribe: false,
    action: recordingCallbackUrl,
    recordingStatusCallback: recordingCallbackUrl,
    recordingStatusCallbackMethod: "POST"
  });
  vr.say({ voice: "Polly.Amy" }, "Thanks for that — we'll be in touch. Have a good one!");
  vr.hangup();
  return vr.toString();
}

