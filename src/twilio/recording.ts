import { twilioClient } from "./client.js";
import { buildAbsoluteUrl } from "./flow.js";

export async function startCallRecording(callSid: string) {
  // Fire-and-forget friendly; caller path should not block TwiML.
  await twilioClient.calls(callSid).recordings.create({
    recordingChannels: "dual",
    recordingStatusCallback: buildAbsoluteUrl("/twilio/voice/recording"),
    recordingStatusCallbackMethod: "POST"
  });
}

