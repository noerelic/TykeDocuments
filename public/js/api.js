// public/js/api.js
const API_BASE = 'http://localhost:3000';

window.TykeAPI = {
  getToken() {
    return localStorage.getItem('tyke_token');
  },
  
  setToken(token, username) {
    localStorage.setItem('tyke_token', token);
    localStorage.setItem('tyke_username', username);
  },

  logout() {
    localStorage.removeItem('tyke_token');
    localStorage.removeItem('tyke_username');
    window.location.href = 'auth.html';
  },

  checkAuthToggle() {
    const isAuthPage = window.location.pathname.includes('auth.html');
    const token = this.getToken();
    
    if (!token && !isAuthPage) {
      window.location.href = 'auth.html';
    } else if (token && isAuthPage) {
      window.location.href = 'index.html';
    }
  },

  async request(endpoint, options = {}) {
    this.checkAuthToggle();

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.logout();
        }
        throw new Error(data.error || 'Bir hata oluştu');
      }

      return data;
    } catch (error) {
      console.error('API Hatası:', error);
      throw error;
    }
  }
};

// Check auth on load for protected pages
if (!window.location.pathname.includes('auth.html')) {
  window.TykeAPI.checkAuthToggle();
}
