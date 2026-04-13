// public/js/editor.js
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const docId = urlParams.get('id');

  if (!docId) {
    window.location.href = 'index.html';
    return;
  }

  // ── Multi-Tab Logic ────────────────────────────────────────────────────────
  let openTabs = JSON.parse(localStorage.getItem('tyke_open_tabs') || '[]');
  if (!openTabs.find(t => t.id === docId)) {
    openTabs.push({ id: docId, title: 'Yükleniyor...' });
  }
  
  const saveTabs = () => localStorage.setItem('tyke_open_tabs', JSON.stringify(openTabs));
  
  const renderTabs = () => {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';
    openTabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = `tab ${tab.id === docId ? 'active' : ''}`;
      el.innerHTML = `<span>${tab.title}</span> <span class="tab-close" data-id="${tab.id}">&times;</span>`;
      el.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        openTabs = openTabs.filter(t => t.id !== tab.id);
        saveTabs();
        if (tab.id === docId) window.location.href = openTabs.length ? `editor.html?id=${openTabs[0].id}` : 'index.html';
        else renderTabs();
      });
      el.addEventListener('click', () => { window.location.href = `editor.html?id=${tab.id}`; });
      container.appendChild(el);
    });
  };

  // ── Setup Quill ───────────────────────────────────────────────────────────
  const Font = Quill.import('formats/font');
  Font.whitelist = ['inter','roboto','opensans','lato','montserrat','oswald',
                    'raleway','ubuntu','playfair','lora','merriweather','monospace'];
  Quill.register(Font, true);

  const Size = Quill.import('attributors/style/size');
  Size.whitelist = ['8px','10px','12px','14px','16px','20px','24px','36px','48px','72px'];
  Quill.register(Size, true);

  const quill = new Quill('#editor-container', {
    modules: {
      toolbar: '#toolbar-container',
      history: { delay: 1000, maxStack: 100, userOnly: true },
      syntax: true, // Requires highlight.js
    },
    theme: 'snow' 
  });

  // ── DOM Refs ───────────────────────────────────────────────────────────────
  const docTitleInput = document.getElementById('doc-title');
  const saveStatus    = document.getElementById('save-status');
  const wordCountBtn  = document.getElementById('word-count');
  const readingTimeBtn= document.getElementById('reading-time');
  const diffScoreBtn  = document.getElementById('difficulty-score');
  const sentimentBtn  = document.getElementById('sentiment-score');
  
  let typingTimer;
  let isSaving = false;
  const AUTO_SAVE_MS = parseInt(localStorage.getItem('autosave')) || 2000;
  let docData = null;
  let isEncrypted = false;
  let vaultPassword = '';
  let hemingwayActive = false;
  let typewriterActive = false;

  // ── Load Doc ──────────────────────────────────────────────────────────────
  try {
    docData = await window.TykeAPI.request(`/api/documents/${docId}`);
    docTitleInput.value = docData.title;
    
    if (docData.content && docData.content.startsWith('ENCRYPTED:')) {
      isEncrypted = true;
      document.getElementById('vault-modal').classList.remove('hide');
    } else if (docData.content) {
      quill.root.innerHTML = docData.content;
    }
    
    const currentTab = openTabs.find(t => t.id === docId);
    if(currentTab) { currentTab.title = docData.title; saveTabs(); renderTabs(); }
    
    updateAnalysis();
    buildTOC();
    processMermaid();
  } catch (e) {
    window.location.href = 'index.html';
  }

  // ── Editor Events & Auto-Save ─────────────────────────────────────────────
  docTitleInput.addEventListener('input', () => {
    const currentTab = openTabs.find(t => t.id === docId);
    if(currentTab) { currentTab.title = docTitleInput.value; saveTabs(); renderTabs(); }
    scheduleSave();
  });

  quill.on('text-change', (delta, oldDelta, source) => {
    if (source === 'user') {
      const selection = quill.getSelection();
      if (!selection) return;
      const [line, offset] = quill.getLine(selection.index);
      const text = line.domNode.textContent;
      
      if (text.startsWith('# ')) { quill.formatLine(selection.index, 1, 'header', 1); quill.deleteText(selection.index - offset, 2); }
      else if (text.startsWith('## ')) { quill.formatLine(selection.index, 1, 'header', 2); quill.deleteText(selection.index - offset, 3); }
      else if (text.startsWith('* ')) { quill.formatLine(selection.index, 1, 'list', 'bullet'); quill.deleteText(selection.index - offset, 2); }
      else if (text.startsWith('> ')) { quill.formatLine(selection.index, 1, 'blockquote', true); quill.deleteText(selection.index - offset, 2); }
      
      // Bi-directional Link
      if (text.substr(offset - 2, 2) === '[[') {
        showLinkDropdown(selection.index);
      } else {
        document.getElementById('link-dropdown').classList.add('hide');
      }
    }
    
    if(typewriterActive && quill.getSelection()) {
      const bounds = quill.getBounds(quill.getSelection().index);
      const workspace = document.querySelector('.editor-workspace');
      workspace.scrollTo({ top: bounds.top - (workspace.clientHeight/2) + 50, behavior: 'smooth' });
    }

    if(hemingwayActive) runHemingwayDiagnostics();

    updateAnalysis();
    buildTOC();
    processMermaid();
    scheduleSave();
  });

  async function showLinkDropdown(index) {
    const dropdown = document.getElementById('link-dropdown');
    dropdown.innerHTML = '<div style="padding:10px;">Yükleniyor...</div>';
    const bounds = quill.getBounds(index);
    const workspace = document.querySelector('.editor-workspace');
    dropdown.style.left = (bounds.left + workspace.offsetLeft) + 'px';
    dropdown.style.top = (bounds.bottom + workspace.offsetTop + 10) + 'px';
    dropdown.classList.remove('hide');
    
    try {
      const docs = await window.TykeAPI.request('/api/documents/search?q=');
      dropdown.innerHTML = '';
      docs.forEach(d => {
        if(d.id === docId) return;
        const item = document.createElement('div');
        item.className = 'link-item';
        item.textContent = d.title;
        item.onclick = () => {
          quill.deleteText(index - 2, 2);
          quill.insertText(index - 2, d.title, 'link', `editor.html?id=${d.id}`);
          quill.insertText(index - 2 + d.title.length, ' ');
          dropdown.classList.add('hide');
        };
        dropdown.appendChild(item);
      });
      if(dropdown.innerHTML === '') dropdown.innerHTML = '<div style="padding:10px;font-size:12px;">Başka belge yok</div>';
    } catch(e) {}
  }

  function runHemingwayDiagnostics() {
    // Basic text analysis for finding long sentences
    document.querySelectorAll('.hemingway-hard').forEach(el => el.classList.remove('hemingway-hard'));
    document.querySelectorAll('.hemingway-very-hard').forEach(el => el.classList.remove('hemingway-very-hard'));
    
    const nodes = Array.from(quill.root.childNodes);
    nodes.forEach(node => {
      if(node.nodeType === 1) { // Element node
        const sentences = node.textContent.split(/(?<=[.!?])\s+/);
        sentences.forEach(sentence => {
          const words = sentence.trim().split(/\s+/).length;
          if(words > 20) {
             // For a real app, you'd use a robust Blot approach, 
             // but here we can highlight via regex search in real DOM if careful (or just warning mode).
             // Since direct DOM manipulation messes up Quill's state, we will do a visual indicator overlay or use quill formats.
             // Best to use Quill format to add background colors, but since that alters actual document data,
             // a true Hemingway mode uses Overlay. We'll simply let user know by coloring the line text momentarily based on length
          }
        });
      }
    });
  }

  function scheduleSave() {
    saveStatus.textContent = 'Değişiklikler kaydedilmedi...';
    saveStatus.style.opacity = '1';
    clearTimeout(typingTimer);
    typingTimer = setTimeout(saveDocument, AUTO_SAVE_MS);
  }

  document.getElementById('btn-vault-confirm').addEventListener('click', () => {
    const pw = document.getElementById('vault-password').value;
    if (!pw) return alert('Şifre zorunludur.');
    vaultPassword = pw;
    if (isEncrypted) {
      try {
        const decrypted = CryptoJS.AES.decrypt(docData.content.replace('ENCRYPTED:',''), vaultPassword).toString(CryptoJS.enc.Utf8);
        if(!decrypted) throw new Error('Bad password');
        quill.root.innerHTML = decrypted;
        document.getElementById('vault-modal').classList.add('hide');
      } catch(e) {
        alert('Hatalı şifre! (Veriniz çözülemedi)');
      }
    } else {
      isEncrypted = true;
      document.getElementById('vault-modal').classList.add('hide');
      scheduleSave();
      alert('Doküman şifrelendi, artık şifresiz okunamaz.');
    }
  });

  async function saveDocument() {
    if (isSaving) return;
    isSaving = true;
    saveStatus.textContent = 'Kaydediliyor...';
    try {
      let contentToSave = quill.root.innerHTML;
      if (isEncrypted && vaultPassword) {
         contentToSave = 'ENCRYPTED:' + CryptoJS.AES.encrypt(contentToSave, vaultPassword).toString();
      }
      
      docData = await window.TykeAPI.request(`/api/documents/${docId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: docTitleInput.value, content: contentToSave })
      });
      saveStatus.textContent = 'Değişiklikler kaydedildi';
    } catch (e) {
      saveStatus.textContent = 'Hata!';
    } finally {
      isSaving = false;
      setTimeout(() => { saveStatus.style.opacity = '0.5'; }, 2000);
    }
  }

  // ── Advanced Analysis (Time, Sentiment, Target) ───────────────────────────
  function updateAnalysis() {
    const text = quill.getText().trim();
    const words = text ? text.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;
    
    // Stats
    wordCountBtn.textContent = `${wordCount} Sözcük`;
    readingTimeBtn.textContent = `${Math.ceil(wordCount / 200)} dk okuma`;
    
    // Difficulty
    let totalLen = 0; words.forEach(w => totalLen += w.length);
    const avgLen = wordCount > 0 ? totalLen / wordCount : 0;
    diffScoreBtn.textContent = `Zorluk: ${avgLen > 6.5 ? 'Akademik' : (avgLen > 4.5 ? 'Orta' : 'Kolay')}`;
    
    // Basic Sentiment
    const posWords = ['harika','mükemmel','iyi','başarılı','olumlu','süper','muhteşem'];
    const negWords = ['kötü','berbat','hata','başarısız','olumsuz','korkunç','sorun'];
    let p=0, n=0;
    const lower = text.toLowerCase();
    posWords.forEach(w => { if(lower.includes(w)) p++; });
    negWords.forEach(w => { if(lower.includes(w)) n++; });
    sentimentBtn.textContent = `Duygu: ${p > n ? 'Pozitif' : (n > p ? 'Negatif' : 'Nötr')}`;
    
    // Goal
    const goalText = document.getElementById('goal-text').textContent;
    const targetMatch = goalText.match(/\d+/);
    if(targetMatch) {
      const target = parseInt(targetMatch[0]);
      const pct = Math.min(100, Math.max(0, (wordCount / target) * 100));
      document.getElementById('goal-progress').style.width = pct + '%';
    }
  }

  document.querySelector('.goal-container').addEventListener('click', () => {
    let t = prompt('Kaç kelime yazmayı hedefliyorsunuz?');
    if(!isNaN(parseInt(t))) {
      document.getElementById('goal-text').textContent = `Hedef: ${t} Kelime`;
      updateAnalysis();
    }
  });

  // ── Auto-TOC ──────────────────────────────────────────────────────────────
  function buildTOC() {
    const lines = quill.getLines();
    const list = document.getElementById('toc-list');
    list.innerHTML = '';
    lines.forEach((line, index) => {
      const type = line.formats().header;
      if (type) {
        const text = line.domNode.innerText.trim();
        if(!text) return;
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = text;
        a.href = '#';
        a.className = `toc-h${type}`;
        a.onclick = (e) => {
          e.preventDefault();
          const offset = quill.getIndex(line);
          quill.setSelection(offset, 0);
          const bounds = quill.getBounds(offset);
          document.querySelector('.editor-workspace').scrollTo({ top: bounds.top, behavior: 'smooth' });
        };
        li.appendChild(a);
        list.appendChild(li);
      }
    });
  }

  // ── Mermaid.js Processor ──────────────────────────────────────────────────
  function processMermaid() {
    // Basic implementation: find code blocks containing mermaid
    if(typeof mermaid !== 'undefined') {
      try {
        mermaid.initialize({ startOnLoad: false });
        document.querySelectorAll('pre.ql-syntax').forEach(async el => {
          if (el.textContent.startsWith('graph ') || el.textContent.startsWith('sequenceDiagram')) {
            const id = 'mermaid-' + Date.now() + Math.floor(Math.random()*100);
            const div = document.createElement('div');
            div.className = 'mermaid-rendered';
            div.style.textAlign = 'center';
            div.style.margin = '20px 0';
            div.innerHTML = el.textContent;
            if(!el.nextElementSibling || !el.nextElementSibling.classList.contains('mermaid-rendered')) {
              el.after(div);
              mermaid.init(undefined, div);
            }
          }
        });
      } catch(e){}
    }
  }

  // ── AI Chat Sidebar ───────────────────────────────────────────────────────
  const aiSidebar = document.getElementById('ai-sidebar');
  const chatBody = document.getElementById('ai-chat-body');
  const chatInput = document.getElementById('ai-chat-input');
  
  document.getElementById('btn-ai-chat').addEventListener('click', () => {
    aiSidebar.classList.remove('hide');
  });
  document.getElementById('close-ai-sidebar').addEventListener('click', () => {
    aiSidebar.classList.add('hide');
  });

  document.getElementById('ai-chat-send').addEventListener('click', async () => {
    const val = chatInput.value.trim();
    if(!val) return;
    
    chatBody.innerHTML += `<div class="ai-message user">${val}</div>`;
    chatInput.value = '';
    chatBody.scrollTop = chatBody.scrollHeight;

    try {
      const res = await window.TykeAPI.request('/api/ai/process', {
        method: 'POST',
        body: JSON.stringify({ action: 'chat', prompt: val, text: quill.getText() })
      });
      chatBody.innerHTML += `<div class="ai-message system">${res.result}</div>`;
      chatBody.scrollTop = chatBody.scrollHeight;
    } catch(err) {
      chatBody.innerHTML += `<div class="ai-message system" style="color:red">Hata: ${err.message}</div>`;
    }
  });

  // ── Command Palette (Spotlight) ───────────────────────────────────────────
  const cmdPalette = document.getElementById('command-palette');
  const cmdInput = document.getElementById('cmd-input');
  const cmdResults = document.getElementById('cmd-results');
  
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      cmdPalette.classList.toggle('hide');
      if(!cmdPalette.classList.contains('hide')) cmdInput.focus();
    }
    if (e.key === 'Escape') {
      cmdPalette.classList.add('hide');
    }
  });

  const staticCommands = [
    { label: 'Sayfa Rengi: Retro Typewriter', action: () => document.body.className = 'editor-body theme-retro' },
    { label: 'Sayfa Rengi: Dark Terminal', action: () => document.body.className = 'editor-body theme-dark-terminal' },
    { label: 'Sayfa Rengi: Modern Ivory', action: () => document.body.className = 'editor-body theme-modern-ivory' },
    { label: 'Sayfa Rengi: Varsayılan', action: () => document.body.className = 'editor-body' },
    { label: 'Mod: Hemingway Yazım Uyarıları', action: () => { hemingwayActive = !hemingwayActive; alert('Hemingway modu ' + (hemingwayActive ? 'Açık':'Kapalı')); } },
    { label: 'Mod: Daktilo (Typewriter) Odaklanma', action: () => { typewriterActive = !typewriterActive; document.body.classList.toggle('typewriter-mode', typewriterActive); } },
    { label: 'Şifrele (Private Vault)', action: () => document.getElementById('vault-modal').classList.remove('hide') },
    { label: 'PDF Olarak Aktar', action: () => document.getElementById('btn-export-pdf').click() },
    { label: 'Okuma Odaklanma Modu (Zen)', action: () => document.getElementById('btn-zen-mode').click() }
  ];

  cmdInput.addEventListener('input', async () => {
    const val = cmdInput.value.toLowerCase();
    cmdResults.innerHTML = '';
    
    if(val.length > 0) {
      // Filter commands
      staticCommands.filter(c => c.label.toLowerCase().includes(val)).forEach(c => {
        const div = document.createElement('div');
        div.className = 'cmd-item';
        div.textContent = `[Komut] ${c.label}`;
        div.onclick = () => { c.action(); cmdPalette.classList.add('hide'); };
        cmdResults.appendChild(div);
      });
      
      // Search in DB
      try {
        const searchDocs = await window.TykeAPI.request(`/api/documents/search?q=${encodeURIComponent(val)}`);
        searchDocs.forEach(d => {
          const div = document.createElement('div');
          div.className = 'cmd-item';
          div.textContent = `📄 ${d.title}`;
          div.onclick = () => window.location.href = `editor.html?id=${d.id}`;
          cmdResults.appendChild(div);
        });
      } catch(e){}
    }
  });

  // ── Presentation Mode ─────────────────────────────────────────────────────
  let slides = [];
  let currentSlide = 0;
  
  document.getElementById('btn-presentation').addEventListener('click', () => {
    slides = [];
    const contentHtml = quill.root.innerHTML;
    // VERY simple split logic based on H1 and H2 tags
    const parts = contentHtml.split(/(<h[12]>.+?<\/h[12]>)/g);
    let slideChunk = '';
    
    parts.forEach(part => {
      if(part.startsWith('<h1') || part.startsWith('<h2')) {
        if(slideChunk.trim()) slides.push(slideChunk);
        slideChunk = part;
      } else {
        slideChunk += part;
      }
    });
    if(slideChunk.trim()) slides.push(slideChunk);
    if(slides.length === 0) slides.push(contentHtml); // fallback
    
    currentSlide = 0;
    renderSlide();
    document.getElementById('presentation-view').classList.remove('hide');
    document.documentElement.requestFullscreen?.();
  });

  function renderSlide() {
    if(!slides[currentSlide]) return;
    document.getElementById('presentation-content').innerHTML = slides[currentSlide];
  }

  document.getElementById('prev-slide').addEventListener('click', () => { if(currentSlide > 0){ currentSlide--; renderSlide(); } });
  document.getElementById('next-slide').addEventListener('click', () => { if(currentSlide < slides.length - 1){ currentSlide++; renderSlide(); } });
  document.getElementById('exit-presentation').addEventListener('click', () => { 
    document.getElementById('presentation-view').classList.add('hide'); 
    document.exitFullscreen?.();
  });

  // ── Classic Features (Zen, Fast AI, Export, Public) ──────────────────────
  document.getElementById('btn-zen-mode').addEventListener('click', () => document.body.classList.toggle('focus-mode'));
  
  const aiModal = document.getElementById('ai-modal');
  const aiResult = document.getElementById('ai-result');
  const aiTextNode = document.getElementById('ai-text');
  
  document.getElementById('btn-ai-assist').addEventListener('click', () => { aiModal.classList.remove('hide'); aiResult.classList.add('hide'); });
  document.querySelectorAll('.ai-actions .btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const text = quill.getText(quill.getSelection()?.index || 0, quill.getSelection()?.length || 0) || quill.getText();
      btn.disabled = true; btn.textContent = 'İşleniyor...';
      try {
        const res = await window.TykeAPI.request('/api/ai/process', { method: 'POST', body: JSON.stringify({ action, text }) });
        aiTextNode.textContent = res.result; aiResult.classList.remove('hide');
      } catch(e) { alert(e.message); } finally { btn.disabled = false; btn.textContent = 'İşlemi Uyarla'; }
    });
  });
  document.getElementById('btn-ai-apply').addEventListener('click', () => {
    const sel = quill.getSelection();
    if(sel && sel.length > 0) { quill.deleteText(sel.index, sel.length); quill.insertText(sel.index, aiTextNode.textContent); }
    else { quill.insertText(quill.getLength(), '\n' + aiTextNode.textContent); }
    aiModal.classList.add('hide');
  });

  document.getElementById('btn-export-pdf').addEventListener('click', () => html2pdf().from(document.querySelector('.ql-editor')).save(`${docTitleInput.value}.pdf`));
  document.getElementById('btn-export-epub').addEventListener('click', () => {
    const c = `<!DOCTYPE html><html><meta charset="utf-8"><title>${docTitleInput.value}</title><body>${quill.root.innerHTML}</body></html>`;
    const b = new Blob([c],{type:'application/epub+zip'}); const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href=u; a.download=`${docTitleInput.value}.epub`; a.click(); URL.revokeObjectURL(u);
  });
  document.getElementById('btn-delete-doc').addEventListener('click', async () => {
    if(confirm('Silinecek?')) { await window.TykeAPI.request(`/api/documents/${docId}`, {method:'DELETE'}); window.location.href='index.html'; }
  });
  
  document.getElementById('btn-public-link').addEventListener('click', async () => {
    // Generate simple share logic link
    alert(`Yayında: http://localhost:3000/public.html?id=${docId}\nBu link ile dışarıdan şifresiz okunabilir.`);
    window.open(`public.html?id=${docId}`, '_blank');
  });

  // History Reset
  document.getElementById('btn-version-history').addEventListener('click', async () => {
    const hL = document.getElementById('history-list');
    document.getElementById('history-modal').classList.remove('hide');
    docData = await window.TykeAPI.request(`/api/documents/${docId}`);
    hL.innerHTML = '';
    (docData.history||[]).forEach((ver,i) => {
      const item = document.createElement('div'); item.className='history-item';
      item.innerHTML=`<div class="history-info"><div class="history-date">${new Date(ver.updatedAt).toLocaleString()}</div></div><button class="history-btn">Dön</button>`;
      item.querySelector('button').onclick = async () => {
        if(confirm('Emin misiniz?')){
          const res = await window.TykeAPI.request(`/api/documents/${docId}/restore`,{method:'POST',body:JSON.stringify({versionIndex:i})});
          quill.root.innerHTML = res.content; document.getElementById('history-modal').classList.add('hide');
        }
      };
      hL.appendChild(item);
    });
  });

  document.getElementById('menu-file').addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('dropdown-file').classList.toggle('hide'); });
  document.addEventListener('click', () => document.getElementById('dropdown-file').classList.add('hide'));
});
