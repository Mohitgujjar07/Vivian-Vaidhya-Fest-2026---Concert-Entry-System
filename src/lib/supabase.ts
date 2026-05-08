import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co').trim()
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder').trim()

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
if (supabaseAnonKey && supabaseAnonKey !== 'placeholder') {
  supabase.realtime.setAuth(supabaseAnonKey)
}

export type Student = {
  receipt_id: string
  name: string
  department: string | null
  image_url: string | null
  is_used: boolean | null
  created_at: string | null
  updated_at: string | null
  entry_time: string | null
  usn: string | null
  section: string | null
  college_name: string | null
  whatsapp_number: string | null
  is_shared: boolean | null
}

export type ScanLog = {
  id: number
  receipt_id: string
  scan_time: string
  status: string
  created_at: string | null
  student?: Student
}
