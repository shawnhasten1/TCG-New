// Secrets aren't in wrangler.jsonc, so the generated types don't know them. Both are optional:
// without them Google sign-in is switched off.
interface __BaseEnv_Env {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}
