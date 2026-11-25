import { z } from 'zod';

/** OAuth 回呼 query（contracts/openapi.yaml `/google/oauth/callback`）；全部選填，超長即視為無效。 */
export const oauthCallbackQuery = z.object({
  state: z.string().max(200).optional(),
  code: z.string().max(2000).optional(),
  error: z.string().max(200).optional(),
  scope: z.string().max(2000).optional(),
});
