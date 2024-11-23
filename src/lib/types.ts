import { LocalAudioTrack, LocalVideoTrack } from "livekit-client";
import { Room } from "@prisma/client";

export interface SessionProps {
  roomName: string;
  identity: string;
  audioTrack?: LocalAudioTrack;
  videoTrack?: LocalVideoTrack;
  region?: string;
  turnServer?: RTCIceServer;
  forceRelay?: boolean;
}

export interface TokenResult {
  room: Room;
  token: string;
}
