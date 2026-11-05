// Public release targets. Credentials are supplied only through environment variables.
export const productionOrigin = "https://admitstrategy.com";
export const productionSupabaseUrl = "https://jjdzogjuuitzhxmnoacw.supabase.co";

export function readBuildConfig(env) {
  const environment = env.APP_ENV || "development";
  const backend = env.APP_BACKEND || "legacy";
  if (!["development", "production"].includes(environment)) throw new Error("Invalid APP_ENV.");
  if (!["legacy", "supabase"].includes(backend)) throw new Error("Invalid APP_BACKEND.");
  if (env.CF_PAGES === "1" && environment !== "production") {
    throw new Error("Hosted builds require explicit production configuration. Keep development local and disable preview branch deployments.");
  }
  const supabaseUrl = env.SUPABASE_URL || "";
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || "";
  if (publishableKey && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error("Use a modern publishable key, never a secret or service-role JWT.");
  }
  if (backend === "supabase") {
    if (!supabaseUrl || !publishableKey) throw new Error("Supabase public configuration is required.");
    let parsed;
    try { parsed = new URL(supabaseUrl); } catch { throw new Error("Invalid SUPABASE_URL."); }
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" ||
        !(parsed.protocol === "https:" || (environment === "development" && local && parsed.protocol === "http:"))) {
      throw new Error("SUPABASE_URL must be a secure origin or a local development origin.");
    }
  }
  if (environment === "production") {
    if (backend !== "supabase" || supabaseUrl !== productionSupabaseUrl) {
      throw new Error("Production must use the existing Admit Strategy Prod Supabase project.");
    }
    if (env.GOOGLE_AUTH_ENABLED !== "true") throw new Error("Production Google authentication must be configured and verified before building.");
  }
  return {backend, supabaseUrl, publishableKey, environment, googleEnabled: env.GOOGLE_AUTH_ENABLED === "true"};
}
