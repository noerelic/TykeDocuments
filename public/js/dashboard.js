// public/js/dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const username = localStorage.getItem('tyke_username') || 'U';
  document.getElementById('user-avatar').textContent = username.charAt(0).toUpperCase();

  document.getElementById('logout-btn').addEventListener('click', () => {
    window.TykeAPI.logout();
  });

  const TEMPLATES = {
    blank: { title: 'Başlıksız Doküman', content: '' },
    cv: { 
      title: 'Özgeçmiş - Tyke', 
      content: '<h1 style="text-align: center;">ÖZGEÇMİŞ</h1><hr><p><strong>Kişisel Bilgiler</strong></p><ul><li>Ad Soyad: ...</li><li>E-posta: ...</li></ul><p><strong>Eğitim</strong></p><ul><li>Üniversite: ...</li></ul>' 
    },
    report: { 
      title: 'Haftalık Rapor', 
      content: '<h1>Haftalık Faaliyet Raporu</h1><p>Bu bölüm rapor özetini içerir.</p><h2>Yapılan Çalışmalar</h2><ul><li>...</li></ul>' 
    },
    letter: { 
      title: 'Resmi Mektup', 
      content: '<p style="text-align: right;">Tarih: ' + new Date().toLocaleDateString('tr-TR') + '</p><br><p>Sayın ..., </p><p>Metin buraya gelecektir.</p><br><p>Saygılarımla,</p>' 
    }
  };

  let allDocs = [];
  let allFolders = [];
  let currentFolderId = null;

  // ── FOLDER LOGIC ──────────────────────────────────────────────────────────
  const loadFolders = async () => {
    try {
      allFolders = await window.TykeAPI.request('/api/folders');
      renderFolders(allFolders);
    } catch (e) { console.error('Klasörler yüklenemedi'); }
  };

  const renderFolders = (folders) => {
    const list = document.getElementById('folders-list');
    list.innerHTML = `
      <div class="folder-item ${!currentFolderId ? 'active' : ''}" data-id="null">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        Tümü
      </div>
    `;
    
    folders.forEach(f => {
      const item = document.createElement('div');
      item.className = `folder-item ${currentFolderId === f.id ? 'active' : ''}`;
      item.dataset.id = f.id;
      item.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        ${f.name}
      `;
      
      // DROP ZONE
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });
      item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const docId = e.dataTransfer.getData('docId');
        if (docId) {
          await window.TykeAPI.request(`/api/documents/${docId}`, {
            method: 'PUT',
            body: JSON.stringify({ folderId: f.id })
          });
          loadDocuments();
        }
      });

      item.addEventListener('click', () => {
        currentFolderId = f.id;
        document.getElementById('current-folder-title').textContent = f.name;
        renderFolders(allFolders);
        filterAndRender();
      });
      list.appendChild(item);
    });

    // Reset to "All"
    list.querySelector('[data-id="null"]').addEventListener('click', () => {
      currentFolderId = null;
      document.getElementById('current-folder-title').textContent = 'Son Dokümanlar';
      renderFolders(allFolders);
      filterAndRender();
    });
  };

  document.getElementById('add-folder-btn').addEventListener('click', async () => {
    const name = prompt('Klasör ismi:');
    if (name) {
      await window.TykeAPI.request('/api/folders', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      loadFolders();
    }
  });

  // ── DOCUMENT LOGIC ────────────────────────────────────────────────────────
  const loadDocuments = async () => {
    try {
      allDocs = await window.TykeAPI.request('/api/documents');
      filterAndRender();
    } catch (e) {
      document.getElementById('documents-grid').innerHTML = '<div class="loading">Yüklenemedi.</div>';
    }
  };

  const filterAndRender = () => {
    let filtered = allDocs;
    if (currentFolderId) {
      filtered = allDocs.filter(d => d.folderId === currentFolderId);
    }
    const term = document.getElementById('search-input').value.toLowerCase();
    if (term) {
      filtered = filtered.filter(d => d.title.toLowerCase().includes(term));
    }
    renderDocuments(filtered);
  };

  const renderDocuments = (docs) => {
    const grid = document.getElementById('documents-grid');
    grid.innerHTML = '';
    
    docs.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'doc-card';
      card.setAttribute('draggable', 'true');
      card.dataset.id = doc.id;
      
      const tagsHtml = (doc.tags || []).map(t => `<span class="tag">${t}</span>`).join('');
      
      card.innerHTML = `
        <div class="doc-icon">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        </div>
        <div class="doc-details">
          <div class="doc-title">${doc.title}</div>
          <div class="doc-date">${new Date(doc.updatedAt).toLocaleDateString()}</div>
          <div class="tags-list">${tagsHtml}</div>
        </div>
        <button class="doc-delete-btn" data-id="${doc.id}">&times;</button>
      `;

      // DRAG START
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('docId', doc.id);
        card.classList.add('dragging');
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));

      card.addEventListener('click', (e) => {
        if (!e.target.closest('.doc-delete-btn')) window.location.href = `editor.html?id=${doc.id}`;
      });

      card.querySelector('.doc-delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Silmek istediğine emin misin?')) {
          await window.TykeAPI.request(`/api/documents/${doc.id}`, { method: 'DELETE' });
          loadDocuments();
        }
      });

      grid.appendChild(card);
    });
  };

  // ── QUICK LOOK (SPACE KEY) ────────────────────────────────────────────────
  let focusedDocId = null;
  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest('.doc-card');
    focusedDocId = card ? card.dataset.id : null;
  });

  window.addEventListener('keydown', async (e) => {
    if (e.code === 'Space' && focusedDocId && !document.activeElement.tagName.match(/INPUT|TEXTAREA/)) {
      e.preventDefault();
      const doc = await window.TykeAPI.request(`/api/documents/${focusedDocId}`);
      document.getElementById('quick-look-title').textContent = doc.title;
      document.getElementById('quick-look-body').innerHTML = doc.content;
      document.getElementById('quick-look-modal').classList.remove('hide');
    }
  });

  document.getElementById('close-quick-look').addEventListener('click', () => {
    document.getElementById('quick-look-modal').classList.add('hide');
  });

  // ── TEMPLATE & IMPORT ─────────────────────────────────────────────────────
  document.querySelectorAll('.create-card').forEach(card => {
    card.addEventListener('click', async (e) => {
      const template = TEMPLATES[e.currentTarget.dataset.template || 'blank'];
      const doc = await window.TykeAPI.request('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ ...template, folderId: currentFolderId })
      });
      window.location.href = `editor.html?id=${doc.id}`;
    });
  });

  document.getElementById('import-tdtf').addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const data = JSON.parse(ev.target.result);
      const doc = await window.TykeAPI.request('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: data.title, content: data.content, folderId: currentFolderId })
      });
      window.location.href = `editor.html?id=${doc.id}`;
    };
    reader.readAsText(file);
  });

  document.getElementById('search-input').addEventListener('input', filterAndRender);

  // ── NETWORK GRAPH (D3.js) ─────────────────────────────────────────────────
  document.getElementById('btn-show-graph')?.addEventListener('click', async () => {
    document.getElementById('graph-modal').classList.remove('hide');
    const container = document.getElementById('graph-container');
    container.innerHTML = '';
    
    // Parse links
    const nodes = [];
    const links = [];
    
    allDocs.forEach(d => {
      nodes.push({ id: d.id, title: d.title });
      
      if(!d.content) return;
      // Very basic link extraction logic for bi-directional links
      const regex = /href="editor\.html\?id=([\w-]+)"/g;
      let match;
      while ((match = regex.exec(d.content)) !== null) {
        if(match[1] !== d.id) {
           links.push({ source: d.id, target: match[1] });
        }
      }
    });

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const svg = d3.select("#graph-container")
      .append("svg")
      .attr("width", "100%")
      .attr("height", "100%")
      .call(d3.zoom().on("zoom", (event) => svgGroup.attr("transform", event.transform)));
      
    const svgGroup = svg.append("g");

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svgGroup.append("g")
      .attr("stroke", "var(--border-color)")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    const node = svgGroup.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 15)
      .attr("fill", "var(--text-primary)")
      .on('click', (e, d) => window.location.href = `editor.html?id=${d.id}`)
      .call(dTreeDrag(simulation));

    const label = svgGroup.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(d => d.title)
      .attr("font-size", 12)
      .attr("dx", 20)
      .attr("dy", 5)
      .attr("fill", "var(--text-primary)");

    simulation.on("tick", () => {
      link.attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
      node.attr("cx", d => d.x)
          .attr("cy", d => d.y);
      label.attr("x", d => d.x)
           .attr("y", d => d.y);
    });

    function dTreeDrag(sim) {
      function dragstarted(event) {
        if (!event.active) sim.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      function dragended(event) {
        if (!event.active) sim.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }
  });

  document.getElementById('close-graph')?.addEventListener('click', () => {
    document.getElementById('graph-modal').classList.add('hide');
  });

  loadFolders();
  loadDocuments();
});
