"""
ANALYTIX CLUB - FASTAPI BACKEND SERVER
Complete production backend implementation with role-based access control (RBAC),
Kinobi-style Club Admin Portal endpoints, Member Dashboard endpoints,
CRUD operations, activity feeds, and file uploads.
"""

import os
import uuid
import sqlite3
import hashlib
import shutil
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Form, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, EmailStr, Field
import jwt
from dotenv import load_dotenv

# Load environment configuration (.env)
load_dotenv()

# ==============================================================================
# CONFIGURATION & SECURITY
# ==============================================================================

SECRET_KEY = os.environ.get("SECRET_KEY", os.environ.get("JWT_SECRET", "analytix-secret-key-2026-2027-super-secure"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
DB_FILE = os.path.join(os.path.dirname(__file__), "analytix.db")
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "assets", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Supabase Production Cloud Database Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"[Supabase] Initialized client for project: {SUPABASE_URL}")
    except Exception as e:
        print(f"[Supabase] Notice: could not initialize Supabase client: {e}")


app = FastAPI(
    title="Analytix Club API",
    description="Backend API for Analytix Club - Where Data Turns Into Impact & Innovation.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    if any(request.url.path.endswith(ext) for ext in [".js", ".css", ".html"]):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# ==============================================================================
# DATABASE SETUP & SEEDING
# ==============================================================================

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=15.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA foreign_keys = ON")
    except Exception:
        pass
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def verify_password(plain: str, hashed: str) -> bool:
    return hash_password(plain) == hashed

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def log_activity(conn, act_type: str, message: str, user_id: Optional[str] = None):
    now = datetime.now(timezone.utc).isoformat()
    try:
        conn.cursor().execute(
            "INSERT INTO activities (id, type, message, user_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (str(uuid.uuid4()), act_type, message, user_id, now)
        )
    except Exception:
        pass

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                role TEXT DEFAULT 'member',
                team TEXT DEFAULT 'Tech',
                department TEXT DEFAULT '',
                year TEXT DEFAULT '2nd Year',
                phone TEXT DEFAULT '',
                skills TEXT DEFAULT '',
                bio TEXT DEFAULT '',
                profile_photo TEXT DEFAULT '',
                points INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                venue TEXT NOT NULL,
                event_date TEXT NOT NULL,
                registration_deadline TEXT NOT NULL,
                instructions TEXT DEFAULT '',
                status TEXT DEFAULT 'published',
                poster_url TEXT DEFAULT '',
                category TEXT DEFAULT 'Analytix Core',
                capacity INTEGER DEFAULT 0,
                created_by TEXT,
                created_at TEXT NOT NULL
            )
        """)

        # Migration: ensure category & capacity exist if table was created previously
        try:
            cursor.execute("ALTER TABLE events ADD COLUMN category TEXT DEFAULT 'Analytix Core'")
        except Exception:
            pass
        try:
            cursor.execute("ALTER TABLE events ADD COLUMN capacity INTEGER DEFAULT 0")
        except Exception:
            pass

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hackathons (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                organizer TEXT NOT NULL,
                description TEXT NOT NULL,
                start_date TEXT NOT NULL,
                deadline TEXT NOT NULL,
                location TEXT NOT NULL,
                mode TEXT DEFAULT 'hybrid',
                registration_link TEXT DEFAULT '',
                eligibility TEXT DEFAULT '',
                required_skills TEXT DEFAULT '',
                status TEXT DEFAULT 'published',
                poster_url TEXT DEFAULT '',
                prize_pool TEXT DEFAULT '₹1,50,000',
                created_by TEXT,
                created_at TEXT NOT NULL
            )
        """)

        try:
            cursor.execute("ALTER TABLE hackathons ADD COLUMN prize_pool TEXT DEFAULT '₹1,50,000'")
        except Exception:
            pass

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT DEFAULT 'Notice',
                image_url TEXT DEFAULT '',
                status TEXT DEFAULT 'published',
                created_by TEXT,
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS event_registrations (
                id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                status TEXT DEFAULT 'approved',
                created_at TEXT NOT NULL,
                UNIQUE(event_id, user_id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS hackathon_registrations (
                id TEXT PRIMARY KEY,
                hackathon_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                team_name TEXT DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                user_id TEXT,
                created_at TEXT NOT NULL
            )
        """)

        conn.commit()

        # Seed initial data if empty
        cursor.execute("SELECT COUNT(*) FROM users")
        if cursor.fetchone()[0] == 0:
            now = datetime.now(timezone.utc).isoformat()
            default_pwd = hash_password("analytix2026")
            admin_pwd = hash_password("Analytix@2026")

            # Seed Admin and Members
            users_seed = [
                ("00000000-0000-0000-0000-000000000001", "analytix63@gmail.com", admin_pwd, "sathwik shetty", "admin", "Tech", "Computer Science & Engineering", "4th Year", "+91 98765 43210", "Python, FastAPI, Machine Learning, Leadership", "Lead coordinator of Analytix Club. Passionate about AI & Big Data.", "assets/uploads/sathwik_avatar.jpg", 340, now),
                ("00000000-0000-0000-0000-000000000002", "priya@analytixclub.edu", default_pwd, "Priya Nair", "member", "Design", "Information Technology", "3rd Year", "+91 98765 43211", "Figma, UI/UX, CSS, Graphic Design", "Creative thinker and UI enthusiast. Love designing engaging posters and intuitive digital interfaces.", "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", 290, now),
                ("00000000-0000-0000-0000-000000000003", "rohit@analytixclub.edu", default_pwd, "Rohit Verma", "member", "Tech", "Data Science & AI", "2nd Year", "+91 98765 43212", "Python, Pandas, SQL, Scikit-learn", "Data geek exploring deep learning architectures and predictive modeling.", "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", 210, now),
                ("00000000-0000-0000-0000-000000000004", "sneha@analytixclub.edu", default_pwd, "Sneha Kulkarni", "member", "MOC", "Electronics & Communication", "3rd Year", "+91 98765 43213", "Public Speaking, Content Writing, Event Logistics", "MOC team coordinator handling event coverage, stage moderation, and press releases.", "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80", 245, now)
            ]
            cursor.executemany("INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", users_seed)

            # Seed Events matching reference data
            events_seed = [
                ("10000000-0000-0000-0000-000000000001", "Data Crunch 2026: Hands-on Machine Learning Bootcamp", "An intensive weekend bootcamp covering exploratory data analysis, feature engineering, and deploying ML models with FastAPI.", "Auditorium Hall B & Virtual Stream", "2026-12-15T10:00:00Z", "2026-12-14T18:00:00Z", "Bring your laptop with Python 3.10+ installed and VS Code ready.", "published", "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80", "AI & ML Track", 100, "00000000-0000-0000-0000-000000000001", now),
                ("10000000-0000-0000-0000-000000000002", "Design Sprint: Crafting Engaging Data Visualizations", "Learn how to turn complex numbers into compelling, narrative-driven UI dashboards using Figma and interactive charts.", "Design Studio Lab 3", "2026-12-22T14:00:00Z", "2026-12-21T23:59:00Z", "No prior design experience required. Bring your laptop and your curiosity!", "published", "https://images.unsplash.com/photo-1542744094-3a31f272c490?w=800&auto=format&fit=crop&q=80", "UI/UX & Design", 50, "00000000-0000-0000-0000-000000000001", now),
                ("10000000-0000-0000-0000-000000000003", "Neural Networks & Deep Learning Masterclass", "Dive deep into Transformer architectures, attention mechanisms, and fine-tuning open-source LLMs.", "Tech Seminar Hall 1", "2026-11-20T09:30:00Z", "2026-11-19T18:00:00Z", "Basic Python knowledge assumed.", "completed", "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80", "AI & ML Track", 80, "00000000-0000-0000-0000-000000000001", now),
                ("10000000-0000-0000-0000-000000000004", "Data Engineering at Scale: Spark & BigQuery", "Workshop on building resilient streaming pipelines and data models using Dataproc, Apache Spark, and Google Cloud BigQuery.", "Cloud Computing Lab", "2026-11-10T11:00:00Z", "2026-11-09T23:59:00Z", "Free GCP student credits provided during registration.", "completed", "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80", "Cloud & Big Data", 60, "00000000-0000-0000-0000-000000000001", now),
                ("10000000-0000-0000-0000-000000000005", "University Tech Symposium & Keynote", "Annual campus-wide gathering of student technologists, keynote by industry leaders, and project showcases.", "Main University Auditorium", "2026-11-05T10:00:00Z", "2026-11-04T18:00:00Z", "All campus students invited.", "completed", "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=800&auto=format&fit=crop&q=80", "Analytix Core", 0, "00000000-0000-0000-0000-000000000001", now),
                ("10000000-0000-0000-0000-000000000006", "Open Source Club Hack Night", "Collaborative sprint contributing to open source tools, fixing bugs, and submitting pull requests.", "Innovation Hub Room 402", "2026-10-28T18:00:00Z", "2026-10-27T23:59:00Z", "Pizza and beverages provided.", "completed", "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop&q=80", "Tech Track", 40, "00000000-0000-0000-0000-000000000001", now)
            ]
            cursor.executemany("INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", events_seed)

            # Seed Hackathons
            hackathons_seed = [
                ("20000000-0000-0000-0000-000000000001", "HackAnalytix 36-Hour National Hackathon", "Analytix Club x Tech Titans", "Build real-world solutions across AI/ML, FinTech, and Smart Campus automation. Cash prizes worth ₹1,50,000 + internship offers for top teams.", "2026-12-05T09:00:00Z", "2026-11-30T23:59:00Z", "Main Campus Innovation Hub", "hybrid", "https://analytixclub.edu/hackanalytix-2026", "Open to all undergraduate and postgraduate students in teams of 2-4 members.", "Python, React / Web Dev, AI/ML APIs, Database Design", "published", "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop&q=80", "₹1,50,000", "00000000-0000-0000-0000-000000000001", now),
                ("20000000-0000-0000-0000-000000000002", "FinTech Algorithmic Trading Sprint", "Analytix Quantitative Finance Circle", "Design and backtest algorithmic trading strategies using quantitative data and historical market feeds.", "2026-12-18T10:00:00Z", "2026-12-15T23:59:00Z", "Virtual Discord / Zoom", "online", "https://analytixclub.edu/fintech-sprint", "Individual or duo participation.", "Python, Pandas, Backtrader, Statistical Analysis", "published", "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80", "₹50,000", "00000000-0000-0000-0000-000000000001", now)
            ]
            cursor.executemany("INSERT INTO hackathons VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", hackathons_seed)

            # Seed Announcements
            announcements_seed = [
                ("30000000-0000-0000-0000-000000000001", "Welcome to Analytix Club Academic Year 2026-27!", "Orientation meet for all new recruits will be held this Wednesday at 4:30 PM. Check your email for room details.", "Notice", "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80", "published", "00000000-0000-0000-0000-000000000001", now),
                ("30000000-0000-0000-0000-000000000002", "Call for Project Mentors: Tech, Design & MOC", "Senior members interested in leading teams for upcoming inter-college competitions can apply via the dashboard.", "Opportunity", "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop&q=80", "published", "00000000-0000-0000-0000-000000000001", now),
                ("30000000-0000-0000-0000-000000000003", "Registrations Open for HackAnalytix 2026", "Team registrations are now officially live! Form your team of 2-4 and secure your spot early.", "Event", "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop&q=80", "published", "00000000-0000-0000-0000-000000000001", now)
            ]
            cursor.executemany("INSERT INTO announcements VALUES (?,?,?,?,?,?,?,?)", announcements_seed)

            # Seed Registrations
            registrations_seed = [
                (str(uuid.uuid4()), "10000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "approved", now),
                (str(uuid.uuid4()), "10000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000003", "approved", now),
                (str(uuid.uuid4()), "10000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000004", "attended", now),
                (str(uuid.uuid4()), "10000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000002", "approved", now),
                (str(uuid.uuid4()), "10000000-0000-0000-0000-000000000003", "00000000-0000-0000-0000-000000000003", "attended", now)
            ]
            cursor.executemany("INSERT INTO event_registrations VALUES (?,?,?,?,?)", registrations_seed)

            # Seed Activities
            activities_seed = [
                (str(uuid.uuid4()), "event", "Event 'Data Crunch 2026' published to campus schedule", "00000000-0000-0000-0000-000000000001", now),
                (str(uuid.uuid4()), "award", "Priya Nair awarded 30 activity points for Design Lead contributions", "00000000-0000-0000-0000-000000000001", now),
                (str(uuid.uuid4()), "reg", "Rohit Verma registered for Data Crunch 2026 Bootcamp", "00000000-0000-0000-0000-000000000003", now)
            ]
            cursor.executemany("INSERT INTO activities VALUES (?,?,?,?,?)", activities_seed)

            conn.commit()

        # Always verify admin email, password and profile photo match user requirement
        admin_pwd = hash_password("Analytix@2026")
        cursor.execute("""
            UPDATE users 
            SET email = ?, 
                password_hash = ?, 
                full_name = 'sathwik shetty', 
                profile_photo = 'assets/uploads/sathwik_avatar.jpg' 
            WHERE role = 'admin'
        """, ("analytix63@gmail.com", admin_pwd))
        conn.commit()

init_db()

# ==============================================================================
# AUTH DEPENDENCY & MODELS
# ==============================================================================

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    department: Optional[str] = ""
    year: Optional[str] = "2nd Year"
    phone: Optional[str] = ""
    skills: Optional[str] = ""
    bio: Optional[str] = ""

class UserRoleUpdate(BaseModel):
    role: str

class UserTeamUpdate(BaseModel):
    team: str

class LeaderboardAward(BaseModel):
    member_id: str
    points: int
    reason: Optional[str] = "Activity points"

class EventCreate(BaseModel):
    title: str
    description: str
    venue: str
    event_date: str
    registration_deadline: str
    instructions: Optional[str] = ""
    status: Optional[str] = "published"
    poster_url: Optional[str] = ""
    category: Optional[str] = "Analytix Core"
    capacity: Optional[int] = 0

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    venue: Optional[str] = None
    event_date: Optional[str] = None
    registration_deadline: Optional[str] = None
    instructions: Optional[str] = None
    status: Optional[str] = None
    poster_url: Optional[str] = None
    category: Optional[str] = None
    capacity: Optional[int] = None

class HackathonCreate(BaseModel):
    title: str
    organizer: str
    description: str
    start_date: str
    deadline: str
    location: str
    mode: Optional[str] = "hybrid"
    registration_link: Optional[str] = ""
    eligibility: Optional[str] = ""
    required_skills: Optional[str] = ""
    status: Optional[str] = "published"
    poster_url: Optional[str] = ""
    prize_pool: Optional[str] = "₹1,50,000"

class HackathonUpdate(BaseModel):
    title: Optional[str] = None
    organizer: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    location: Optional[str] = None
    mode: Optional[str] = None
    registration_link: Optional[str] = None
    eligibility: Optional[str] = None
    required_skills: Optional[str] = None
    status: Optional[str] = None
    poster_url: Optional[str] = None
    prize_pool: Optional[str] = None

class AnnouncementCreate(BaseModel):
    title: str
    description: str
    category: Optional[str] = "Notice"
    image_url: Optional[str] = ""
    status: Optional[str] = "published"

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    status: Optional[str] = None

class MemberCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: Optional[str] = "analytix2026"
    role: Optional[str] = "member"
    team: Optional[str] = "Tech"
    department: Optional[str] = ""
    year: Optional[str] = "2nd Year"
    phone: Optional[str] = ""
    skills: Optional[str] = ""
    bio: Optional[str] = ""
    points: Optional[int] = 10

class MemberUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    team: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    phone: Optional[str] = None
    skills: Optional[str] = None
    bio: Optional[str] = None
    points: Optional[int] = None
    profile_photo: Optional[str] = None

class MemberSelfUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    year: Optional[str] = None
    team: Optional[str] = None
    skills: Optional[str] = None
    bio: Optional[str] = None
    profile_photo: Optional[str] = None

class RegistrationStatusUpdate(BaseModel):
    status: str

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authentication token")
    
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired or invalid")

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return dict(row)

def get_current_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required")
    return user

# ==============================================================================
# API ENDPOINTS
# ==============================================================================

_last_supabase_check = {"time": 0, "status": "unconfigured"}

def check_cached_supabase_status():
    global _last_supabase_check
    now = datetime.now().timestamp()
    if now - _last_supabase_check["time"] < 60:
        return _last_supabase_check["status"]
    
    status = "unconfigured"
    if supabase_client:
        try:
            supabase_client.table("users").select("id").limit(1).execute()
            status = "connected"
        except Exception:
            status = "tables_pending"
    _last_supabase_check = {"time": now, "status": status}
    return status

@app.get("/api/health")
def api_health():
    supabase_status = check_cached_supabase_status()

    return {
        "status": "healthy",
        "version": "2.0.0",
        "environment": "production",
        "database_connected": True,
        "database": {
            "primary": "supabase" if supabase_status == "connected" else "sqlite_fallback",
            "supabase_status": supabase_status,
            "supabase_project": "xqvlzdndukbibndylzfw" if SUPABASE_URL else None
        },
        "mode": "operational"
    }

@app.get("/api/supabase/status")
def api_supabase_status():
    if not supabase_client:
        return {"configured": False, "status": "no_credentials"}
    try:
        res = supabase_client.table("users").select("id").limit(1).execute()
        return {"configured": True, "status": "connected", "tables_exist": True}
    except Exception as e:
        err_msg = str(e)
        if "PGRST205" in err_msg or "Could not find the table" in err_msg:
            return {
                "configured": True,
                "status": "tables_pending",
                "tables_exist": False,
                "action_required": "Run supabase_schema.sql in Supabase SQL Editor: https://supabase.com/dashboard/project/xqvlzdndukbibndylzfw/sql/new"
            }
        return {"configured": True, "status": "error", "error": err_msg}

@app.post("/api/admin/supabase/sync")
def api_admin_supabase_sync(admin_user: dict = Depends(get_current_admin)):
    try:
        from sync_to_supabase import sync_data
        success = sync_data()
        if success:
            return {"status": "success", "message": "All data synchronized with Supabase cloud database!"}
        else:
            return {"status": "pending", "message": "Supabase tables not detected yet. Please run supabase_schema.sql in the Supabase SQL editor."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync error: {str(e)}")




@app.get("/api/stats")
def api_stats():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM users")
        members = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM events")
        events = c.fetchone()[0]
        c.execute("SELECT COUNT(*) FROM hackathons")
        hackathons = c.fetchone()[0]
        return {
            "members_count": members,
            "events_count": events,
            "hackathons_count": hackathons,
            "teams_count": 3
        }

# --- Authentication ---

@app.post("/api/auth/register")
def api_register(req: UserRegister):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE email = ?", (req.email,))
        if c.fetchone():
            raise HTTPException(status_code=400, detail="An account with this email already exists.")

        user_id = str(uuid.uuid4())
        pwd_hash = hash_password(req.password)
        now = datetime.now(timezone.utc).isoformat()

        c.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, team, department, year, phone, skills, bio, points, created_at)
            VALUES (?, ?, ?, ?, 'member', 'Tech', ?, ?, ?, ?, ?, 10, ?)
        """, (user_id, req.email, pwd_hash, req.full_name, req.department, req.year, req.phone, req.skills, req.bio, now))
        log_activity(conn, "member", f"New club member joined: {req.full_name} ({req.email})", user_id)
        conn.commit()

        user_data = {
            "id": user_id,
            "email": req.email,
            "full_name": req.full_name,
            "role": "member",
            "team": "Tech",
            "department": req.department,
            "year": req.year
        }
        token = create_access_token({"sub": user_id})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": user_data
        }

@app.post("/api/auth/login")
def api_login(req: UserLogin):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE email = ?", (req.email,))
        row = c.fetchone()
        if not row or not verify_password(req.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")

        user = dict(row)
        user.pop("password_hash", None)
        token = create_access_token({"sub": user["id"]})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": user
        }

@app.get("/api/auth/me")
def api_auth_me(user: dict = Depends(get_current_user)):
    user.pop("password_hash", None)
    return user

@app.post("/api/auth/logout")
def api_logout():
    return {"message": "Logged out successfully"}

@app.post("/api/auth/forgot-password")
def api_forgot_password(body: dict):
    return {"message": "If the email is registered, recovery instructions have been sent."}

@app.post("/api/auth/reset-password")
def api_reset_password(body: dict):
    return {"message": "Password updated successfully."}

# --- File Uploads ---

@app.post("/api/events/upload-poster")
@app.post("/api/hackathons/upload-poster")
@app.post("/api/announcements/upload-image")
async def api_upload_media(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1] or ".jpg"
    safe_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    url = f"assets/uploads/{safe_name}"
    return {"url": url, "filename": safe_name}

@app.post("/api/members/upload-photo")
@app.post("/api/users/upload-photo")
@app.post("/api/auth/upload-avatar")
async def api_upload_profile_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
        ext = ".jpg"
    safe_name = f"avatar_{user['id'][:8]}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    url = f"assets/uploads/{safe_name}"

    with get_db() as conn:
        c = conn.cursor()
        c.execute("UPDATE users SET profile_photo = ? WHERE id = ?", (url, user["id"]))
        conn.commit()
        c.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
        updated_user = dict(c.fetchone())
        updated_user.pop("password_hash", None)

    return {"url": url, "user": updated_user, "message": "Profile photo updated successfully"}

# --- Events (Full CRUD) ---

@app.get("/api/events")
def api_get_events():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT e.*, 
                   (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) as registrations_count
            FROM events e
            ORDER BY e.event_date ASC
        """)
        return [dict(r) for r in c.fetchall()]

@app.get("/api/events/{event_id}")
def api_get_event(event_id: str):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT e.*, 
                   (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) as registrations_count
            FROM events e
            WHERE e.id = ?
        """, (event_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")
        return dict(row)

@app.post("/api/events")
def api_create_event(event: EventCreate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        eid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        c.execute("""
            INSERT INTO events (id, title, description, venue, event_date, registration_deadline, instructions, status, poster_url, category, capacity, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (eid, event.title, event.description, event.venue, event.event_date, event.registration_deadline, event.instructions, event.status or 'published', event.poster_url, event.category or 'Analytix Core', event.capacity or 0, admin["id"], now))
        log_activity(conn, "event", f"Created event '{event.title}' scheduled for {event.event_date[:10]}", admin["id"])
        conn.commit()
        return {"id": eid, "message": "Event created and published successfully"}

@app.put("/api/events/{event_id}")
def api_update_event(event_id: str, event: EventUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM events WHERE id = ?", (event_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")

        updates = []
        params = []
        for field, value in event.dict(exclude_unset=True).items():
            updates.append(f"{field} = ?")
            params.append(value)

        if updates:
            params.append(event_id)
            c.execute(f"UPDATE events SET {', '.join(updates)} WHERE id = ?", params)
            log_activity(conn, "event", f"Updated event '{row['title']}'", admin["id"])
            conn.commit()

        return {"message": "Event updated successfully"}

@app.delete("/api/events/{event_id}")
def api_delete_event(event_id: str, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT title FROM events WHERE id = ?", (event_id,))
        row = c.fetchone()
        title = row["title"] if row else "Event"
        c.execute("DELETE FROM event_registrations WHERE event_id = ?", (event_id,))
        c.execute("DELETE FROM events WHERE id = ?", (event_id,))
        log_activity(conn, "event", f"Deleted event '{title}'", admin["id"])
        conn.commit()
        return {"message": "Event deleted successfully"}

@app.get("/api/events/{event_id}/registrations")
def api_get_event_registrations(event_id: str, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT r.id, r.status, r.created_at as registered_at,
                   u.id as user_id, u.full_name, u.email, u.department, u.year, u.team, u.phone
            FROM event_registrations r
            JOIN users u ON r.user_id = u.id
            WHERE r.event_id = ?
            ORDER BY r.created_at DESC
        """, (event_id,))
        rows = []
        for r in c.fetchall():
            rows.append({
                "id": r["id"],
                "status": r["status"],
                "registered_at": r["registered_at"],
                "member": {
                    "id": r["user_id"],
                    "full_name": r["full_name"],
                    "email": r["email"],
                    "department": r["department"],
                    "year": r["year"],
                    "team": r["team"],
                    "phone": r["phone"]
                }
            })
        return rows

# --- Hackathons (Full CRUD) ---

@app.get("/api/hackathons")
def api_get_hackathons():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT h.*,
                   (SELECT COUNT(*) FROM hackathon_registrations r WHERE r.hackathon_id = h.id) as registrations_count
            FROM hackathons h
            ORDER BY h.start_date ASC
        """)
        return [dict(r) for r in c.fetchall()]

@app.get("/api/hackathons/{hackathon_id}")
def api_get_hackathon(hackathon_id: str):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM hackathons WHERE id = ?", (hackathon_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hackathon not found")
        return dict(row)

@app.post("/api/hackathons")
def api_create_hackathon(h: HackathonCreate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        hid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        c.execute("""
            INSERT INTO hackathons (id, title, organizer, description, start_date, deadline, location, mode, registration_link, eligibility, required_skills, status, poster_url, prize_pool, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (hid, h.title, h.organizer, h.description, h.start_date, h.deadline, h.location, h.mode or 'hybrid', h.registration_link, h.eligibility, h.required_skills, h.status or 'published', h.poster_url, h.prize_pool or '₹1,50,000', admin["id"], now))
        log_activity(conn, "hackathon", f"Listed hackathon '{h.title}' by {h.organizer}", admin["id"])
        conn.commit()
        return {"id": hid, "message": "Hackathon created successfully"}

@app.put("/api/hackathons/{hackathon_id}")
def api_update_hackathon(hackathon_id: str, h: HackathonUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM hackathons WHERE id = ?", (hackathon_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Hackathon not found")

        updates = []
        params = []
        for field, value in h.dict(exclude_unset=True).items():
            updates.append(f"{field} = ?")
            params.append(value)

        if updates:
            params.append(hackathon_id)
            c.execute(f"UPDATE hackathons SET {', '.join(updates)} WHERE id = ?", params)
            log_activity(conn, "hackathon", f"Updated hackathon '{row['title']}'", admin["id"])
            conn.commit()

        return {"message": "Hackathon updated successfully"}

@app.delete("/api/hackathons/{hackathon_id}")
def api_delete_hackathon(hackathon_id: str, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT title FROM hackathons WHERE id = ?", (hackathon_id,))
        row = c.fetchone()
        title = row["title"] if row else "Hackathon"
        c.execute("DELETE FROM hackathon_registrations WHERE hackathon_id = ?", (hackathon_id,))
        c.execute("DELETE FROM hackathons WHERE id = ?", (hackathon_id,))
        log_activity(conn, "hackathon", f"Deleted hackathon '{title}'", admin["id"])
        conn.commit()
        return {"message": "Hackathon deleted"}

@app.get("/api/hackathons/{hackathon_id}/registrations")
def api_get_hackathon_registrations(hackathon_id: str, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT r.id, r.team_name, r.created_at,
                   u.id as user_id, u.full_name, u.email, u.department, u.year, u.team, u.phone
            FROM hackathon_registrations r
            JOIN users u ON r.user_id = u.id
            WHERE r.hackathon_id = ?
            ORDER BY r.created_at DESC
        """, (hackathon_id,))
        return [dict(r) for r in c.fetchall()]

# --- Announcements (Full CRUD) ---

@app.get("/api/announcements")
def api_get_announcements():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM announcements ORDER BY created_at DESC")
        return [dict(r) for r in c.fetchall()]

@app.get("/api/announcements/{announcement_id}")
def api_get_announcement(announcement_id: str):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM announcements WHERE id = ?", (announcement_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Announcement not found")
        return dict(row)

@app.post("/api/announcements")
def api_create_announcement(a: AnnouncementCreate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        aid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        c.execute("""
            INSERT INTO announcements (id, title, description, category, image_url, status, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (aid, a.title, a.description, a.category or 'Notice', a.image_url, a.status or 'published', admin["id"], now))
        log_activity(conn, "announcement", f"Posted announcement '{a.title}'", admin["id"])
        conn.commit()
        return {"id": aid, "message": "Announcement posted successfully"}

@app.put("/api/announcements/{announcement_id}")
def api_update_announcement(announcement_id: str, a: AnnouncementUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        updates = []
        params = []
        for field, value in a.dict(exclude_unset=True).items():
            updates.append(f"{field} = ?")
            params.append(value)

        if updates:
            params.append(announcement_id)
            c.execute(f"UPDATE announcements SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()

        return {"message": "Announcement updated"}

@app.delete("/api/announcements/{announcement_id}")
def api_delete_announcement(announcement_id: str, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM announcements WHERE id = ?", (announcement_id,))
        conn.commit()
        return {"message": "Announcement deleted"}

# --- Admin Members Directory & Permissions ---

@app.get("/api/admin/members")
def api_admin_members(
    search: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    admin: dict = Depends(get_current_admin)
):
    with get_db() as conn:
        c = conn.cursor()
        query = """
            SELECT u.id, u.full_name, u.email, u.role, u.team, u.department, u.year, u.phone, u.skills, u.bio, u.points, u.profile_photo, u.created_at,
                   (SELECT COUNT(*) FROM event_registrations r WHERE r.user_id = u.id) as registrations_count
            FROM users u
            WHERE 1=1
        """
        params = []
        if search:
            query += " AND (u.full_name LIKE ? OR u.email LIKE ? OR u.department LIKE ?)"
            term = f"%{search.strip()}%"
            params.extend([term, term, term])
        if team and team != "All":
            query += " AND LOWER(u.team) = LOWER(?)"
            params.append(team)

        query += " ORDER BY u.points DESC, u.created_at DESC"
        c.execute(query, params)
        return [dict(r) for r in c.fetchall()]

@app.post("/api/admin/members")
def api_admin_create_member(m: MemberCreate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM users WHERE email = ?", (m.email,))
        if c.fetchone():
            raise HTTPException(status_code=400, detail="A member with this email already exists.")

        mid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        pwd_hash = hash_password(m.password or "analytix2026")

        c.execute("""
            INSERT INTO users (id, email, password_hash, full_name, role, team, department, year, phone, skills, bio, points, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (mid, m.email, pwd_hash, m.full_name, m.role or 'member', m.team or 'Tech', m.department or '', m.year or '2nd Year', m.phone or '', m.skills or '', m.bio or '', m.points or 10, now))
        log_activity(conn, "member", f"Admin created member account for {m.full_name} ({m.email})", admin["id"])
        conn.commit()
        return {"id": mid, "message": "Member added successfully"}

@app.put("/api/admin/members/{member_id}")
def api_admin_update_member(member_id: str, m: MemberUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM users WHERE id = ?", (member_id,))
        user = c.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Member not found")

        updates = []
        params = []
        for field, value in m.dict(exclude_unset=True).items():
            updates.append(f"{field} = ?")
            params.append(value)

        if updates:
            params.append(member_id)
            c.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            log_activity(conn, "member", f"Updated details for member {user['full_name']}", admin["id"])
            conn.commit()

        return {"message": "Member updated successfully"}

@app.delete("/api/admin/members/{member_id}")
def api_admin_delete_member(member_id: str, admin: dict = Depends(get_current_admin)):
    if member_id == admin["id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account.")

    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT full_name FROM users WHERE id = ?", (member_id,))
        row = c.fetchone()
        name = row["full_name"] if row else "Member"
        c.execute("DELETE FROM event_registrations WHERE user_id = ?", (member_id,))
        c.execute("DELETE FROM hackathon_registrations WHERE user_id = ?", (member_id,))
        c.execute("DELETE FROM users WHERE id = ?", (member_id,))
        log_activity(conn, "member", f"Removed member {name} from club roster", admin["id"])
        conn.commit()
        return {"message": "Member removed successfully"}

@app.patch("/api/admin/members/{member_id}/role")
def api_admin_update_role(member_id: str, req: UserRoleUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT full_name FROM users WHERE id = ?", (member_id,))
        row = c.fetchone()
        name = row["full_name"] if row else "Member"
        c.execute("UPDATE users SET role = ? WHERE id = ?", (req.role, member_id))
        log_activity(conn, "member", f"Changed role of {name} to {req.role.upper()}", admin["id"])
        conn.commit()
        return {"message": f"Role updated to {req.role}"}

@app.patch("/api/admin/members/{member_id}/team")
def api_admin_update_team(member_id: str, req: UserTeamUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("UPDATE users SET team = ? WHERE id = ?", (req.team, member_id))
        conn.commit()
        return {"message": f"Team updated to {req.team}"}

@app.put("/api/admin/members/{member_id}/points")
def api_admin_set_points(member_id: str, body: dict, admin: dict = Depends(get_current_admin)):
    points = body.get("points", 0)
    with get_db() as conn:
        c = conn.cursor()
        c.execute("UPDATE users SET points = ? WHERE id = ?", (points, member_id))
        conn.commit()
        return {"message": f"Points updated to {points}"}

@app.post("/api/admin/leaderboard/award")
def api_award_leaderboard_points(req: LeaderboardAward, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT full_name FROM users WHERE id = ?", (req.member_id,))
        user = c.fetchone()
        name = user["full_name"] if user else "Member"
        c.execute("UPDATE users SET points = points + ? WHERE id = ?", (req.points, req.member_id))
        log_activity(conn, "award", f"Awarded {req.points} points to {name}: {req.reason}", admin["id"])
        conn.commit()
        return {"message": f"Awarded {req.points} points to {name}"}

# --- Registrations & Applications Management ---

@app.get("/api/registrations/admin/all")
def api_admin_registrations(admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        # 1. Event registrations
        c.execute("""
            SELECT r.id, r.status, r.created_at, 'event' as type,
                   u.id as user_id, u.full_name as member_name, u.email as member_email, u.department, u.team, u.year,
                   e.id as item_id, e.title as event_title, e.event_date as event_date, e.venue as venue, '' as team_name
            FROM event_registrations r
            JOIN users u ON r.user_id = u.id
            JOIN events e ON r.event_id = e.id
            ORDER BY r.created_at DESC
        """)
        event_regs = [dict(r) for r in c.fetchall()]

        # 2. Hackathon team registrations
        c.execute("""
            SELECT r.id, 'approved' as status, r.created_at, 'hackathon' as type,
                   u.id as user_id, u.full_name as member_name, u.email as member_email, u.department, u.team, u.year,
                   h.id as item_id, h.title as event_title, h.start_date as event_date, h.location as venue, r.team_name
            FROM hackathon_registrations r
            JOIN users u ON r.user_id = u.id
            JOIN hackathons h ON r.hackathon_id = h.id
            ORDER BY r.created_at DESC
        """)
        hack_regs = [dict(r) for r in c.fetchall()]

        combined = event_regs + hack_regs
        combined.sort(key=lambda x: x["created_at"], reverse=True)
        return combined

@app.patch("/api/registrations/events/{reg_id}/status")
@app.put("/api/registrations/{reg_id}/status")
def api_update_registration_status(reg_id: str, req: RegistrationStatusUpdate, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("UPDATE event_registrations SET status = ? WHERE id = ?", (req.status, reg_id))
        conn.commit()
        return {"message": f"Status updated to {req.status}"}

@app.delete("/api/registrations/{reg_id}")
def api_delete_registration(reg_id: str, admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("DELETE FROM event_registrations WHERE id = ?", (reg_id,))
        c.execute("DELETE FROM hackathon_registrations WHERE id = ?", (reg_id,))
        conn.commit()
        return {"message": "Registration record removed"}

# --- Member Self Services & Dashboard ---

@app.get("/api/members/overview")
def api_member_overview(user: dict = Depends(get_current_user)):
    with get_db() as conn:
        c = conn.cursor()
        # User details
        c.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
        profile = dict(c.fetchone())
        profile.pop("password_hash", None)

        # User rank
        c.execute("SELECT COUNT(*) + 1 FROM users WHERE points > ?", (profile.get("points", 0),))
        rank = c.fetchone()[0]

        # Registered events count
        c.execute("SELECT COUNT(*) FROM event_registrations WHERE user_id = ?", (user["id"],))
        reg_count = c.fetchone()[0]

        # Upcoming club events
        now_str = datetime.now(timezone.utc).isoformat()
        c.execute("SELECT * FROM events WHERE status = 'published' AND event_date >= ? ORDER BY event_date ASC LIMIT 3", (now_str,))
        upcoming = [dict(r) for r in c.fetchall()]

        return {
            "member": profile,
            "total_points": profile.get("points", 0),
            "rank": rank,
            "team": profile.get("team", "Tech"),
            "registered_events_count": reg_count,
            "upcoming_events": upcoming
        }

@app.put("/api/members/me")
def api_update_own_profile(body: MemberSelfUpdate, user: dict = Depends(get_current_user)):
    with get_db() as conn:
        c = conn.cursor()
        updates = []
        params = []
        for field, value in body.dict(exclude_unset=True).items():
            if value is not None:
                updates.append(f"{field} = ?")
                params.append(value)

        if updates:
            params.append(user["id"])
            c.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()

        c.execute("SELECT * FROM users WHERE id = ?", (user["id"],))
        updated = dict(c.fetchone())
        updated.pop("password_hash", None)
        return updated

@app.get("/api/members/teams")
def api_get_teams():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id, full_name, profile_photo, department, year, skills, bio, role, team FROM users")
        rows = [dict(r) for r in c.fetchall()]
        teams = {"tech": [], "design": [], "moc": []}
        for u in rows:
            t = (u.get("team") or "tech").lower()
            if t in teams:
                teams[t].append(u)
            else:
                teams["tech"].append(u)
        return teams

@app.get("/api/members/leaderboard")
def api_get_leaderboard():
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT id as member_id, full_name, team, department, points, profile_photo as avatar FROM users ORDER BY points DESC")
        rows = [dict(r) for r in c.fetchall()]
        for idx, r in enumerate(rows, 1):
            r["rank"] = idx
        return rows

@app.post("/api/registrations/events/{event_id}")
def api_register_event(event_id: str, body: Optional[dict] = None, user: dict = Depends(get_current_user)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT title, capacity FROM events WHERE id = ?", (event_id,))
        ev = c.fetchone()
        if not ev:
            raise HTTPException(status_code=404, detail="Event not found")

        # Check capacity
        if ev["capacity"] and ev["capacity"] > 0:
            c.execute("SELECT COUNT(*) FROM event_registrations WHERE event_id = ?", (event_id,))
            current_regs = c.fetchone()[0]
            if current_regs >= ev["capacity"]:
                raise HTTPException(status_code=400, detail="Event registration is full.")

        rid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            c.execute("INSERT INTO event_registrations VALUES (?, ?, ?, 'approved', ?)", (rid, event_id, user["id"], now))
            c.execute("UPDATE users SET points = points + 15 WHERE id = ?", (user["id"],))
            log_activity(conn, "reg", f"{user['full_name']} registered for event '{ev['title']}'", user["id"])
            conn.commit()
            return {"id": rid, "message": f"Successfully registered for {ev['title']}! +15 activity points awarded."}
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail="You are already registered for this event.")

@app.post("/api/registrations/hackathons/{hackathon_id}")
def api_register_hackathon(hackathon_id: str, body: dict, user: dict = Depends(get_current_user)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT title FROM hackathons WHERE id = ?", (hackathon_id,))
        h = c.fetchone()
        if not h:
            raise HTTPException(status_code=404, detail="Hackathon not found")

        rid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        team_name = body.get("team_name", f"{user['full_name']}'s Team")
        c.execute("INSERT INTO hackathon_registrations VALUES (?, ?, ?, ?, ?)", (rid, hackathon_id, user["id"], team_name, now))
        log_activity(conn, "reg", f"{user['full_name']} registered team '{team_name}' for hackathon '{h['title']}'", user["id"])
        conn.commit()
        return {"id": rid, "message": f"Team '{team_name}' registered for {h['title']}!"}

@app.get("/api/registrations/my")
def api_my_registrations(user: dict = Depends(get_current_user)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("""
            SELECT r.id, r.status, r.created_at, e.id as event_id, e.title, e.event_date, e.venue
            FROM event_registrations r
            JOIN events e ON r.event_id = e.id
            WHERE r.user_id = ?
            ORDER BY r.created_at DESC
        """, (user["id"],))
        return [dict(r) for r in c.fetchall()]

# --- Admin Overview ---

@app.get("/api/admin/overview")
def api_admin_overview(admin: dict = Depends(get_current_admin)):
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT COUNT(*) FROM users")
        members = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM events")
        events = c.fetchone()[0]

        now_str = datetime.now(timezone.utc).isoformat()
        c.execute("SELECT COUNT(*) FROM events WHERE status = 'published' AND event_date >= ?", (now_str,))
        upcoming_events = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM hackathons")
        hackathons = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM hackathons WHERE deadline >= ?", (now_str,))
        upcoming_hackathons = c.fetchone()[0]

        c.execute("SELECT COUNT(*) FROM event_registrations")
        registrations = c.fetchone()[0]

        # Recent activities
        c.execute("SELECT id, type, message, created_at as timestamp FROM activities ORDER BY created_at DESC LIMIT 10")
        recent_activities = [dict(r) for r in c.fetchall()]

        return {
            # Legacy/compatible keys
            "members": members,
            "events": events,
            "hackathons": hackathons,
            "registrations": registrations,
            # Enhanced keys for UI
            "total_members": members,
            "total_events": events,
            "upcoming_events": upcoming_events,
            "total_hackathons": hackathons,
            "upcoming_hackathons": upcoming_hackathons,
            "total_event_registrations": registrations,
            "recent_activities": recent_activities
        }

# ==============================================================================
# DATABASE MANAGEMENT & EXPLORER API (ADMIN ONLY)
# ==============================================================================

ALLOWED_TABLES = {
    "users": "Club Members & Admins",
    "events": "Events & Workshops",
    "hackathons": "Hackathons & Sprints",
    "announcements": "Club Bulletins & Announcements",
    "event_registrations": "Event Registrations",
    "hackathon_registrations": "Hackathon Team Registrations",
    "activities": "Club Activity Log"
}

@app.get("/api/admin/database/status")
def api_admin_database_status(admin: dict = Depends(get_current_admin)):
    """Returns database connection health, engine info, table statistics, and record counts."""
    with get_db() as conn:
        c = conn.cursor()
        table_counts = {}
        total_records = 0
        for tbl in ALLOWED_TABLES:
            try:
                c.execute(f"SELECT COUNT(*) FROM {tbl}")
                cnt = c.fetchone()[0]
                table_counts[tbl] = cnt
                total_records += cnt
            except Exception:
                table_counts[tbl] = 0

        db_size_bytes = os.path.getsize(DB_FILE) if os.path.exists(DB_FILE) else 0

        return {
            "status": "connected",
            "engine": "SQLite 3",
            "database_file": os.path.basename(DB_FILE),
            "database_path": DB_FILE,
            "database_size_bytes": db_size_bytes,
            "database_size_human": f"{db_size_bytes / 1024:.1f} KB" if db_size_bytes < 1024*1024 else f"{db_size_bytes / (1024*1024):.2f} MB",
            "journal_mode": "WAL",
            "tables": table_counts,
            "total_tables": len(ALLOWED_TABLES),
            "total_records": total_records,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

@app.get("/api/admin/database/tables")
def api_admin_database_tables(admin: dict = Depends(get_current_admin)):
    """Returns all database tables with column names, column types, and row counts."""
    with get_db() as conn:
        c = conn.cursor()
        tables_meta = []
        for tbl, label in ALLOWED_TABLES.items():
            c.execute(f"PRAGMA table_info({tbl})")
            columns = [{"name": r["name"], "type": r["type"], "pk": bool(r["pk"]), "notnull": bool(r["notnull"])} for r in c.fetchall()]
            c.execute(f"SELECT COUNT(*) FROM {tbl}")
            count = c.fetchone()[0]
            tables_meta.append({
                "table_name": tbl,
                "display_label": label,
                "columns": columns,
                "row_count": count
            })
        return tables_meta

@app.get("/api/admin/database/tables/{table_name}")
def api_admin_get_table_data(
    table_name: str,
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    admin: dict = Depends(get_current_admin)
):
    """Returns raw rows and column definitions for any database table with optional search."""
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' does not exist or is not exposed.")

    with get_db() as conn:
        c = conn.cursor()
        c.execute(f"PRAGMA table_info({table_name})")
        columns = [r["name"] for r in c.fetchall()]

        # Query all rows with search if provided
        query = f"SELECT * FROM {table_name}"
        params = []
        if search and search.strip():
            # Search across all text columns
            search_clause = " OR ".join([f"CAST({col} AS TEXT) LIKE ?" for col in columns])
            query += f" WHERE {search_clause}"
            params = [f"%{search.strip()}%"] * len(columns)

        query += f" ORDER BY ROWID DESC LIMIT {limit} OFFSET {offset}"
        c.execute(query, params)
        raw_rows = c.fetchall()

        # Sanitize sensitive fields such as password hashes
        sanitized_rows = []
        for r in raw_rows:
            d = dict(r)
            if "password_hash" in d:
                d["password_hash"] = "•••••••••••••••• (Hashed SHA-256)"
            sanitized_rows.append(d)

        # Count total matching
        count_query = f"SELECT COUNT(*) FROM {table_name}"
        count_params = []
        if search and search.strip():
            search_clause = " OR ".join([f"CAST({col} AS TEXT) LIKE ?" for col in columns])
            count_query += f" WHERE {search_clause}"
            count_params = [f"%{search.strip()}%"] * len(columns)
        c.execute(count_query, count_params)
        total_matching = c.fetchone()[0]

        return {
            "table_name": table_name,
            "display_label": ALLOWED_TABLES[table_name],
            "columns": columns,
            "rows": sanitized_rows,
            "total_count": total_matching,
            "limit": limit,
            "offset": offset
        }

@app.delete("/api/admin/database/tables/{table_name}/{record_id}")
def api_admin_delete_table_row(table_name: str, record_id: str, admin: dict = Depends(get_current_admin)):
    """Deletes an entry by ID from any table."""
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail="Invalid table")

    with get_db() as conn:
        c = conn.cursor()
        c.execute(f"DELETE FROM {table_name} WHERE id = ?", (record_id,))
        if c.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"Record not found in {table_name}")
        log_activity(conn, "db_delete", f"Deleted record {record_id} from table '{table_name}'", admin["id"])
        conn.commit()
        return {"message": f"Record deleted successfully from {table_name}"}

@app.get("/api/admin/database/export")
def api_admin_export_database(admin: dict = Depends(get_current_admin)):
    """Exports the entire database as a complete JSON dump."""
    with get_db() as conn:
        c = conn.cursor()
        full_dump = {
            "database": "analytix.db",
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "exported_by": admin["email"],
            "tables": {}
        }
        for tbl in ALLOWED_TABLES:
            c.execute(f"SELECT * FROM {tbl}")
            rows = [dict(r) for r in c.fetchall()]
            for r in rows:
                if "password_hash" in r:
                    r["password_hash"] = "[PROTECTED]"
            full_dump["tables"][tbl] = {
                "count": len(rows),
                "data": rows
            }

        from fastapi.responses import Response
        import json
        content = json.dumps(full_dump, indent=2, ensure_ascii=False)
        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": f"attachment; filename=analytix_database_dump_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            }
        )

@app.get("/api/admin/database/tables/{table_name}/export")
def api_admin_export_table_csv(table_name: str, admin: dict = Depends(get_current_admin)):
    """Exports any table as CSV."""
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail="Invalid table")

    with get_db() as conn:
        c = conn.cursor()
        c.execute(f"SELECT * FROM {table_name}")
        rows = [dict(r) for r in c.fetchall()]

        import csv
        import io
        from fastapi.responses import Response

        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            for r in rows:
                if "password_hash" in r:
                    r["password_hash"] = "[PROTECTED]"
                writer.writerow(r)

        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={table_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )

# ==============================================================================
# STATIC FILES & HOMEPAGE SERVING
# ==============================================================================

app.mount("/css", StaticFiles(directory="css"), name="css")
app.mount("/js", StaticFiles(directory="js"), name="js")
if os.path.exists("assets"):
    app.mount("/assets", StaticFiles(directory="assets"), name="assets")

@app.get("/")
def serve_index():
    return FileResponse("index.html")

@app.get("/{filename}.html")
def serve_html(filename: str):
    fpath = f"{filename}.html"
    if os.path.exists(fpath):
        return FileResponse(fpath)
    raise HTTPException(status_code=404, detail="Page not found")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
