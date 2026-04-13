import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = 'https://ilstrjzaqbarxlvpcidn.supabase.co';
  const supabaseAnonKey = 'sb_publishable_cdzc-FMy1YMYLX_fR_O13A_rm_ss9bH';

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
};

// Helper to get auth directly
export const getAuth = () => getSupabase().auth;
