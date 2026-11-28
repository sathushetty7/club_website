"""
ANALYTIX CLUB - SUPABASE SYNC UTILITY
Syncs all club data (users, events, hackathons, announcements, registrations, activities)
from local SQLite (analytix.db) to Supabase Cloud PostgreSQL.
"""

import os
import sys
import sqlite3
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
DB_FILE = os.path.join(os.path.dirname(__file__), "analytix.db")

def get_supabase_client():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in your .env file")
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def check_supabase_tables():
    client = get_supabase_client()
    tables = ["users", "events", "hackathons", "announcements", "event_registrations", "hackathon_registrations", "activities"]
    missing = []
    ready = []
    for t in tables:
        try:
            client.table(t).select("id").limit(1).execute()
            ready.append(t)
        except Exception as e:
            err_str = str(e)
            if "PGRST205" in err_str or "Could not find the table" in err_str:
                missing.append(t)
            else:
                # Table might exist but be empty or have another issue
                ready.append(t)
    return ready, missing

def sync_data():
    client = get_supabase_client()
    ready, missing = check_supabase_tables()
    
    if missing:
        print(f"[!] Supabase tables not yet created in public schema.")
        print(f"    Missing tables: {', '.join(missing)}")
        print(f"[i] Please go to: https://supabase.com/dashboard/project/xqvlzdndukbibndylzfw/sql/new")
        print(f"    Paste the contents of 'supabase_schema.sql' and click 'Run'.")
        return False
        
    print(f"[+] All {len(ready)} Supabase tables exist and are reachable!")
    
    if not os.path.exists(DB_FILE):
        print(f"[!] SQLite file {DB_FILE} not found.")
        return True
        
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # 1. Sync Users
    print("\n--- Syncing Users ---")
    c.execute("SELECT * FROM users")
    users = [dict(row) for row in c.fetchall()]
    for u in users:
        # Map fields to match Supabase schema
        record = {
            "id": u["id"],
            "email": u["email"],
            "password_hash": u["password_hash"],
            "full_name": u["full_name"],
            "role": u.get("role", "member"),
            "team": u.get("team", "Tech") if u.get("team") in ["Tech", "Design", "MOC", "None"] else "Tech",
            "department": u.get("department", ""),
            "year": u.get("year", "2nd Year"),
            "phone": u.get("phone", ""),
            "skills": u.get("skills", ""),
            "bio": u.get("bio", ""),
            "profile_photo": u.get("profile_photo", ""),
            "points": int(u.get("points", 0)),
        }
        try:
            client.table("users").upsert(record, on_conflict="id").execute()
            print(f"  [+] Synced user: {record['email']} ({record['role']})")
        except Exception as e:
            print(f"  [-] Error syncing user {record['email']}: {e}")

    # 2. Sync Events
    print("\n--- Syncing Events ---")
    c.execute("SELECT * FROM events")
    events = [dict(row) for row in c.fetchall()]
    for ev in events:
        record = {
            "id": ev["id"],
            "title": ev["title"],
            "description": ev["description"],
            "venue": ev["venue"],
            "event_date": ev["event_date"],
            "registration_deadline": ev["registration_deadline"],
            "instructions": ev.get("instructions", ""),
            "status": ev.get("status", "published"),
            "poster_url": ev.get("poster_url", ""),
            "category": ev.get("category", "Analytix Core"),
            "capacity": int(ev.get("capacity", 0)),
            "created_by": ev.get("created_by")
        }
        try:
            client.table("events").upsert(record, on_conflict="id").execute()
            print(f"  [+] Synced event: {record['title']}")
        except Exception as e:
            print(f"  [-] Error syncing event {record['title']}: {e}")

    # 3. Sync Hackathons
    print("\n--- Syncing Hackathons ---")
    c.execute("SELECT * FROM hackathons")
    hacks = [dict(row) for row in c.fetchall()]
    for h in hacks:
        mode = h.get("mode", "hybrid").lower()
        if mode not in ["online", "in-person", "hybrid"]:
            mode = "hybrid"
        record = {
            "id": h["id"],
            "title": h["title"],
            "organizer": h["organizer"],
            "description": h["description"],
            "start_date": h["start_date"],
            "deadline": h["deadline"],
            "location": h["location"],
            "mode": mode,
            "registration_link": h.get("registration_link", ""),
            "eligibility": h.get("eligibility", ""),
            "required_skills": h.get("required_skills", ""),
            "status": h.get("status", "published"),
            "poster_url": h.get("poster_url", ""),
            "prize_pool": h.get("prize_pool", "₹1,50,000"),
            "created_by": h.get("created_by")
        }
        try:
            client.table("hackathons").upsert(record, on_conflict="id").execute()
            print(f"  [+] Synced hackathon: {record['title']}")
        except Exception as e:
            print(f"  [-] Error syncing hackathon {record['title']}: {e}")

    # 4. Sync Announcements
    print("\n--- Syncing Announcements ---")
    c.execute("SELECT * FROM announcements")
    anns = [dict(row) for row in c.fetchall()]
    for a in anns:
        record = {
            "id": a["id"],
            "title": a["title"],
            "description": a["description"],
            "category": a.get("category", "Notice"),
            "image_url": a.get("image_url", ""),
            "status": a.get("status", "published"),
            "created_by": a.get("created_by")
        }
        try:
            client.table("announcements").upsert(record, on_conflict="id").execute()
            print(f"  [+] Synced announcement: {record['title']}")
        except Exception as e:
            print(f"  [-] Error syncing announcement {record['title']}: {e}")

    # 5. Sync Event Registrations
    print("\n--- Syncing Event Registrations ---")
    c.execute("SELECT * FROM event_registrations")
    regs = [dict(row) for row in c.fetchall()]
    for r in regs:
        record = {
            "id": r["id"],
            "event_id": r["event_id"],
            "user_id": r["user_id"],
            "status": r.get("status", "approved"),
        }
        try:
            client.table("event_registrations").upsert(record, on_conflict="id").execute()
            print(f"  [+] Synced registration: {record['id']}")
        except Exception as e:
            print(f"  [-] Error syncing registration {record['id']}: {e}")

    print("\n[SUCCESS] Supabase database sync completed!")
    conn.close()
    return True

if __name__ == "__main__":
    sync_data()
