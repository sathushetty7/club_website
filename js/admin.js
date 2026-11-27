/**
 * ANALYTIX CAMPUS - KINOBI-STYLE CLUB ADMIN PORTAL SCRIPT
 * Complete operational orchestration:
 * - Admin RBAC Guard & navigation
 * - Event, Hackathon, Member, Announcement, and Application CRUD
 * - Real-time live filtering, search, and CSV export
 * - 3-dots action dropdown menus and modal workflows
 */

let currentAdmin = null;
let cachedEvents = [];
let cachedMembers = [];
let cachedHackathons = [];
let cachedRegistrations = [];
let cachedAnnouncements = [];
let eventsSortAsc = true;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce Strict Admin RBAC Guard
  currentAdmin = await Auth.requireAdmin();
  if (!currentAdmin) return;
  document.body.style.visibility = 'visible';

  // 2. Setup navigation and listeners
  setupKinobiNavigation();
  setupGlobalClickDismissal();

  // 3. Load default view (Featured Club Events)
  switchKinobiTab('events');
});

/**
 * Handle navigation switching across Kinobi tabs
 */
function setupKinobiNavigation() {
  const navItems = document.querySelectorAll('.kinobi-nav-item[data-tab]');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = item.getAttribute('data-tab');
      switchKinobiTab(tabName);
    });
  });

  // Mobile menu toggle
  const toggleBtn = document.getElementById('kinobi-menu-toggle');
  const sidebar = document.querySelector('.kinobi-sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

function toggleNavGroup(headerEl) {
  const group = headerEl.closest('.kinobi-nav-group');
  if (group) group.classList.toggle('collapsed');
}

function switchKinobiTab(tabName) {
  // Update sidebar active link
  document.querySelectorAll('.kinobi-nav-item').forEach(i => i.classList.remove('active'));
  const activeLink = document.querySelector(`.kinobi-nav-item[data-tab="${tabName}"]`);
  if (activeLink) activeLink.classList.add('active');

  // Update content section
  document.querySelectorAll('.kinobi-section').forEach(s => s.classList.remove('active'));
  const activeSection = document.getElementById(`section-${tabName}`);
  if (activeSection) activeSection.classList.add('active');

  // Breadcrumbs title update
  const titleMap = {
    overview: 'Club Executive Overview',
    members: 'Club Members Directory',
    openings: 'Club Openings & Roles',
    applications: 'Club Applications & Registrations',
    events: 'Featured Club Events',
    hackathons: 'Featured Club Hackathons',
    announcements: 'Official Club Bulletins',
    leaderboard: 'Club Merit Leaderboard',
    settings: 'Club Settings & Profile'
  };
  const pageTitle = document.getElementById('kinobi-page-title');
  if (pageTitle) pageTitle.textContent = titleMap[tabName] || 'Admin Portal';

  // Close mobile sidebar if open
  const sidebar = document.querySelector('.kinobi-sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Load section-specific data
  if (tabName === 'events') loadEvents();
  else if (tabName === 'members') loadMembers();
  else if (tabName === 'hackathons') loadHackathons();
  else if (tabName === 'applications') loadRegistrations();
  else if (tabName === 'announcements') loadAnnouncements();
  else if (tabName === 'leaderboard') loadLeaderboard();
  else if (tabName === 'overview') loadOverview();
  else if (tabName === 'settings') loadAdminProfile();
}

/**
 * Close any open 3-dots dropdown when clicking outside
 */
function setupGlobalClickDismissal() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cell-action-menu-wrap')) {
      document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
    }
    if (!e.target.closest('.kinobi-dropdown-container')) {
      const filterPop = document.getElementById('events-filter-popover');
      if (filterPop) filterPop.classList.remove('open');
    }
  });
}

function toggleDotDropdown(id, event) {
  event.stopPropagation();
  const menu = document.getElementById(`dropdown-${id}`);
  const wasOpen = menu ? menu.classList.contains('open') : false;
  document.querySelectorAll('.dot-dropdown.open').forEach(d => d.classList.remove('open'));
  if (menu && !wasOpen) {
    menu.classList.add('open');
  }
}

/* =============================================================================
   1. FEATURED CLUB EVENTS (EXACT REFERENCE REPLICA)
   ============================================================================= */

async function loadEvents() {
  const tbody = document.getElementById('kinobi-events-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell">Loading featured club events...</td></tr>`;

  try {
    const events = await API.get('/api/events');
    cachedEvents = events || [];

    // Calculate metrics strip
    const totalCount = cachedEvents.length;
    const now = new Date();
    const upcomingCount = cachedEvents.filter(e => new Date(e.event_date) >= now || e.status === 'published').length;
    const regCount = cachedEvents.reduce((sum, e) => sum + (e.registrations_count || 0), 0);

    const mTotal = document.getElementById('metric-events-total');
    if (mTotal) mTotal.textContent = totalCount;
    const mUpcoming = document.getElementById('metric-events-upcoming');
    if (mUpcoming) mUpcoming.textContent = upcomingCount;
    const mReg = document.getElementById('metric-events-registered');
    if (mReg) mReg.textContent = regCount;

    renderEventsTable(cachedEvents);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell" style="color: #ef4444;">Failed to load events: ${API.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderEventsTable(events) {
  const tbody = document.getElementById('kinobi-events-tbody');
  if (!tbody) return;

  if (!events || events.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell">No club events found. Click "+ ADD NEW CLUB EVENT" to publish one!</td></tr>`;
    return;
  }

  tbody.innerHTML = events.map(ev => {
    const isUpcoming = ev.status === 'published';
    const statusClass = isUpcoming ? 'upcoming' : (ev.status === 'completed' ? 'finished' : 'draft');
    const statusLabel = isUpcoming ? 'Upcoming' : (ev.status === 'completed' ? 'Finished' : 'Draft');
    const capacityText = (!ev.capacity || ev.capacity === 0) 
      ? `Unlimited (${ev.registrations_count || 0})` 
      : `${ev.registrations_count || 0} / ${ev.capacity}`;

    const subtitleDate = ev.event_date 
      ? API.formatDateTime(ev.event_date) 
      : 'Date TBA';

    return `
      <tr>
        <td>
          <div class="cell-title-box">
            <div class="cell-title-content">
              <a class="cell-link-title" onclick="editEvent('${ev.id}')">${API.escapeHtml(ev.title)}</a>
              <span class="cell-sub-time">${subtitleDate} • ${API.escapeHtml(ev.venue || 'Campus')}</span>
            </div>
            <div class="cell-action-menu-wrap">
              <button type="button" class="btn-dot-menu" onclick="toggleDotDropdown('${ev.id}', event)" aria-label="Actions">⋮</button>
              <div class="dot-dropdown" id="dropdown-${ev.id}">
                <button type="button" class="dot-item" onclick="editEvent('${ev.id}')">✏️ Edit Event</button>
                <button type="button" class="dot-item" onclick="viewEventRegistrations('${ev.id}', '${escapeQuotes(ev.title)}')">👥 Registrations (${ev.registrations_count || 0})</button>
                <button type="button" class="dot-item" onclick="copyEventLink('${ev.id}')">📋 Copy Event Link</button>
                <button type="button" class="dot-item danger" onclick="deleteEvent('${ev.id}', '${escapeQuotes(ev.title)}')">🗑️ Delete Event</button>
              </div>
            </div>
          </div>
        </td>
        <td>
          <div class="capacity-pill">
            <div class="capacity-circle-icon">👤</div>
            <span>${capacityText}</span>
          </div>
        </td>
        <td>
          <span class="kinobi-status-pill ${statusClass}">${statusLabel}</span>
        </td>
        <td>
          <span style="font-weight: 500; color: #475569;">${API.escapeHtml(ev.category || 'Analytix Core')}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function filterEventsTable() {
  const search = (document.getElementById('events-search-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.querySelector('input[name="event-status-filter"]:checked')?.value || 'all';

  let filtered = cachedEvents.filter(ev => {
    const matchesSearch = ev.title.toLowerCase().includes(search) || 
                          (ev.venue && ev.venue.toLowerCase().includes(search)) ||
                          (ev.category && ev.category.toLowerCase().includes(search));

    let matchesStatus = true;
    if (statusFilter === 'published') {
      matchesStatus = ev.status === 'published';
    } else if (statusFilter === 'completed') {
      matchesStatus = ev.status === 'completed';
    } else if (statusFilter === 'draft') {
      matchesStatus = ev.status === 'draft';
    }

    return matchesSearch && matchesStatus;
  });

  renderEventsTable(filtered);
}

function toggleEventsFilterMenu() {
  const popover = document.getElementById('events-filter-popover');
  if (popover) popover.classList.toggle('open');
}

function toggleEventsSort() {
  eventsSortAsc = !eventsSortAsc;
  cachedEvents.sort((a, b) => {
    const cmp = a.title.localeCompare(b.title);
    return eventsSortAsc ? cmp : -cmp;
  });
  filterEventsTable();
  API.toast(`Sorted events ${eventsSortAsc ? 'A to Z' : 'Z to A'}`, 'info');
}

function copyEventLink(eventId) {
  const url = `${window.location.origin}/events.html#event-${eventId}`;
  navigator.clipboard.writeText(url).then(() => {
    API.toast('Event link copied to clipboard!', 'success');
  }).catch(() => {
    API.toast('Failed to copy link', 'error');
  });
}

function exportEventsCSV() {
  if (!cachedEvents.length) {
    API.toast('No events to export', 'info');
    return;
  }
  const headers = ['Title', 'Venue', 'Event Date', 'Deadline', 'Status', 'Category', 'Capacity', 'Registrations'];
  const rows = cachedEvents.map(e => [
    `"${(e.title || '').replace(/"/g, '""')}"`,
    `"${(e.venue || '').replace(/"/g, '""')}"`,
    `"${e.event_date || ''}"`,
    `"${e.registration_deadline || ''}"`,
    `"${e.status || ''}"`,
    `"${e.category || ''}"`,
    e.capacity || 0,
    e.registrations_count || 0
  ]);
  downloadCSV('analytix_club_events.csv', headers, rows);
}

function openAddEventModal() {
  document.getElementById('event-modal-title').textContent = 'Add New Club Event';
  document.getElementById('event-form').reset();
  document.getElementById('event-id').value = '';
  document.getElementById('event-poster-preview').style.display = 'none';
  openKinobiModal('event-modal');
}

async function editEvent(eventId) {
  try {
    const ev = await API.get(`/api/events/${eventId}`);
    document.getElementById('event-modal-title').textContent = 'Edit Club Event';
    document.getElementById('event-id').value = ev.id;
    document.getElementById('event-title').value = ev.title || '';
    document.getElementById('event-description').value = ev.description || '';
    document.getElementById('event-venue').value = ev.venue || '';
    document.getElementById('event-category').value = ev.category || 'Analytix Core';
    document.getElementById('event-capacity').value = ev.capacity || 0;
    document.getElementById('event-status').value = ev.status || 'published';
    document.getElementById('event-poster-url').value = ev.poster_url || '';

    if (ev.event_date) {
      document.getElementById('event-date').value = ev.event_date.slice(0, 16);
    }
    if (ev.registration_deadline) {
      document.getElementById('event-deadline').value = ev.registration_deadline.slice(0, 16);
    }

    const preview = document.getElementById('event-poster-preview');
    if (ev.poster_url) {
      preview.src = ev.poster_url;
      preview.style.display = 'block';
    } else {
      preview.style.display = 'none';
    }

    openKinobiModal('event-modal');
  } catch (e) {
    API.toast('Could not load event details: ' + e.message, 'error');
  }
}

async function handleEventFormSubmit(e) {
  e.preventDefault();
  const eventId = document.getElementById('event-id').value;
  const posterFile = document.getElementById('event-poster-file')?.files[0];
  let posterUrl = document.getElementById('event-poster-url').value;

  if (posterFile) {
    try {
      const formData = new FormData();
      formData.append('file', posterFile);
      const uploadRes = await API.upload('/api/events/upload-poster', formData);
      posterUrl = uploadRes.url;
    } catch (uploadErr) {
      API.toast('Poster upload failed: ' + uploadErr.message, 'error');
      return;
    }
  }

  const payload = {
    title: document.getElementById('event-title').value.trim(),
    description: document.getElementById('event-description').value.trim(),
    venue: document.getElementById('event-venue').value.trim(),
    event_date: new Date(document.getElementById('event-date').value).toISOString(),
    registration_deadline: new Date(document.getElementById('event-deadline').value).toISOString(),
    status: document.getElementById('event-status').value,
    category: document.getElementById('event-category').value.trim() || 'Analytix Core',
    capacity: parseInt(document.getElementById('event-capacity').value || '0', 10),
    poster_url: posterUrl
  };

  try {
    if (eventId) {
      await API.put(`/api/events/${eventId}`, payload);
      API.toast('Event updated successfully', 'success');
    } else {
      await API.post('/api/events', payload);
      API.toast('Event created and published to campus schedule!', 'success');
    }
    closeKinobiModal('event-modal');
    loadEvents();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

async function deleteEvent(eventId, title) {
  if (!confirm(`Are you sure you want to delete the event "${title}"?`)) return;
  try {
    await API.delete(`/api/events/${eventId}`);
    API.toast('Event removed from club schedule', 'success');
    loadEvents();
  } catch (err) {
    API.toast('Failed to delete event: ' + err.message, 'error');
  }
}

async function viewEventRegistrations(eventId, title) {
  const modal = document.getElementById('event-registrations-modal');
  const titleEl = document.getElementById('event-registrations-title');
  const tbody = document.getElementById('event-registrations-list');

  titleEl.textContent = `Registrations: ${title}`;
  tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell">Loading registrations...</td></tr>`;
  openKinobiModal('event-registrations-modal');

  try {
    const regs = await API.get(`/api/events/${eventId}/registrations`);
    if (!regs || regs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell">No registered members yet for this event.</td></tr>`;
      return;
    }

    tbody.innerHTML = regs.map(r => `
      <tr>
        <td><strong>${API.escapeHtml(r.member.full_name)}</strong></td>
        <td>${API.escapeHtml(r.member.email)}</td>
        <td>${API.formatDateTime(r.registered_at)}</td>
        <td>
          <select onchange="updateRegStatus('${r.id}', this.value)" class="kinobi-select-tool" style="padding: 4px 8px;">
            <option value="approved" ${r.status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="attended" ${r.status === 'attended' ? 'selected' : ''}>Attended</option>
            <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="rejected" ${r.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell" style="color:#ef4444;">Failed to load registrations.</td></tr>`;
  }
}

/* =============================================================================
   2. CLUB MEMBERS DIRECTORY
   ============================================================================= */

async function loadMembers() {
  const tbody = document.getElementById('kinobi-members-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">Loading club members...</td></tr>`;

  const search = document.getElementById('members-search-input')?.value || '';
  const team = document.getElementById('members-team-select')?.value || 'All';

  try {
    const query = new URLSearchParams();
    if (search.trim()) query.append('search', search.trim());
    if (team !== 'All') query.append('team', team);

    const members = await API.get(`/api/admin/members?${query.toString()}`);
    cachedMembers = members || [];

    // Calculate metrics
    const totalCount = cachedMembers.length;
    const techCount = cachedMembers.filter(m => (m.team || '').toLowerCase() === 'tech').length;
    const totalPoints = cachedMembers.reduce((sum, m) => sum + (m.points || 0), 0);

    const mTotal = document.getElementById('metric-members-total');
    if (mTotal) mTotal.textContent = totalCount;
    const mTech = document.getElementById('metric-members-tech');
    if (mTech) mTech.textContent = techCount;
    const mPoints = document.getElementById('metric-members-points');
    if (mPoints) mPoints.textContent = totalPoints.toLocaleString();

    renderMembersTable(cachedMembers);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell" style="color: #ef4444;">Failed to load members: ${API.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderMembersTable(members) {
  const tbody = document.getElementById('kinobi-members-tbody');
  if (!tbody) return;

  if (!members || members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">No members matched the criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = members.map(m => {
    const isAdmin = m.role === 'admin';
    const rolePill = isAdmin 
      ? `<span class="kinobi-status-pill upcoming">ADMIN</span>`
      : `<span class="kinobi-status-pill draft">MEMBER</span>`;

    const teamPill = `<span class="kinobi-team-pill">${(m.team || 'None').toUpperCase()}</span>`;
    const initial = (m.full_name || 'U').charAt(0).toUpperCase();

    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="kinobi-user-avatar" style="width: 34px; height: 34px; font-size: 0.82rem;">${initial}</div>
            <div>
              <strong style="color: #0f172a;">${API.escapeHtml(m.full_name)}</strong>
              <div style="font-size: 0.78rem; color: #64748b;">${API.escapeHtml(m.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <select onchange="updateMemberRole('${m.id}', this.value)" class="kinobi-select-tool" style="padding: 4px 8px; font-size: 0.76rem;">
            <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
            <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Club Admin</option>
          </select>
        </td>
        <td>
          <select onchange="updateMemberTeam('${m.id}', this.value)" class="kinobi-select-tool" style="padding: 4px 8px; font-size: 0.76rem;">
            <option value="Tech" ${m.team === 'Tech' ? 'selected' : ''}>Tech</option>
            <option value="Design" ${m.team === 'Design' ? 'selected' : ''}>Design</option>
            <option value="MOC" ${m.team === 'MOC' ? 'selected' : ''}>MOC</option>
          </select>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700; color: #0d6efd;">${m.points || 0} pts</span>
            <button type="button" class="btn-dot-menu" onclick="openAwardPointsModal('${m.id}')" title="Award Points" style="font-size: 0.9rem;">⭐</button>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="font-size: 0.82rem; font-weight: 500;">${API.escapeHtml(m.department || 'General')}</div>
              <div style="font-size: 0.76rem; color: #64748b;">${API.escapeHtml(m.year || '2nd Year')}</div>
            </div>
            <div class="cell-action-menu-wrap">
              <button type="button" class="btn-dot-menu" onclick="toggleDotDropdown('mem-${m.id}', event)">⋮</button>
              <div class="dot-dropdown" id="dropdown-mem-${m.id}">
                <button type="button" class="dot-item" onclick="openAwardPointsModal('${m.id}')">⭐ Award Points</button>
                <button type="button" class="dot-item" onclick="editMemberModal('${m.id}')">✏️ Edit Details</button>
                <button type="button" class="dot-item danger" onclick="deleteMember('${m.id}', '${escapeQuotes(m.full_name)}')">🗑️ Remove Member</button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function exportMembersCSV() {
  if (!cachedMembers.length) {
    API.toast('No members to export', 'info');
    return;
  }
  const headers = ['Name', 'Email', 'Role', 'Team', 'Points', 'Department', 'Year', 'Phone'];
  const rows = cachedMembers.map(m => [
    `"${(m.full_name || '').replace(/"/g, '""')}"`,
    `"${(m.email || '').replace(/"/g, '""')}"`,
    `"${m.role || 'member'}"`,
    `"${m.team || ''}"`,
    m.points || 0,
    `"${(m.department || '').replace(/"/g, '""')}"`,
    `"${m.year || ''}"`,
    `"${m.phone || ''}"`
  ]);
  downloadCSV('analytix_club_members.csv', headers, rows);
}

function openAddMemberModal() {
  document.getElementById('member-modal-title').textContent = 'Add New Club Member';
  document.getElementById('member-form').reset();
  document.getElementById('member-form-id').value = '';
  document.getElementById('member-form-email').disabled = false;
  openKinobiModal('member-modal');
}

function editMemberModal(memberId) {
  const m = cachedMembers.find(mem => mem.id === memberId);
  if (!m) return;
  document.getElementById('member-modal-title').textContent = 'Edit Member Profile';
  document.getElementById('member-form-id').value = m.id;
  document.getElementById('member-form-name').value = m.full_name || '';
  document.getElementById('member-form-email').value = m.email || '';
  document.getElementById('member-form-email').disabled = true; // Email is ID
  document.getElementById('member-form-role').value = m.role || 'member';
  document.getElementById('member-form-team').value = m.team || 'Tech';
  document.getElementById('member-form-dept').value = m.department || '';
  document.getElementById('member-form-year').value = m.year || '';
  document.getElementById('member-form-points').value = m.points || 0;
  openKinobiModal('member-modal');
}

async function handleMemberFormSubmit(e) {
  e.preventDefault();
  const mid = document.getElementById('member-form-id').value;
  const payload = {
    full_name: document.getElementById('member-form-name').value.trim(),
    role: document.getElementById('member-form-role').value,
    team: document.getElementById('member-form-team').value,
    department: document.getElementById('member-form-dept').value.trim(),
    year: document.getElementById('member-form-year').value.trim(),
    points: parseInt(document.getElementById('member-form-points').value || '10', 10)
  };

  try {
    if (mid) {
      await API.put(`/api/admin/members/${mid}`, payload);
      API.toast('Member profile updated', 'success');
    } else {
      payload.email = document.getElementById('member-form-email').value.trim();
      await API.post('/api/admin/members', payload);
      API.toast('New member added to club roster', 'success');
    }
    closeKinobiModal('member-modal');
    loadMembers();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

async function updateMemberRole(memberId, newRole) {
  try {
    await API.patch(`/api/admin/members/${memberId}/role`, { role: newRole });
    API.toast(`Role updated to ${newRole.toUpperCase()}`, 'success');
    loadMembers();
  } catch (err) {
    API.toast('Failed to update role: ' + err.message, 'error');
  }
}

async function updateMemberTeam(memberId, newTeam) {
  try {
    await API.patch(`/api/admin/members/${memberId}/team`, { team: newTeam });
    API.toast(`Team assigned to ${newTeam}`, 'success');
  } catch (err) {
    API.toast('Failed to update team: ' + err.message, 'error');
  }
}

async function deleteMember(memberId, name) {
  if (!confirm(`Are you sure you want to remove ${name} from Analytix Club?`)) return;
  try {
    await API.delete(`/api/admin/members/${memberId}`);
    API.toast(`Removed ${name}`, 'success');
    loadMembers();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

/* =============================================================================
   3. CLUB HACKATHONS
   ============================================================================= */

async function loadHackathons() {
  const tbody = document.getElementById('kinobi-hackathons-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">Loading club hackathons...</td></tr>`;

  try {
    const hackathons = await API.get('/api/hackathons');
    cachedHackathons = hackathons || [];

    const mTotal = document.getElementById('metric-hackathons-total');
    if (mTotal) mTotal.textContent = cachedHackathons.length;
    const mUpcoming = document.getElementById('metric-hackathons-upcoming');
    if (mUpcoming) mUpcoming.textContent = cachedHackathons.filter(h => h.status === 'published').length;

    renderHackathonsTable(cachedHackathons);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell" style="color:#ef4444;">Failed to load hackathons: ${API.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderHackathonsTable(hackathons) {
  const tbody = document.getElementById('kinobi-hackathons-tbody');
  if (!tbody) return;

  if (!hackathons || hackathons.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">No hackathons listed. Click "+ ADD NEW HACKATHON" to create one!</td></tr>`;
    return;
  }

  tbody.innerHTML = hackathons.map(h => {
    return `
      <tr>
        <td>
          <div class="cell-title-box">
            <div class="cell-title-content">
              <a class="cell-link-title" onclick="editHackathon('${h.id}')">${API.escapeHtml(h.title)}</a>
              <span class="cell-sub-time">Org: ${API.escapeHtml(h.organizer)}</span>
            </div>
            <div class="cell-action-menu-wrap">
              <button type="button" class="btn-dot-menu" onclick="toggleDotDropdown('h-${h.id}', event)">⋮</button>
              <div class="dot-dropdown" id="dropdown-h-${h.id}">
                <button type="button" class="dot-item" onclick="editHackathon('${h.id}')">✏️ Edit Hackathon</button>
                <button type="button" class="dot-item danger" onclick="deleteHackathon('${h.id}', '${escapeQuotes(h.title)}')">🗑️ Delete</button>
              </div>
            </div>
          </div>
        </td>
        <td>
          <div>
            <span class="kinobi-team-pill">${(h.mode || 'hybrid').toUpperCase()}</span>
            <div style="font-size: 0.78rem; color: #64748b; margin-top: 3px;">${API.escapeHtml(h.location || 'Campus')}</div>
          </div>
        </td>
        <td><strong style="color: #0f172a;">${API.escapeHtml(h.prize_pool || '₹1,50,000')}</strong></td>
        <td>${API.formatDate(h.deadline)}</td>
        <td><span class="kinobi-status-pill upcoming">${(h.status || 'Active').toUpperCase()}</span></td>
      </tr>
    `;
  }).join('');
}

function filterHackathonsTable() {
  const search = (document.getElementById('hackathons-search-input')?.value || '').toLowerCase().trim();
  const mode = document.getElementById('hackathons-mode-select')?.value || 'all';

  const filtered = cachedHackathons.filter(h => {
    const matchesSearch = h.title.toLowerCase().includes(search) || h.organizer.toLowerCase().includes(search);
    const matchesMode = (mode === 'all') || ((h.mode || '').toLowerCase() === mode);
    return matchesSearch && matchesMode;
  });

  renderHackathonsTable(filtered);
}

function exportHackathonsCSV() {
  if (!cachedHackathons.length) {
    API.toast('No hackathons to export', 'info');
    return;
  }
  const headers = ['Title', 'Organizer', 'Mode', 'Location', 'Prize Pool', 'Deadline', 'Status'];
  const rows = cachedHackathons.map(h => [
    `"${(h.title || '').replace(/"/g, '""')}"`,
    `"${(h.organizer || '').replace(/"/g, '""')}"`,
    `"${h.mode || ''}"`,
    `"${(h.location || '').replace(/"/g, '""')}"`,
    `"${h.prize_pool || ''}"`,
    `"${h.deadline || ''}"`,
    `"${h.status || ''}"`
  ]);
  downloadCSV('analytix_hackathons.csv', headers, rows);
}

function openAddHackathonModal() {
  document.getElementById('hackathon-modal-title').textContent = 'Add Club Hackathon';
  document.getElementById('hackathon-form').reset();
  document.getElementById('hackathon-id').value = '';
  openKinobiModal('hackathon-modal');
}

async function editHackathon(hId) {
  try {
    const h = await API.get(`/api/hackathons/${hId}`);
    document.getElementById('hackathon-modal-title').textContent = 'Edit Hackathon';
    document.getElementById('hackathon-id').value = h.id;
    document.getElementById('hackathon-title').value = h.title || '';
    document.getElementById('hackathon-organizer').value = h.organizer || '';
    document.getElementById('hackathon-description').value = h.description || '';
    document.getElementById('hackathon-location').value = h.location || '';
    document.getElementById('hackathon-mode').value = h.mode || 'hybrid';
    document.getElementById('hackathon-prize-pool').value = h.prize_pool || '₹1,50,000';
    document.getElementById('hackathon-link').value = h.registration_link || '';
    document.getElementById('hackathon-skills').value = h.required_skills || '';

    if (h.start_date) document.getElementById('hackathon-start-date').value = h.start_date.slice(0, 10);
    if (h.deadline) document.getElementById('hackathon-deadline').value = h.deadline.slice(0, 10);

    openKinobiModal('hackathon-modal');
  } catch (err) {
    API.toast('Could not load hackathon details: ' + err.message, 'error');
  }
}

async function handleHackathonFormSubmit(e) {
  e.preventDefault();
  const hId = document.getElementById('hackathon-id').value;
  const payload = {
    title: document.getElementById('hackathon-title').value.trim(),
    organizer: document.getElementById('hackathon-organizer').value.trim(),
    description: document.getElementById('hackathon-description').value.trim(),
    location: document.getElementById('hackathon-location').value.trim(),
    mode: document.getElementById('hackathon-mode').value,
    prize_pool: document.getElementById('hackathon-prize-pool').value.trim() || '₹1,50,000',
    registration_link: document.getElementById('hackathon-link').value.trim(),
    required_skills: document.getElementById('hackathon-skills').value.trim(),
    start_date: new Date(document.getElementById('hackathon-start-date').value).toISOString(),
    deadline: new Date(document.getElementById('hackathon-deadline').value).toISOString(),
    status: 'published'
  };

  try {
    if (hId) {
      await API.put(`/api/hackathons/${hId}`, payload);
      API.toast('Hackathon updated', 'success');
    } else {
      await API.post('/api/hackathons', payload);
      API.toast('Hackathon published', 'success');
    }
    closeKinobiModal('hackathon-modal');
    loadHackathons();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

async function deleteHackathon(hId, title) {
  if (!confirm(`Delete hackathon "${title}"?`)) return;
  try {
    await API.delete(`/api/hackathons/${hId}`);
    API.toast('Hackathon deleted', 'success');
    loadHackathons();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

/* =============================================================================
   4. CLUB APPLICATIONS & REGISTRATIONS
   ============================================================================= */

async function loadRegistrations() {
  const tbody = document.getElementById('kinobi-applications-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">Loading member applications...</td></tr>`;

  try {
    const regs = await API.get('/api/registrations/admin/all');
    cachedRegistrations = regs || [];

    const total = cachedRegistrations.length;
    const approved = cachedRegistrations.filter(r => r.status === 'approved').length;
    const attended = cachedRegistrations.filter(r => r.status === 'attended').length;

    const mTot = document.getElementById('metric-app-total');
    if (mTot) mTot.textContent = total;
    const mApp = document.getElementById('metric-app-approved');
    if (mApp) mApp.textContent = approved;
    const mAtt = document.getElementById('metric-app-attended');
    if (mAtt) mAtt.textContent = attended;

    renderApplicationsTable(cachedRegistrations);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell" style="color:#ef4444;">Failed to load applications: ${API.escapeHtml(err.message)}</td></tr>`;
  }
}

function renderApplicationsTable(regs) {
  const tbody = document.getElementById('kinobi-applications-tbody');
  if (!tbody) return;

  if (!regs || regs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">No event registrations recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = regs.map(r => {
    return `
      <tr>
        <td>
          <strong style="color: #0f172a;">${API.escapeHtml(r.member_name)}</strong>
          <div style="font-size: 0.78rem; color: #64748b;">${API.escapeHtml(r.member_email)} • ${API.escapeHtml(r.department || 'Campus')}</div>
        </td>
        <td>
          <strong style="color: #0d6efd;">${API.escapeHtml(r.event_title)}</strong>
          <div style="font-size: 0.78rem; color: #64748b;">${r.event_date ? API.formatDateTime(r.event_date) : ''}</div>
        </td>
        <td>${API.formatDateTime(r.created_at)}</td>
        <td>
          <select onchange="updateRegStatus('${r.id}', this.value)" class="kinobi-select-tool" style="padding: 4px 8px; font-size: 0.78rem;">
            <option value="approved" ${r.status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="attended" ${r.status === 'attended' ? 'selected' : ''}>Attended</option>
            <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="rejected" ${r.status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </td>
        <td>
          <button type="button" class="btn-dot-menu" onclick="deleteRegRecord('${r.id}')" title="Delete record" style="color: #ef4444;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterApplicationsTable() {
  const search = (document.getElementById('applications-search-input')?.value || '').toLowerCase().trim();
  const status = document.getElementById('applications-status-select')?.value || 'all';

  const filtered = cachedRegistrations.filter(r => {
    const matchesSearch = (r.member_name || '').toLowerCase().includes(search) || 
                          (r.member_email || '').toLowerCase().includes(search) ||
                          (r.event_title || '').toLowerCase().includes(search);
    const matchesStatus = (status === 'all') || (r.status === status);
    return matchesSearch && matchesStatus;
  });

  renderApplicationsTable(filtered);
}

async function updateRegStatus(regId, newStatus) {
  try {
    await API.patch(`/api/registrations/events/${regId}/status`, { status: newStatus });
    API.toast(`Registration updated to ${newStatus.toUpperCase()}`, 'success');
  } catch (err) {
    API.toast('Status update failed: ' + err.message, 'error');
  }
}

async function deleteRegRecord(regId) {
  if (!confirm('Remove this registration record?')) return;
  try {
    await API.delete(`/api/registrations/${regId}`);
    API.toast('Registration record removed', 'success');
    loadRegistrations();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

function exportRegistrationsCSV() {
  if (!cachedRegistrations.length) {
    API.toast('No applications to export', 'info');
    return;
  }
  const headers = ['Member Name', 'Email', 'Event', 'Date Registered', 'Status'];
  const rows = cachedRegistrations.map(r => [
    `"${(r.member_name || '').replace(/"/g, '""')}"`,
    `"${(r.member_email || '').replace(/"/g, '""')}"`,
    `"${(r.event_title || '').replace(/"/g, '""')}"`,
    `"${r.created_at || ''}"`,
    `"${r.status || ''}"`
  ]);
  downloadCSV('analytix_applications.csv', headers, rows);
}

/* =============================================================================
   5. ANNOUNCEMENTS / BULLETINS
   ============================================================================= */

async function loadAnnouncements() {
  const tbody = document.getElementById('kinobi-announcements-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell">Loading announcements...</td></tr>`;

  try {
    const bulletins = await API.get('/api/announcements');
    cachedAnnouncements = bulletins || [];

    if (!bulletins || bulletins.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell">No announcements posted yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = bulletins.map(b => `
      <tr>
        <td>
          <div class="cell-title-box">
            <div class="cell-title-content">
              <strong style="color: #0f172a; font-size: 0.90rem;">${API.escapeHtml(b.title)}</strong>
              <span class="cell-sub-time" style="max-width: 440px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${API.escapeHtml(b.description)}</span>
            </div>
            <div class="cell-action-menu-wrap">
              <button type="button" class="btn-dot-menu" onclick="toggleDotDropdown('b-${b.id}', event)">⋮</button>
              <div class="dot-dropdown" id="dropdown-b-${b.id}">
                <button type="button" class="dot-item" onclick="editAnnouncement('${b.id}')">✏️ Edit</button>
                <button type="button" class="dot-item danger" onclick="deleteAnnouncement('${b.id}', '${escapeQuotes(b.title)}')">🗑️ Delete</button>
              </div>
            </div>
          </div>
        </td>
        <td><span class="kinobi-team-pill">${API.escapeHtml(b.category || 'Notice')}</span></td>
        <td>${API.formatDate(b.created_at)}</td>
        <td><span class="kinobi-status-pill upcoming">PUBLISHED</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="kinobi-loading-cell" style="color:#ef4444;">Failed to load announcements: ${API.escapeHtml(err.message)}</td></tr>`;
  }
}

function openAddAnnouncementModal() {
  document.getElementById('announcement-modal-title').textContent = 'Post New Bulletin';
  document.getElementById('announcement-form').reset();
  document.getElementById('announcement-id').value = '';
  openKinobiModal('announcement-modal');
}

async function editAnnouncement(id) {
  try {
    const a = await API.get(`/api/announcements/${id}`);
    document.getElementById('announcement-modal-title').textContent = 'Edit Bulletin';
    document.getElementById('announcement-id').value = a.id;
    document.getElementById('announcement-title').value = a.title || '';
    document.getElementById('announcement-category').value = a.category || 'Notice';
    document.getElementById('announcement-image').value = a.image_url || '';
    document.getElementById('announcement-desc').value = a.description || '';
    openKinobiModal('announcement-modal');
  } catch (err) {
    API.toast('Could not load bulletin: ' + err.message, 'error');
  }
}

async function handleAnnouncementFormSubmit(e) {
  e.preventDefault();
  const aid = document.getElementById('announcement-id').value;
  const payload = {
    title: document.getElementById('announcement-title').value.trim(),
    category: document.getElementById('announcement-category').value,
    image_url: document.getElementById('announcement-image').value.trim(),
    description: document.getElementById('announcement-desc').value.trim(),
    status: 'published'
  };

  try {
    if (aid) {
      await API.put(`/api/announcements/${aid}`, payload);
      API.toast('Bulletin updated', 'success');
    } else {
      await API.post('/api/announcements', payload);
      API.toast('Bulletin broadcast to campus!', 'success');
    }
    closeKinobiModal('announcement-modal');
    loadAnnouncements();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

async function deleteAnnouncement(id, title) {
  if (!confirm(`Delete bulletin "${title}"?`)) return;
  try {
    await API.delete(`/api/announcements/${id}`);
    API.toast('Bulletin removed', 'success');
    loadAnnouncements();
  } catch (err) {
    API.toast(err.message, 'error');
  }
}

/* =============================================================================
   6. LEADERBOARD & AWARD POINTS
   ============================================================================= */

async function loadLeaderboard() {
  const tbody = document.getElementById('kinobi-leaderboard-tbody');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">Loading leaderboard standings...</td></tr>`;

  try {
    const list = await API.get('/api/members/leaderboard');
    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell">No leaderboard standings recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map((item, idx) => {
      const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`));
      return `
        <tr>
          <td><strong style="font-size: 1.1rem;">${medal}</strong></td>
          <td><strong>${API.escapeHtml(item.full_name)}</strong></td>
          <td><span class="kinobi-team-pill">${(item.team || 'None').toUpperCase()}</span></td>
          <td><strong style="color: #0d6efd; font-size: 1.05rem;">${item.points} pts</strong></td>
          <td>
            <button type="button" class="kinobi-btn-action-outline" style="padding: 4px 10px; font-size: 0.78rem;" onclick="openAwardPointsModal('${item.member_id}')">
              ⭐ Award Points
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="kinobi-loading-cell" style="color:#ef4444;">Failed to load leaderboard.</td></tr>`;
  }
}

async function openAwardPointsModal(memberId) {
  // Populate members select
  const select = document.getElementById('award-member-select');
  select.innerHTML = '<option value="">Select member...</option>';
  
  if (!cachedMembers.length) {
    try {
      cachedMembers = await API.get('/api/admin/members');
    } catch (e) {}
  }

  cachedMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.full_name} (${m.email}) - Current: ${m.points || 0} pts`;
    if (memberId && m.id === memberId) opt.selected = true;
    select.appendChild(opt);
  });

  openKinobiModal('award-points-modal');
}

async function handleAwardPointsSubmit(e) {
  e.preventDefault();
  const mid = document.getElementById('award-member-select').value;
  const pts = parseInt(document.getElementById('award-points-val').value, 10);
  const reason = document.getElementById('award-points-reason').value.trim();

  if (!mid) {
    API.toast('Please select a member', 'error');
    return;
  }

  try {
    await API.post('/api/admin/leaderboard/award', {
      member_id: mid,
      points: pts,
      reason: reason
    });
    API.toast(`Awarded ${pts} merit points!`, 'success');
    closeKinobiModal('award-points-modal');
    loadMembers();
    loadLeaderboard();
  } catch (err) {
    API.toast('Failed to award points: ' + err.message, 'error');
  }
}

/* =============================================================================
   7. CLUB OVERVIEW PULSE
   ============================================================================= */

async function loadOverview() {
  try {
    const stats = await API.get('/api/admin/overview');
    document.getElementById('ov-members-val').textContent = stats.total_members || stats.members || 0;
    document.getElementById('ov-events-val').textContent = stats.total_events || stats.events || 0;
    document.getElementById('ov-hackathons-val').textContent = stats.total_hackathons || stats.hackathons || 0;
    document.getElementById('ov-regs-val').textContent = stats.total_event_registrations || stats.registrations || 0;

    const feed = document.getElementById('kinobi-activity-feed');
    if (feed) {
      const acts = stats.recent_activities || [];
      if (!acts.length) {
        feed.innerHTML = `<li class="kinobi-activity-item" style="color: #64748b;">No recent club activity recorded.</li>`;
      } else {
        feed.innerHTML = acts.map(a => `
          <li class="kinobi-activity-item">
            <span style="font-size: 1.1rem;">${a.type === 'award' ? '⭐' : (a.type === 'event' ? '📅' : '👥')}</span>
            <div style="flex-grow: 1;">
              <div style="font-weight: 600; font-size: 0.84rem; color: #0f172a;">${API.escapeHtml(a.message)}</div>
              <div style="font-size: 0.74rem; color: #64748b; margin-top: 2px;">${API.formatDateTime(a.timestamp)}</div>
            </div>
          </li>
        `).join('');
      }
    }
  } catch (err) {
    API.toast('Failed to refresh overview pulse', 'error');
  }
}

/* =============================================================================
   8. SETTINGS & ADMIN PROFILE
   ============================================================================= */

function loadAdminProfile() {
  if (!currentAdmin) return;
  document.getElementById('admin-profile-name').value = currentAdmin.full_name || '';
  document.getElementById('admin-profile-email').value = currentAdmin.email || '';
  document.getElementById('admin-profile-phone').value = currentAdmin.phone || '';
  document.getElementById('admin-profile-dept').value = currentAdmin.department || '';
  document.getElementById('admin-profile-year').value = currentAdmin.year || '';
  document.getElementById('admin-profile-photo').value = currentAdmin.profile_photo || '';
  document.getElementById('admin-profile-skills').value = currentAdmin.skills || '';
  document.getElementById('admin-profile-bio').value = currentAdmin.bio || '';
}

async function handleAdminProfileSubmit(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('admin-profile-name').value.trim(),
    phone: document.getElementById('admin-profile-phone').value.trim(),
    department: document.getElementById('admin-profile-dept').value.trim(),
    year: document.getElementById('admin-profile-year').value.trim(),
    profile_photo: document.getElementById('admin-profile-photo').value.trim(),
    skills: document.getElementById('admin-profile-skills').value.trim(),
    bio: document.getElementById('admin-profile-bio').value.trim()
  };

  try {
    const updated = await API.put('/api/members/me', payload);
    API.setUser(updated);
    currentAdmin = updated;
    Auth.updateNavbarUser(updated);
    API.toast('Admin profile updated successfully!', 'success');
  } catch (err) {
    API.toast('Failed to update profile: ' + err.message, 'error');
  }
}

function openAddOpeningModal() {
  API.toast('Opening editor dialog launched. Customize role requirements in settings.', 'info');
}

/* =============================================================================
   9. MODAL & CSV UTILITIES
   ============================================================================= */

function openKinobiModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('active');
}

function closeKinobiModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('active');
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function downloadCSV(filename, headers, rows) {
  const csvContent = 'data:text/csv;charset=utf-8,' + 
    [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  API.toast(`Exported ${filename} successfully!`, 'success');
}
