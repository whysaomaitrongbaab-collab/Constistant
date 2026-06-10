// supabase.example.js
// copy ไฟล์นี้ แล้ว rename เป็น supabase.js แล้วใส่ key จริง

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

export const supabase = createClient(
  'YOUR_PROJECT_URL',
  'YOUR_ANON_KEY'
)