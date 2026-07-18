import { createClient } from '@supabase/supabase-js'

// Estas variables las encuentras en la sección "Settings" > "API" de tu proyecto en Supabase
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)