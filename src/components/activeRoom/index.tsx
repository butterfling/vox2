import { DebugMode } from "@/lib/Debug";
import { api } from "@/utils/api";
import speakOut from "@/utils/speakOut";
import {
  LiveKitRoom,
  LocalUserChoices,
  VideoConference,
  formatChatMessageLinks,
} from "@livekit/components-react";
import { setCORS } from "google-translate-api-browser";

const translate = setCORS("https://cors-proxy.fringe.zone/");

import {
  LogLevel,
  Room,
  RoomEvent,
  RoomOptions,
  VideoPresets,
  type InternalRoomOptions,
} from "livekit-client";
import { useRouter } from "next/router";
import Pusher from "pusher-js";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Loader from "../loader";
import FullScreenLoader from "../fullScreenLoader";
type ActiveRoomProps = {
  userChoices: LocalUserChoices;
  roomName: string;
  region?: string;
  onLeave?: () => void;
  userId: string;
  selectedLanguage: string;
};

const ActiveRoom = ({
  roomName,
  userChoices,
  onLeave,
  userId,
  selectedLanguage,
}: ActiveRoomProps) => {
  const { mutate: joinRoom, data, error, isLoading } = api.rooms.joinRoom.useMutation();
  const pusherMutation = api.pusher.sendTranscript.useMutation();
  const router = useRouter();
  const isReady = router.isReady;
  const { region, hq } = router.query;

  // State declarations
  const [transcription, setTranscription] = useState("");
  const [caption, setCaption] = useState({
    sender: "",
    message: "",
  });
  const [myTranscripts, setMyTranscripts] = useState<string[]>([]);
  const [transcriptionQueue, setTranscriptionQueue] = useState<
    {
      sender: string;
      message: string;
      senderId: string;
      isFinal: boolean;
    }[]
  >([]);
  const [room, setRoom] = useState<Room | null>(null);

  // Refs
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Memoized values
  const roomOptions = useMemo((): Partial<RoomOptions> => {
    return {
      adaptiveStream: false,
      dynacast: false,
      stopMicTrackOnMute: true,
      audioCaptureDefaults: {
        deviceId: userChoices.audioDeviceId ?? undefined,
      },
      videoCaptureDefaults: {
        deviceId: userChoices.videoDeviceId ?? undefined,
      },
    };
  }, [userChoices]);

  useEffect(() => {
    if (isReady && roomName) {
      console.log('Attempting to join room:', roomName);
      joinRoom({ roomName });
    }
  }, [isReady, roomName, joinRoom]);

  useEffect(() => {
    console.log("Running transcription");
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (!MediaRecorder.isTypeSupported("audio/webm"))
        return alert("Browser not supported");
      
      mediaStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;

      const webSocketUrl =
        selectedLanguage == "en-US"
          ? "wss://api.deepgram.com/v1/listen?model=nova"
          : `wss://api.deepgram.com/v1/listen?language=${selectedLanguage}`;

      const socket = new WebSocket(webSocketUrl, [
        "token",
        process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY!,
      ]);

      socket.onopen = () => {
        console.log({ event: "onopen" });
        mediaRecorder.addEventListener("dataavailable", async (event) => {
          if (event.data.size > 0 && socket.readyState === 1 && room !== null) {
            socket.send(event.data);
          }
        });
        mediaRecorder.start(1000);
      };

      socket.onmessage = async (message) => {
        const received = message && JSON.parse(message?.data);
        const transcript = received.channel?.alternatives[0].transcript;

        if (transcript !== "" && transcript !== undefined && room !== null) {
          if (myTranscripts.includes(transcript)) return;
          await pusherMutation.mutate({
            message: transcript,
            roomName: roomName,
            isFinal: true,
          });
          setMyTranscripts((prev) => [...prev, transcript]);
          if (
            !(
              transcript.toLowerCase() === "is" ||
              transcription.toLowerCase() === "so"
            )
          )
            setTranscription(transcript);
        }
      };

      socket.onclose = () => {
        console.log({ event: "onclose" });
      };

      socket.onerror = (error) => {
        console.log({ event: "onerror", error });
      };

      socketRef.current = socket;
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, [selectedLanguage]);

  useEffect(() => {
    async function translateText() {
      console.info("transcriptionQueue", transcriptionQueue);
      if (transcriptionQueue.length > 0) {
        const res = await translate(transcriptionQueue[0]?.message as string, {
          // @ts-ignore
          to: selectedLanguage.split("-")[0],
        });
        setCaption({
          message: res.text,
          sender: transcriptionQueue[0]?.sender as string,
        });
        const isEmpty = transcriptionQueue.length === 0;
        speakOut(res.text as string, isEmpty);
        setTranscriptionQueue((prev) => prev.slice(1));
      }
    }
    translateText();

    // Hide the caption after 5 seconds
    const timer = setTimeout(() => {
      setCaption({
        message: "",
        sender: "",
      });
    }, 5000);

    return () => {
      clearTimeout(timer);
    };
  }, [transcriptionQueue]);

  useEffect(() => {
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY as string, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string,
    });
    const channel = pusher.subscribe(roomName);
    channel.bind(
      "transcribe-event",
      function (data: {
        sender: string;
        message: string;
        senderId: string;
        isFinal: boolean;
      }) {
        if (data.isFinal && userId !== data.senderId) {
          setTranscriptionQueue((prev) => {
            return [...prev, data];
          });
        }
      }
    );

    return () => {
      pusher.unsubscribe(roomName);
    };
  }, []);

  // Cleanup function for room disconnection
  const cleanup = useCallback(() => {
    if (room) {
      console.log('Cleaning up room connection');
      room.disconnect();
      setRoom(null);
    }
    // Cleanup WebSocket connection
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    // Cleanup MediaRecorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    // Cleanup MediaStream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    // Clear transcripts
    setMyTranscripts([]);
    setTranscriptionQueue([]);
    setTranscription("");
    setCaption({ sender: "", message: "" });
  }, [room]);

  // Handle component unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Handle loading and error states
  if (isLoading || !isReady || !roomName) {
    return <FullScreenLoader />;
  }

  if (error) {
    console.error('Error joining room:', error);
    router.push('/');
    return <FullScreenLoader />;
  }

  if (!data?.token) {
    return <FullScreenLoader />;
  }

  return (
    <>
      <LiveKitRoom
        token={data.token}
        serverUrl={process.env.LIVEKIT_WS_URL || `wss://${process.env.NEXT_PUBLIC_LIVEKIT_API_HOST}`}
        options={roomOptions}
        video={userChoices.videoEnabled}
        audio={userChoices.audioEnabled}
        onConnected={(room) => {
          if (!room) return;
          console.log('Connected to LiveKit room:', room.name);
          setRoom(room);
          
          room.on(RoomEvent.Disconnected, () => {
            console.log('Room disconnected');
            cleanup();
            if (onLeave) onLeave();
          });
        }}
        onDisconnected={cleanup}
      >
        <VideoConference />
      </LiveKitRoom>
    </>
  );
};

export default ActiveRoom;
