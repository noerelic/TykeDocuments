// public/js/auth.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitBtn = document.getElementById('submit-btn');
  const toggleLink = document.getElementById('toggle-link');
  const toggleText = document.getElementById('toggle-text');
  const errorMsg = document.getElementById('error-message');

  let isLogin = true;

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    errorMsg.textContent = '';
    
    if (isLogin) {
      title.textContent = 'Hoş Geldiniz';
      subtitle.textContent = 'Devam etmek için giriş yapın.';
      submitBtn.textContent = 'Giriş Yap';
      toggleText.textContent = 'Hesabınız yok mu?';
      toggleLink.textContent = 'Kayıt Ol';
    } else {
      title.textContent = 'Hesap Oluştur';
      subtitle.textContent = 'Tyke Documents dünyasına katılın.';
      submitBtn.textContent = 'Kayıt Ol';
      toggleText.textContent = 'Zaten hesabınız var mı?';
      toggleLink.textContent = 'Giriş Yap';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    errorMsg.textContent = '';
    submitBtn.disabled = true;

    try {
      if (isLogin) {
        const data = await fetch('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        }).then(res => res.json());

        if (data.error) throw new Error(data.error);

        window.TykeAPI.setToken(data.token, data.username);
        window.location.href = 'index.html';
      } else {
        const data = await fetch('http://localhost:3000/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        }).then(res => res.json());

        if (data.error) throw new Error(data.error);

        // Auto switch to login
        toggleLink.click();
        errorMsg.style.color = '#333';
        errorMsg.textContent = 'Kayıt başarılı! Lütfen giriş yapın.';
      }
    } catch (error) {
      errorMsg.style.color = 'var(--danger-color, #d32f2f)';
      errorMsg.textContent = error.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
});
