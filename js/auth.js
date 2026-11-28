/**
 * ANALYTIX CLUB - AUTHENTICATION & ROLE-BASED ACCESS CONTROL
 */

const Auth = {
  /**
   * Login handler: Sends credentials to FastAPI backend,
   * stores verified token and profile, and routes strictly by role.
   */
  async login(email, password) {
    try {
      const response = await API.post('/api/auth/login', { email, password });
      API.setToken(response.access_token);
      API.setUser(response.user);

      API.toast(`Welcome back, ${response.user.full_name}!`, 'success');

      // STRICT ROLE-BASED REDIRECTION
      setTimeout(() => {
        if (response.user.role === 'admin') {
          window.location.href = 'admin-dashboard.html';
        } else {
          window.location.href = 'member-dashboard.html';
        }
      }, 500);

      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Register handler: Signs up a new club member,
   * all registrations default strictly to role = 'member'.
   */
  async register(userData) {
    try {
      const response = await API.post('/api/auth/register', userData);
      
      // If email verification is required by Supabase, caller handles display
      if (response.requires_verification || !response.access_token) {
        return response;
      }

      API.setToken(response.access_token);
      API.setUser(response.user);

      API.toast('Registration successful! Welcome to Analytix Club.', 'success');

      setTimeout(() => {
        // Members always redirect to member dashboard
        window.location.href = 'member-dashboard.html';
      }, 600);

      return response;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Forgot Password: Sends password reset link to user's email
   */
  async forgotPassword(email) {
    try {
      return await API.post('/api/auth/forgot-password', { email });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Reset Password: Updates password with authenticated recovery token
   */
  async resetPassword(token, newPassword) {
    try {
      return await API.request('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ new_password: newPassword })
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Logout handler
   */
  async logout() {
    try {
      await API.post('/api/auth/logout', {});
    } catch (e) {
      // ignore
    } finally {
      API.clearAuth();
      API.toast('You have been logged out.', 'info');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 300);
    }
  },

  /**
   * Guard: Verify user is authenticated and is an ADMIN.
   * If not logged in, redirect to login.html.
   * If logged in as member, redirect to member-dashboard.html.
   */
  async requireAdmin() {
    const token = API.getToken();
    if (!token) {
      window.location.href = 'login.html';
      return null;
    }

    try {
      // Verify with backend to prevent client-side role forgery
      const user = await API.get('/api/auth/me');
      API.setUser(user);

      if (user.role !== 'admin') {
        API.toast('Access denied. Administrator privileges required.', 'error');
        window.location.replace('member-dashboard.html');
        return null;
      }

      this.updateNavbarUser(user);
      return user;
    } catch (err) {
      API.clearAuth();
      window.location.href = 'login.html';
      return null;
    }
  },

  /**
   * Guard: Verify user is authenticated.
   */
  async requireAuth() {
    const token = API.getToken();
    if (!token) {
      window.location.href = 'login.html';
      return null;
    }

    try {
      const user = await API.get('/api/auth/me');
      API.setUser(user);
      this.updateNavbarUser(user);
      return user;
    } catch (err) {
      API.clearAuth();
      window.location.href = 'login.html';
      return null;
    }
  },

  /**
   * If already logged in, redirect away from login/register to dashboard
   */
  async redirectIfLoggedIn() {
    const token = API.getToken();
    if (!token) return;

    try {
      const user = await API.get('/api/auth/me');
      API.setUser(user);
      if (user.role === 'admin') {
        window.location.href = 'admin-dashboard.html';
      } else {
        window.location.href = 'member-dashboard.html';
      }
    } catch (e) {
      API.clearAuth();
    }
  },

  /**
   * Syncs user details into header / navigation if elements exist
   */
  updateNavbarUser(user) {
    const userDisplay = document.querySelectorAll('.user-display-name');
    userDisplay.forEach(el => el.textContent = user.full_name);

    const userEmail = document.querySelectorAll('.user-display-email');
    userEmail.forEach(el => el.textContent = user.email);

    const userRole = document.querySelectorAll('.user-display-role');
    userRole.forEach(el => el.textContent = user.role.toUpperCase());

    const userTeam = document.querySelectorAll('.user-display-team');
    userTeam.forEach(el => el.textContent = user.team || 'None');

    const initial = (user.full_name || 'U').charAt(0).toUpperCase();
    const safePhoto = user.profile_photo ? API.sanitizeUrl(user.profile_photo) : '';

    const userAvatar = document.querySelectorAll('.user-avatar-img');
    userAvatar.forEach(el => {
      if (safePhoto) {
        if (el.tagName === 'IMG') {
          el.src = safePhoto;
        } else {
          el.innerHTML = `<img src="${safePhoto}" alt="${user.full_name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.onerror=null;this.parentElement.textContent='${initial}';">`;
        }
      } else {
        if (el.tagName === 'IMG') {
          el.style.display = 'none';
        } else {
          el.textContent = initial;
        }
      }
    });

    // Public navbar actions dynamic update: Apple Layout Account Menu
    const navAuthActions = document.getElementById('nav-auth-actions');
    if (navAuthActions) {
      const targetDashboard = user.role === 'admin' ? 'admin-dashboard.html' : 'member-dashboard.html';
      const avatarContent = safePhoto 
        ? `<img src="${safePhoto}" alt="${user.full_name}" onerror="this.style.display='none';this.parentElement.textContent='${initial}';">`
        : initial;

      navAuthActions.innerHTML = `
        <div class="apple-account-menu" id="apple-account-menu">
          <button type="button" class="apple-account-pill" onclick="window.toggleAppleAccountMenu(event)" aria-label="Account Menu">
            <div class="apple-account-avatar">${avatarContent}</div>
            <span class="user-display-name">${user.full_name.split(' ')[0]}</span>
            <span class="apple-chevron">▼</span>
          </button>
          <div class="apple-dropdown">
            <div class="apple-dropdown-user">
              <div class="apple-dropdown-name">${API.escapeHtml(user.full_name)}</div>
              <div class="apple-dropdown-email">${API.escapeHtml(user.email)}</div>
              <div class="apple-dropdown-badges">
                <span class="apple-badge">${(user.role || 'MEMBER').toUpperCase()}</span>
                <span class="apple-badge" style="background: rgba(73, 49, 124, 0.25); color: var(--starlight-lavender); border: 1px solid rgba(185, 167, 232, 0.2);">TEAM: ${(user.team || 'None').toUpperCase()}</span>
              </div>
            </div>
            <div class="apple-dropdown-divider"></div>
            <a href="${targetDashboard}" class="apple-dropdown-item">
              <span class="apple-item-icon">📊</span>
              <span>Dashboard</span>
            </a>
            <div class="apple-dropdown-divider"></div>
            <button type="button" onclick="Auth.logout()" class="apple-dropdown-item apple-dropdown-item-danger">
              <span class="apple-item-icon">🚪</span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      `;
    }
  }
};

window.Auth = Auth;

// Global Apple Account Menu Handlers
window.toggleAppleAccountMenu = function(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('apple-account-menu');
  if (menu) menu.classList.toggle('open');
};

window.triggerAvatarUpload = function() {
  const input = document.getElementById('nav-avatar-file-input');
  if (input) input.click();
};

window.handleNavbarAvatarUpload = async function(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    API.toast('Please select a valid image file (JPG, PNG, WEBP)', 'error');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    API.toast('Image size must be less than 5MB', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    API.toast('Uploading profile photo...', 'info');
    const res = await API.upload('/api/members/upload-photo', formData);
    if (res && (res.user || res.url)) {
      const updatedUser = res.user || { ...API.getUser(), profile_photo: res.url };
      API.setUser(updatedUser);
      Auth.updateNavbarUser(updatedUser);
      API.toast('Profile photo updated successfully!', 'success');
      
      if (typeof loadMemberProfileForm === 'function') {
        currentMember = updatedUser;
        loadMemberProfileForm();
      }
    }
  } catch (err) {
    API.toast('Photo upload failed: ' + (err.message || 'Error'), 'error');
  } finally {
    event.target.value = '';
  }
};

document.addEventListener('click', (e) => {
  const menu = document.getElementById('apple-account-menu');
  if (menu && !menu.contains(e.target)) {
    menu.classList.remove('open');
  }
});

