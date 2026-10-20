import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./config";

export const browserClient = () => createBrowserClient(supabaseUrl, supabasePublishableKey);
