import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uwxrdjuajtluowoktwep.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_M5E83JZgDiRz9nmIQoFZGQ_LbexDSaI'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)