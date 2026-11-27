/**
 * ANALYTIX CLUB - PUBLIC & MEMBER CONTROLLER
 * Manages Dynamic Events, Hackathons, Announcements, Leaderboard,
 * and MVJCE-Exact Navigation & Theme Toggling.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Navigation Menu (Floating dropdown matching MVJCE spec)
  initNavigationDropdown();

  // 2. Initialize Theme Toggle (Default to dark theme #080D1A)
  initThemeToggle();

  // 3. User Authentication Sync
  let currentUser = null;
  const token = API.getToken();
  if (token) {
    try {
      currentUser = await API.get('/api/auth/me');
      if (window.Auth && typeof Auth.updateNavbarUser === 'function') {
        Auth.updateNavbarUser(currentUser);
      }
    } catch (e) {
      API.clearAuth();
    }
  }

  // 4. Page-specific Dynamic Content Loader
  const path = window.location.pathname.toLowerCase();
  if (path.includes('events.html') || path.endsWith('/events')) {
    loadPublicEvents(currentUser);
  } else if (path.includes('hackathons.html') || path.endsWith('/hackathons')) {
    loadPublicHackathons(currentUser);
  } else if (path.includes('announcements.html') || path.endsWith('/announcements')) {
    loadPublicAnnouncements();
  } else if (path.includes('leaderboard.html') || path.endsWith('/leaderboard')) {
    loadLeaderboardPage();
  } else if (path.includes('index.html') || path === '/' || path.endsWith('/')) {
    loadLandingPageData(currentUser);
  }
});

/**
 * Initializes MVJCE Navigation Dropdown
 */
function initNavigationDropdown() {
  const toggleBtn = document.getElementById('nav-toggle-btn') || document.querySelector('.nav-toggle-btn');
  const dropdown = document.getElementById('nav-dropdown') || document.querySelector('.nav-dropdown');

  if (toggleBtn && dropdown) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      toggleBtn.classList.toggle('active', isOpen);
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
        dropdown.classList.remove('open');
        toggleBtn.classList.remove('active');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dropdown.classList.contains('open')) {
        dropdown.classList.remove('open');
        toggleBtn.classList.remove('active');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

/**
 * Initializes Dark / Light Theme Toggle
 */
function initThemeToggle() {
  const savedTheme = (() => {
    try { return localStorage.getItem('analytix-theme'); } catch (e) { return null; }
  })();
  if (savedTheme === 'light' || savedTheme === 'dark') {
    document.documentElement.dataset.theme = savedTheme;
  }

  const updateToggleIcon = (btn, theme) => {
    if (!btn) return;
    if (theme === 'light') {
      // Moon icon (click to switch to dark)
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>`;
      btn.title = 'Switch to Dark Mode';
    } else {
      // Sun icon (click to switch to light)
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;
      btn.title = 'Switch to Light Mode';
    }
  };

  const themeToggle = document.getElementById('theme-toggle-btn');
  if (themeToggle) {
    updateToggleIcon(themeToggle, document.documentElement.dataset.theme || 'dark');
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.dataset.theme || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      updateToggleIcon(themeToggle, next);
      try {
        localStorage.setItem('analytix-theme', next);
      } catch (e) { }
    });
  }
}

/**
 * Landing Page Dynamic Sections
 */
async function loadLandingPageData(currentUser) {
  // 1. Club Pulse Stats
  try {
    const stats = await API.get('/api/stats');
    const mEl = document.getElementById('stat-members-count');
    if (mEl) mEl.textContent = stats.members_count;
    const eEl = document.getElementById('stat-events-count');
    if (eEl) eEl.textContent = stats.events_count;
    const hEl = document.getElementById('stat-hackathons-count');
    if (hEl) hEl.textContent = stats.hackathons_count;
    const tEl = document.getElementById('stat-teams-count');
    if (tEl) tEl.textContent = stats.teams_count || '3';
  } catch (e) {
    console.debug('Stats load error:', e);
  }

  // 2. Merit Leaderboard
  const leaderboardBox = document.getElementById('home-leaderboard-rows');
  if (leaderboardBox) {
    try {
      let leaderboard = [];
      try {
        leaderboard = await API.get('/api/members/leaderboard');
      } catch (e) {
        // Fallback to snapshot if needed
        leaderboard = window.OFFLINE_SNAPSHOT['/api/members/leaderboard'] || [];
      }

      if (leaderboard && leaderboard.length) {
        leaderboardBox.innerHTML = leaderboard.slice(0, 5).map((row, idx) => {
          const rank = row.rank || (idx + 1);
          const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
          const cleanName = API.escapeHtml(row.full_name);
          const cleanTeam = API.escapeHtml(row.team ? `${row.team} Team` : 'Analytix Member');
          const cleanDept = API.escapeHtml(row.department || '');
          const avatarUrl = API.sanitizeUrl(row.avatar || row.profile_photo) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
          const points = row.points || 0;

          return `
            <div class="leaderboard-row">
              <span class="leaderboard-rank ${rankClass}">${rank}</span>
              <div class="leaderboard-user-info">
                <img src="${avatarUrl}" alt="${cleanName}" class="leaderboard-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';">
                <div class="leaderboard-names">
                  <span class="leaderboard-member-name">${cleanName}</span>
                  <span class="leaderboard-member-dept">${cleanTeam}${cleanDept ? ` · ${cleanDept}` : ''}</span>
                </div>
              </div>
              <span class="leaderboard-points">${points} <span>pts</span></span>
            </div>
          `;
        }).join('');
      } else {
        leaderboardBox.innerHTML = `
          <div style="padding: 24px; text-align: center; color: var(--muted); font-size: 13px;">
            Leaderboard standings are being tallied for the current sprint.
          </div>
        `;
      }
    } catch (e) {
      console.error('Leaderboard error:', e);
    }
  }

  // 3. Upcoming Events Preview
  const eventsBox = document.getElementById('home-events-grid');
  if (eventsBox) {
    try {
      const events = await API.get('/api/events');
      const upcoming = events.slice(0, 2);
      if (upcoming.length) {
        eventsBox.innerHTML = upcoming.map(ev => {
          const cleanTitle = API.escapeHtml(ev.title);
          const cleanDesc = API.escapeHtml(ev.description);
          const cleanVenue = API.escapeHtml(ev.venue);
          const posterUrl = API.sanitizeUrl(ev.poster_url) || 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800';

          return `
            <div class="event-item-card">
              <div class="event-item-thumb">
                <img src="${posterUrl}" 
                     class="event-item-img" 
                     alt="${cleanTitle}"
                     onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800';">
                <span class="event-item-badge">${API.escapeHtml(ev.status || 'Active')}</span>
              </div>
              <div class="event-item-body">
                <div class="event-item-meta">
                  <span>📅 ${API.formatDate(ev.event_date)}</span>
                  <span>📍 ${cleanVenue}</span>
                </div>
                <h3 class="event-item-title">${cleanTitle}</h3>
                <p class="event-item-desc">${cleanDesc}</p>
                <div class="event-item-footer">
                  <span class="event-item-deadline">Deadline: ${API.formatDate(ev.registration_deadline)}</span>
                  <a href="events.html" class="btn-sm-primary">View & Register →</a>
                </div>
              </div>
            </div>
          `;
        }).join('');
      } else {
        eventsBox.innerHTML = `<div class="state-box" style="grid-column: 1/-1;">Check back soon for upcoming club workshops!</div>`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  // 4. Announcements Preview
  const announceBox = document.getElementById('home-announcements-list');
  if (announceBox) {
    try {
      const notices = await API.get('/api/announcements');
      const topNotices = notices.slice(0, 2);
      if (topNotices.length) {
        announceBox.innerHTML = topNotices.map(a => {
          const cleanTitle = API.escapeHtml(a.title);
          const cleanDesc = API.escapeHtml(a.description);
          const cleanCat = API.escapeHtml(a.category || 'Notice');

          return `
            <div class="announcement-item-card">
              <div class="announcement-icon-wrap">📢</div>
              <div class="announcement-main">
                <div class="announcement-top-row">
                  <h4 class="announcement-title-txt">${cleanTitle}</h4>
                  <span class="skill-tag">${cleanCat}</span>
                  <span class="announcement-date-txt">· ${API.formatDate(a.created_at)}</span>
                </div>
                <p class="announcement-desc-txt">${cleanDesc}</p>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (e) {
      console.error(e);
    }
  }
}

/**
 * Public Events Page
 */
async function loadPublicEvents(currentUser) {
  const container = document.getElementById('events-grid');
  if (!container) return;
  container.innerHTML = `
    <div class="state-box" style="grid-column: 1/-1;">
      <div class="state-icon">⏳</div>
      <p>Loading scheduled club events & workshops...</p>
    </div>
  `;

  try {
    const events = await API.get('/api/events');
    if (!events || !events.length) {
      container.innerHTML = `
        <div class="state-box" style="grid-column: 1/-1;">
          <div class="state-icon">📅</div>
          <h3 style="margin-bottom: 8px; color: #FFFFFF;">No Events Currently Scheduled</h3>
          <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto 20px;">
            The club coordinators are actively organizing upcoming bootcamps and workshops. Check back soon!
          </p>
          <a href="index.html" class="btn-sm-outline">Return to Homepage</a>
        </div>
      `;
      return;
    }

    container.innerHTML = events.map(ev => {
      const cleanTitle = API.escapeHtml(ev.title);
      const cleanDesc = API.escapeHtml(ev.description);
      const cleanVenue = API.escapeHtml(ev.venue);
      const cleanInstructions = API.escapeHtml(ev.instructions || '');
      const posterUrl = API.sanitizeUrl(ev.poster_url) || 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800';

      return `
        <div class="event-item-card">
          <div class="event-item-thumb">
            <img src="${posterUrl}" 
                 class="event-item-img" 
                 alt="${cleanTitle}"
                 onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800';">
            <span class="event-item-badge">${API.escapeHtml(ev.status || 'Active')}</span>
          </div>
          <div class="event-item-body">
            <div class="event-item-meta">
              <span>📅 ${API.formatDate(ev.event_date)}</span>
              <span>📍 ${cleanVenue}</span>
            </div>
            <h3 class="event-item-title">${cleanTitle}</h3>
            <p class="event-item-desc">${cleanDesc}</p>
            ${cleanInstructions ? `<div style="font-size: 11.5px; color: var(--muted); margin-bottom: 12px;"><strong>Instructions:</strong> ${cleanInstructions}</div>` : ''}
            <div class="event-item-footer">
              <span class="event-item-deadline">Deadline: ${API.formatDate(ev.registration_deadline)}</span>
              ${currentUser
          ? (ev.is_registered
            ? `<span class="status-pill status-${ev.my_registration_status || 'approved'}">Registered (${API.escapeHtml(ev.my_registration_status || 'confirmed')})</span>`
            : `<button onclick="handleEventRegister('${ev.id}')" class="btn-sm-primary">Register Now</button>`
          )
          : `<a href="login.html" class="btn-sm-primary">Sign In to Register</a>`
        }
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div class="state-box" style="grid-column: 1/-1; border-color: rgba(239, 68, 68, 0.3);">
        <p style="color: #F87171; font-weight: 700; margin-bottom: 8px;">Failed to load events.</p>
        <p style="color: var(--text-secondary); font-size: 13px;">${API.escapeHtml(err.message)}</p>
        <button onclick="window.location.reload()" class="btn-sm-outline" style="margin-top: 14px;">Retry</button>
      </div>
    `;
  }
}

async function handleEventRegister(eventId) {
  try {
    await API.post(`/api/registrations/events/${eventId}`, {});
    API.toast('Successfully registered for event!', 'success');
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    API.toast(err.message || 'Registration failed', 'error');
  }
}

/**
 * Public Hackathons Page
 */
async function loadPublicHackathons(currentUser) {
  const container = document.getElementById('hackathons-grid');
  if (!container) return;
  container.innerHTML = `
    <div class="state-box" style="grid-column: 1/-1;">
      <div class="state-icon">⏳</div>
      <p>Loading hackathons & sprints...</p>
    </div>
  `;

  try {
    const hackathons = await API.get('/api/hackathons');
    if (!hackathons || !hackathons.length) {
      container.innerHTML = `
        <div class="state-box" style="grid-column: 1/-1;">
          <div class="state-icon">🚀</div>
          <h3 style="margin-bottom: 8px; color: #FFFFFF;">No Active Hackathons Listed</h3>
          <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto 20px;">
            External competitions and internal coding arenas will be listed here as soon as registrations open.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = hackathons.map(h => {
      const cleanTitle = API.escapeHtml(h.title);
      const cleanOrganizer = API.escapeHtml(h.organizer);
      const cleanDesc = API.escapeHtml(h.description);
      const cleanLocation = API.escapeHtml(h.location);
      const cleanEligibility = API.escapeHtml(h.eligibility);
      const cleanSkills = API.escapeHtml(h.required_skills || '');
      const posterUrl = API.sanitizeUrl(h.poster_url) || 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800';

      return `
        <div class="event-item-card">
          <div class="event-item-thumb">
            <img src="${posterUrl}" 
                 class="event-item-img" 
                 alt="${cleanTitle}"
                 onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800';">
            <span class="event-item-badge">${API.escapeHtml(h.mode ? h.mode.toUpperCase() : 'HYBRID')}</span>
          </div>
          <div class="event-item-body">
            <div class="event-item-meta">
              <span>📅 Starts: ${API.formatDate(h.start_date)}</span>
              <span>📍 ${cleanLocation}</span>
            </div>
            <h3 class="event-item-title">${cleanTitle}</h3>
            <div style="font-size: 12px; font-weight: 600; color: var(--accent-secondary); margin-bottom: 8px;">Organized by ${cleanOrganizer}</div>
            <p class="event-item-desc">${cleanDesc}</p>
            
            <div style="margin-bottom: 14px; font-size: 11.5px; color: var(--muted);">
              <div><strong>Eligibility:</strong> ${cleanEligibility}</div>
              ${cleanSkills ? `<div><strong>Skills:</strong> ${cleanSkills}</div>` : ''}
            </div>

            <div class="event-item-footer">
              <span class="event-item-deadline">Deadline: ${API.formatDate(h.deadline)}</span>
              <div style="display: flex; gap: 8px;">
                ${h.registration_link ? `<a href="${encodeURI(h.registration_link)}" target="_blank" rel="noopener noreferrer" class="btn-sm-outline">Details ↗</a>` : ''}
                ${currentUser
          ? (h.is_registered
            ? `<span class="status-pill status-approved">Applied</span>`
            : `<button onclick="handleHackathonApply('${h.id}')" class="btn-sm-primary">Apply Team</button>`
          )
          : `<a href="login.html" class="btn-sm-primary">Sign In</a>`
        }
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div class="state-box" style="grid-column: 1/-1; border-color: rgba(239, 68, 68, 0.3);">
        <p style="color: #F87171; font-weight: 700; margin-bottom: 8px;">Failed to load hackathons.</p>
        <p style="color: var(--text-secondary); font-size: 13px;">${API.escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

async function handleHackathonApply(hackathonId) {
  const teamName = prompt('Enter your team or project group name (optional):', 'Analytix Innovators');
  if (teamName === null) return;

  try {
    await API.post(`/api/registrations/hackathons/${hackathonId}`, { team_name: teamName });
    API.toast('Hackathon application submitted successfully!', 'success');
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    API.toast(err.message || 'Application failed', 'error');
  }
}

/**
 * Public Announcements Page
 */
async function loadPublicAnnouncements() {
  const container = document.getElementById('announcements-container');
  if (!container) return;
  container.innerHTML = `
    <div class="state-box">
      <div class="state-icon">⏳</div>
      <p>Loading official notices & circulars...</p>
    </div>
  `;

  try {
    const list = await API.get('/api/announcements');
    if (!list || !list.length) {
      container.innerHTML = `
        <div class="state-box">
          <div class="state-icon">📢</div>
          <h3 style="margin-bottom: 8px; color: #FFFFFF;">No Notices Currently Published</h3>
          <p style="color: var(--text-secondary);">Important club notices and recruitment calls will appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(a => {
      const cleanTitle = API.escapeHtml(a.title);
      const cleanCategory = API.escapeHtml(a.category || 'Notice');
      const cleanDesc = API.escapeHtml(a.description);
      const imageUrl = API.sanitizeUrl(a.image_url);

      return `
        <div class="announcement-item-card">
          <div class="announcement-icon-wrap">📢</div>
          <div class="announcement-main">
            <div class="announcement-top-row">
              <h3 class="announcement-title-txt">${cleanTitle}</h3>
              <span class="skill-tag">${cleanCategory}</span>
              <span class="announcement-date-txt">· ${API.formatDate(a.created_at)}</span>
            </div>
            <p class="announcement-desc-txt" style="margin-top: 6px;">${cleanDesc}</p>
            ${imageUrl ? `<img src="${imageUrl}" style="max-width: 480px; border-radius: 12px; margin-top: 14px; width: 100%; object-fit: cover; border: 1px solid var(--line);" alt="${cleanTitle}" onerror="this.style.display='none'">` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `
      <div class="state-box" style="border-color: rgba(239, 68, 68, 0.3);">
        <p style="color: #F87171; font-weight: 700;">Failed to load announcements: ${API.escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

/**
 * Dedicated Leaderboard Page
 */
async function loadLeaderboardPage() {
  const container = document.getElementById('leaderboard-page-rows');
  if (!container) return;

  try {
    let leaderboard = [];
    try {
      leaderboard = await API.get('/api/members/leaderboard');
    } catch (e) {
      leaderboard = window.OFFLINE_SNAPSHOT['/api/members/leaderboard'] || [];
    }

    if (leaderboard && leaderboard.length) {
      container.innerHTML = leaderboard.map((row, idx) => {
        const rank = row.rank || (idx + 1);
        const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
        const cleanName = API.escapeHtml(row.full_name);
        const cleanTeam = API.escapeHtml(row.team ? `${row.team} Team` : 'Club Member');
        const cleanDept = API.escapeHtml(row.department || '');
        const avatarUrl = API.sanitizeUrl(row.avatar || row.profile_photo) || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
        const points = row.points || 0;

        return `
          <div class="leaderboard-row">
            <span class="leaderboard-rank ${rankClass}">${rank}</span>
            <div class="leaderboard-user-info">
              <img src="${avatarUrl}" alt="${cleanName}" class="leaderboard-avatar" onerror="this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';">
              <div class="leaderboard-names">
                <span class="leaderboard-member-name">${cleanName}</span>
                <span class="leaderboard-member-dept">${cleanTeam}${cleanDept ? ` · ${cleanDept}` : ''}</span>
              </div>
            </div>
            <span class="leaderboard-points">${points} <span>pts</span></span>
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    console.error('Leaderboard page error:', e);
  }
}
