import { z } from "zod";

export const TwitchAuthDBSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expires: z.coerce.date(), // Store as timestamp

  clientId: z.string(),
  clientSecret: z.string(),
});

export type TwitchAuthDB = z.infer<typeof TwitchAuthDBSchema>;




export const TwitchUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  display_name: z.string(),
  type: z.string(),
  broadcaster_type: z.string(),
  description: z.string(),
  profile_image_url: z.string(),
  offline_image_url: z.string(),
  view_count: z.number(),
  email: z.string().optional(),
  created_at: z.coerce.date(),
});

export type TwitchUser = z.infer<typeof TwitchUserSchema>;