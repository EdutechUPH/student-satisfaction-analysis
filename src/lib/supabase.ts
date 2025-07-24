import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Throw an error if the variables are not set to help with debugging
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase URL and/or anonymous key is not set in .env.local");
}

// Create and export the Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);