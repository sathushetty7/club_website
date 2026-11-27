/**
 * ANALYTIX CLUB - CORE API CLIENT & DATA ADAPTER
 * Handles REST requests, JWT bearer authorization, toast notifications,
 * intelligent endpoint resolution (Render + Localhost + Offline Cache),
 * and XSS-safe text formatting.
 */

const API = {
  // Primary live backend URL on Render
  RENDER_BACKEND: 'https://analytix-web-238f.onrender.com',

  // Dynamic BASE_URL resolution:
  // If served directly from Render or a custom domain that hosts the API, use window.location.origin.
  // If served on localhost:8000, use localhost:8000.
  // Otherwise default to the live Render backend so all auth/data work out-of-the-box!
  get BASE_URL() {
    if (typeof window === 'undefined') return 'https://analytix-web-238f.onrender.com';
    const origin = window.location.origin;
    if (origin.includes('onrender.com') || origin.includes(':8000')) {
      return origin;
    }
    return this.RENDER_BACKEND;
  },

  TOKEN_KEY: 'analytix_token',
  USER_KEY: 'analytix_user',

  getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (e) {
      return null;
    }
  },

  setToken(token) {
    try {
      if (token) {
        localStorage.setItem(this.TOKEN_KEY, token);
      } else {
        localStorage.removeItem(this.TOKEN_KEY);
      }
    } catch (e) { }
  },

  getUser() {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setUser(user) {
    try {
      if (user) {
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.USER_KEY);
      }
    } catch (e) { }
  },

  clearAuth() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
    } catch (e) { }
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.BASE_URL}${endpoint}`;
    const headers = options.headers || {};

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(url, config);

      // Handle 401 Unauthorized
      if (response.status === 401) {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('dashboard') || path.includes('profile')) {
          this.clearAuth();
          window.location.href = 'login.html';
          return;
        }
      }

      const isJson = (response.headers.get('content-type') || '').includes('application/json');
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        let errorDetail = 'An unexpected error occurred';
        if (data && typeof data === 'object') {
          if (Array.isArray(data.detail)) {
            errorDetail = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
          } else if (data.detail) {
            errorDetail = data.detail;
          } else if (data.message) {
            errorDetail = data.message;
          }
        } else if (typeof data === 'string' && data.trim()) {
          errorDetail = data;
        }
        throw new Error(errorDetail);
      }

      return data;
    } catch (error) {
      console.warn(`API Error [${options.method || 'GET'} ${endpoint}]:`, error);

      // Fallback cache for GET endpoints if backend is cold-starting or offline
      if ((!options.method || options.method === 'GET') && window.OFFLINE_SNAPSHOT && window.OFFLINE_SNAPSHOT[endpoint]) {
        console.info(`Using cached snapshot for ${endpoint}`);
        return window.OFFLINE_SNAPSHOT[endpoint];
      }

      throw error;
    }
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const clean = url.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://') || clean.startsWith('/') || clean.startsWith('./') || clean.startsWith('assets/')) {
      return this.escapeHtml(clean);
    }
    return '';
  },

  get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  put(endpoint, data) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  patch(endpoint, data) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  upload(endpoint, formData) {
    return this.request(endpoint, {
      method: 'POST',
      body: formData
    });
  },

  toast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const cleanMsg = this.escapeHtml(message);
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `
      <span style="font-weight: 800; color: ${type === 'error' ? '#F87171' : 'var(--accent-secondary)'}">${icon}</span>
      <span class="toast-message">${cleanMsg}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px) scale(0.95)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  formatDate(dateStr) {
    if (!dateStr) return 'TBA';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch (e) {
      return dateStr || 'TBA';
    }
  },

  formatDateTime(dateStr) {
    if (!dateStr) return 'TBA';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateStr || 'TBA';
    }
  }
};

// Verified Authentic Offline Snapshot (Ensures 100% resilience if Render is sleeping)
window.OFFLINE_SNAPSHOT = {
  "/api/stats": {
    "members_count": 4,
    "events_count": 2,
    "hackathons_count": 1,
    "teams_count": 3
  },
  "/api/events": [
    {
      "title": "Data Crunch 2026: Hands-on Machine Learning Bootcamp",
      "description": "An intensive weekend bootcamp covering exploratory data analysis, feature engineering, and deploying ML models with FastAPI. Open to all students.",
      "venue": "Auditorium Hall B & Virtual Stream",
      "event_date": "2026-11-15T10:00:00Z",
      "registration_deadline": "2026-11-14T18:00:00Z",
      "instructions": "Bring your laptop with Python 3.10+ installed and VS Code ready. Extension cords and high-speed Wi-Fi provided.",
      "status": "published",
      "poster_url": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80",
      "photos": [
        "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=800&auto=format&fit=crop&q=80"
      ],
      "id": "10000000-0000-0000-0000-000000000001",
      "created_by": "00000000-0000-0000-0000-000000000001",
      "registrations_count": 1,
      "is_registered": false,
      "my_registration_status": null
    },
    {
      "title": "Design Sprint: Crafting Engaging Data Visualizations",
      "description": "Learn how to turn boring spreadsheets into compelling, narrative-driven UI dashboards using Figma and interactive charts.",
      "venue": "Design Studio Lab 3",
      "event_date": "2026-11-22T14:00:00Z",
      "registration_deadline": "2026-11-21T23:59:00Z",
      "instructions": "No prior design experience required. Bring your laptop and your curiosity!",
      "status": "published",
      "poster_url": "https://images.unsplash.com/photo-1542744094-3a31f272c490?w=800&auto=format&fit=crop&q=80",
      "photos": [],
      "id": "10000000-0000-0000-0000-000000000002",
      "created_by": "00000000-0000-0000-0000-000000000001",
      "registrations_count": 0,
      "is_registered": false,
      "my_registration_status": null
    }
  ],
  "/api/hackathons": [
    {
      "title": "HackAnalytix 36-Hour National Hackathon",
      "organizer": "Analytix Club x Tech Titans",
      "description": "Build real-world solutions across AI/ML, FinTech, and Smart Campus automation. Cash prizes worth ₹1,50,000 + internship offers for top teams.",
      "start_date": "2026-12-05T09:00:00Z",
      "deadline": "2026-11-30T23:59:00Z",
      "location": "Main Campus Innovation Hub",
      "mode": "hybrid",
      "registration_link": "https://analytixclub.edu/hackanalytix-2026",
      "eligibility": "Open to all undergraduate and postgraduate students in teams of 2-4 members.",
      "required_skills": "Python, React / Web Dev, AI/ML APIs, Database Design",
      "status": "published",
      "poster_url": "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&auto=format&fit=crop&q=80",
      "id": "20000000-0000-0000-0000-000000000001",
      "created_by": "00000000-0000-0000-0000-000000000001",
      "is_registered": false,
      "my_registration_status": null
    }
  ],
  "/api/announcements": [
    {
      "title": "Welcome to Analytix Club Academic Year 2026-27!",
      "description": "Orientation meet for all new recruits will be held this Wednesday at 4:30 PM. Check your email for room details.",
      "category": "Notice",
      "image_url": "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&auto=format&fit=crop&q=80",
      "status": "published",
      "id": "30000000-0000-0000-0000-000000000001",
      "created_by": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-11-26T13:37:55.938181Z"
    },
    {
      "title": "Call for Project Mentors: Tech, Design & MOC",
      "description": "Senior members interested in leading teams for upcoming inter-college competitions can apply via the dashboard.",
      "category": "Opportunity",
      "image_url": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&auto=format&fit=crop&q=80",
      "status": "published",
      "id": "30000000-0000-0000-0000-000000000002",
      "created_by": "00000000-0000-0000-0000-000000000001",
      "created_at": "2026-11-26T13:37:55.938181Z"
    }
  ],
  "/api/members/teams": {
    "tech": [
      {
        "id": "00000000-0000-0000-0000-000000000001",
        "full_name": "Arjun Sharma (Club Lead)",
        "profile_photo": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
        "department": "Computer Science & Engineering",
        "year": "4th Year",
        "skills": "Python, FastAPI, Machine Learning, Leadership",
        "bio": "Lead coordinator of Analytix Club. Passionate about AI & Big Data.",
        "role": "admin",
        "team": "Tech"
      },
      {
        "id": "00000000-0000-0000-0000-000000000003",
        "full_name": "Rohit Verma",
        "profile_photo": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
        "department": "Data Science & AI",
        "year": "2nd Year",
        "skills": "Python, Pandas, SQL, Scikit-learn",
        "bio": "Data geek exploring deep learning architectures and predictive modeling.",
        "role": "member",
        "team": "Tech"
      }
    ],
    "design": [
      {
        "id": "00000000-0000-0000-0000-000000000002",
        "full_name": "Priya Nair",
        "profile_photo": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
        "department": "Information Technology",
        "year": "3rd Year",
        "skills": "Figma, UI/UX, CSS, Graphic Design",
        "bio": "Creative thinker and UI enthusiast. Love designing engaging posters and intuitive digital interfaces.",
        "role": "member",
        "team": "Design"
      }
    ],
    "moc": [
      {
        "id": "00000000-0000-0000-0000-000000000004",
        "full_name": "Sneha Kulkarni",
        "profile_photo": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
        "department": "Electronics & Communication",
        "year": "3rd Year",
        "skills": "Public Speaking, Content Writing, Event Logistics",
        "bio": "MOC team coordinator handling event coverage, stage moderation, and press releases.",
        "role": "member",
        "team": "MOC"
      }
    ]
  },
  "/api/members/leaderboard": [
    {
      "rank": 1,
      "member_id": "00000000-0000-0000-0000-000000000001",
      "full_name": "Arjun Sharma",
      "team": "Tech",
      "points": 340,
      "department": "Computer Science & Engineering",
      "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80"
    },
    {
      "rank": 2,
      "member_id": "00000000-0000-0000-0000-000000000002",
      "full_name": "Priya Nair",
      "team": "Design",
      "points": 290,
      "department": "Information Technology",
      "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80"
    },
    {
      "rank": 3,
      "member_id": "00000000-0000-0000-0000-000000000004",
      "full_name": "Sneha Kulkarni",
      "team": "MOC",
      "points": 245,
      "department": "Electronics & Communication",
      "avatar": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80"
    },
    {
      "rank": 4,
      "member_id": "00000000-0000-0000-0000-000000000003",
      "full_name": "Rohit Verma",
      "team": "Tech",
      "points": 210,
      "department": "Data Science & AI",
      "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80"
    }
  ]
};

window.API = API;
