import { z } from "zod";

export const SpotifyAuthDBSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expires: z.coerce.date(), // Store as timestamp

  clientId: z.string(),
  clientSecret: z.string(),
});

export type SpotifyAuthDB = z.infer<typeof SpotifyAuthDBSchema>;


