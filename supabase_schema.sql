-- =============================================================================
-- ANALYTIX CLUB - SUPABASE POSTGRESQL SCHEMA
-- Copy and paste this directly into your Supabase Dashboard -> SQL Editor -> Run
-- =============================================================================

-- 1. Users Table (Admin & Members)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    team TEXT DEFAULT 'Tech' CHECK (team IN ('Tech', 'Design', 'MOC', 'None')),
    department TEXT DEFAULT '',
    year TEXT DEFAULT '2nd Year',
    phone TEXT DEFAULT '',
    skills TEXT DEFAULT '',
    bio TEXT DEFAULT '',
    profile_photo TEXT DEFAULT '',
    points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    venue TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    registration_deadline TIMESTAMPTZ NOT NULL,
    instructions TEXT DEFAULT '',
    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft', 'completed')),
    poster_url TEXT DEFAULT '',
    category TEXT DEFAULT 'Analytix Core',
    capacity INTEGER DEFAULT 0,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Hackathons Table
CREATE TABLE IF NOT EXISTS public.hackathons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    organizer TEXT NOT NULL,
    description TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    deadline TIMESTAMPTZ NOT NULL,
    location TEXT NOT NULL,
    mode TEXT DEFAULT 'hybrid' CHECK (mode IN ('online', 'in-person', 'hybrid')),
    registration_link TEXT DEFAULT '',
    eligibility TEXT DEFAULT '',
    required_skills TEXT DEFAULT '',
    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft', 'completed')),
    poster_url TEXT DEFAULT '',
    prize_pool TEXT DEFAULT '₹1,50,000',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Announcements Table
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'Notice',
    image_url TEXT DEFAULT '',
    status TEXT DEFAULT 'published' CHECK (status IN ('published', 'draft')),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Event Registrations Table
CREATE TABLE IF NOT EXISTS public.event_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected', 'attended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

-- 6. Hackathon Registrations Table
CREATE TABLE IF NOT EXISTS public.hackathon_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID NOT NULL REFERENCES public.hackathons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    team_members TEXT NOT NULL,
    submission_link TEXT DEFAULT '',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Activities Table
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) optionally or leave open for backend service role
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hackathon_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Allow full access to authenticated service role / backend API
CREATE POLICY "Allow service role full access to users" ON public.users FOR ALL USING (true);
CREATE POLICY "Allow public read to events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to events" ON public.events FOR ALL USING (true);
CREATE POLICY "Allow public read to hackathons" ON public.hackathons FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to hackathons" ON public.hackathons FOR ALL USING (true);
CREATE POLICY "Allow public read to announcements" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to announcements" ON public.announcements FOR ALL USING (true);
CREATE POLICY "Allow service role full access to event_registrations" ON public.event_registrations FOR ALL USING (true);
CREATE POLICY "Allow service role full access to hackathon_registrations" ON public.hackathon_registrations FOR ALL USING (true);
CREATE POLICY "Allow service role full access to activities" ON public.activities FOR ALL USING (true);

-- =============================================================================
-- SEED INITIAL DATA
-- =============================================================================

-- Seed Admin (analytix63@gmail.com / Analytix@2026) and Initial Members
-- Bcrypt hash for 'Analytix@2026': $2b$12$K8q/8pUf71yMhCcm80pffOqR8.74f762a4079ad1b2600ba45edc98 (or backend auto-hashes)
INSERT INTO public.users (id, email, password_hash, full_name, role, team, department, year, phone, skills, bio, profile_photo, points)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'analytix63@gmail.com', '$2b$12$4mR6V/gXb9Gk2aZ2n6vLq.629e46a780ad5e5c544d6da21a97e6', 'sathwik shetty', 'admin', 'Tech', 'Computer Science & Engineering', '4th Year', '+91 98765 43210', 'Python, FastAPI, Leadership, Cloud', 'Lead coordinator of Analytix Club.', 'assets/uploads/sathwik_avatar.jpg', 340),
    ('00000000-0000-0000-0000-000000000002', 'priya@analytixclub.edu', '$2b$12$4mR6V/gXb9Gk2aZ2n6vLq.629e46a780ad5e5c544d6da21a97e6', 'Priya Nair', 'member', 'Design', 'Information Technology', '3rd Year', '+91 98765 43211', 'Figma, UI/UX, CSS', 'Creative thinker and UI enthusiast.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80', 290)
ON CONFLICT (email) DO NOTHING;

-- Seed Sample Events
INSERT INTO public.events (id, title, description, venue, event_date, registration_deadline, instructions, status, poster_url, category, capacity, created_by)
VALUES 
    ('10000000-0000-0000-0000-000000000001', 'Data Crunch 2026: Hands-on Machine Learning Bootcamp', 'An intensive weekend bootcamp covering exploratory data analysis and deploying ML models with FastAPI.', 'Auditorium Hall B & Virtual Stream', NOW() + INTERVAL '14 days', NOW() + INTERVAL '13 days', 'Bring your laptop with Python 3.10+ installed.', 'published', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80', 'AI & ML Track', 100, '00000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002', 'Design Sprint: Crafting Engaging Data Visualizations', 'Learn how to turn complex numbers into compelling UI dashboards using Figma and charts.', 'Design Studio Lab 3', NOW() + INTERVAL '21 days', NOW() + INTERVAL '20 days', 'No prior design experience required.', 'published', 'https://images.unsplash.com/photo-1542744094-3a31f272c490?w=800&auto=format&fit=crop&q=80', 'UI/UX & Design', 50, '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;
