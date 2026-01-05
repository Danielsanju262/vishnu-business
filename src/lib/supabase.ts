
import { createClient } from '@supabase/supabase-js';

// TODO: Replace with your actual project URL and Anon Key from Supabase Dashboard
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);
