import twilio from "twilio";

export function newVoiceResponse() {
  return new twilio.twiml.VoiceResponse();
}

export function sayFriendly(vr: { say: (...args: any[]) => any }, text: string) {
  vr.say({ voice: "Polly.Amy" }, text);
}

/** Returns TwiML that connects the call to a bidirectional media stream. */
export function connectStreamTwiml(wsUrl: string, callSid: string): string {
  const vr = newVoiceResponse();
  // Brief pause so Twilio has time to set up the media stream before speaking.
  vr.pause({ length: 1 });
  const connect = vr.connect();
  const stream = connect.stream({ url: wsUrl });
  stream.parameter({ name: "callSid", value: callSid });
  return vr.toString();
}

