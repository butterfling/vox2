import { createNextApiHandler } from "@trpc/server/adapters/next";
import { TRPCError } from "@trpc/server";

import { env } from "@/env.mjs";
import { createTRPCContext } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext: createTRPCContext,
  onError: ({ path, error, type, req }) => {
    // Log the detailed error information
    console.error('tRPC Error Details:');
    console.error(`Path: ${path}`);
    console.error(`Error Type: ${type}`);
    console.error(`Error Message: ${error.message}`);
    console.error(`Error Stack: ${error.stack}`);
    console.error(`Request URL: ${req?.url}`);
    console.error(`Request Method: ${req?.method}`);
    console.error(`Request Headers:`, req?.headers);

    // If this is a database error, provide a more user-friendly message
    if (error.message.includes('prisma')) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database operation failed',
        cause: error,
      });
    }

    // If this is a LiveKit error, provide a specific message
    if (error.message.includes('LiveKit')) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Video room creation failed',
        cause: error,
      });
    }

    // For authentication errors
    if (error.message.includes('authenticated')) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in',
        cause: error,
      });
    }
  },
});
