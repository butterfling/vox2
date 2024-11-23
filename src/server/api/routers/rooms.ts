import { z } from "zod";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import type { AccessTokenOptions, VideoGrant } from "livekit-server-sdk";

const createToken = (userInfo: AccessTokenOptions, grant: VideoGrant) => {
  const at = new AccessToken(apiKey, apiSecret, userInfo);
  at.ttl = "24h"; // Increase token TTL
  at.addGrant(grant);
  return at.toJwt();
};

const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const apiHost = process.env.NEXT_PUBLIC_LIVEKIT_API_HOST as string;
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TokenResult } from "@/lib/types";

// Initialize LiveKit client with proper URL format
const roomClient = new RoomServiceClient(
  apiHost.startsWith('http') ? apiHost : `https://${apiHost}`,
  apiKey,
  apiSecret,
);

export const roomsRouter = createTRPCRouter({
  joinRoom: protectedProcedure
    .input(
      z.object({
        roomName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        console.log('Joining room:', input.roomName);
        
        if (!ctx.session?.user?.id) {
          throw new Error('User not authenticated');
        }

        // Check if room exists
        const room = await ctx.prisma.room.findUnique({
          where: { name: input.roomName },
          include: {
            Participant: true,
          },
        });

        if (!room) {
          console.error('Room not found:', input.roomName);
          throw new Error('Room not found');
        }

        // Add user as participant if not already
        const isParticipant = room.Participant.some(p => p.UserId === ctx.session.user.id);
        if (!isParticipant) {
          await ctx.prisma.participant.create({
            data: {
              UserId: ctx.session.user.id,
              RoomName: input.roomName,
            },
          });
        }

        // Generate token for LiveKit
        const grant: VideoGrant = {
          room: input.roomName,
          roomJoin: true,
          canPublish: true,
          canPublishData: true,
          canSubscribe: true,
        };

        const token = createToken(
          { 
            identity: ctx.session.user.id,
            name: ctx.session.user.name as string 
          },
          grant
        );

        return {
          room,
          token,
        } as TokenResult;
      } catch (error) {
        console.error('Error joining room:', error);
        throw error;
      }
    }),

  createRoom: protectedProcedure
    .input(
      z.object({
        roomName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Verify environment variables
        if (!apiKey || !apiSecret || !apiHost) {
          console.error('Missing LiveKit configuration:', { apiKey, apiSecret, apiHost });
          throw new Error('LiveKit configuration is missing');
        }

        // Verify user session
        if (!ctx.session?.user?.id) {
          console.error('User session not found');
          throw new Error('User not authenticated');
        }

        const identity = ctx.session.user.id;
        const name = ctx.session.user.name ?? identity;

        // Check if room already exists
        const existingRoom = await ctx.prisma.room.findUnique({
          where: { name: input.roomName },
        });

        if (existingRoom) {
          console.error('Room already exists:', input.roomName);
          throw new Error('Room already exists');
        }

        console.log('Creating room in database...', { roomName: input.roomName, userId: identity });
        
        // Create room in database
        const room = await ctx.prisma.room.create({
          data: {
            name: input.roomName,
            OwnerId: ctx.session.user.id,
            metadata: JSON.stringify({
              createdAt: new Date().toISOString(),
              createdBy: name,
            }),
            // Create the owner as a participant automatically
            Participant: {
              create: {
                UserId: ctx.session.user.id,
              },
            },
          },
          include: {
            Participant: true,
          },
        });

        console.log('Room created in database:', room);

        // Create room in LiveKit
        console.log('Creating room in LiveKit...', { roomName: room.name });
        try {
          await roomClient.createRoom({
            name: room.name,
            metadata: JSON.stringify({
              createdAt: new Date().toISOString(),
              createdBy: name,
            }),
          });
          console.log('Room created in LiveKit');
        } catch (error) {
          console.error('LiveKit error:', error);
          // Clean up the database entry if LiveKit fails
          await ctx.prisma.room.delete({
            where: { name: room.name },
          });
          throw new Error('Failed to create room in LiveKit');
        }

        // Generate token
        console.log('Generating token...');
        const grant: VideoGrant = {
          room: room.name,
          roomJoin: true,
          canPublish: true,
          canPublishData: true,
          canSubscribe: true,
        };

        const token = createToken({ identity, name: name as string }, grant);
        
        const result = {
          room,
          token,
        };
        
        console.log('Room creation completed successfully');
        return result;
      } catch (error) {
        console.error('Error in createRoom:', error);
        throw error;
      }
    }),

  getRoomsByUser: protectedProcedure.query(async ({ ctx }) => {
    const rooms = await ctx.prisma.room.findMany({
      where: {
        OR: [
          {
            Owner: {
              id: ctx.session.user.id,
            },
          },
          {
            Participant: {
              some: {
                UserId: ctx.session.user.id,
              },
            },
          },
        ],
      },
    });

    return rooms;
  }),
});
