/* ============================================
   Notes System Module
   ============================================ */

const Notes = (() => {
  let currentPlaylistId = null;
  let currentVideoId = null;
  let saveTimeout = null;

  function init() {
    const editor = document.getElementById('notes-editor');
    if (!editor) return; // Not on this page
    editor.addEventListener('input', onInput);

    document.querySelectorAll('.note-tool').forEach(btn => {
      if (btn.id === 'btn-insert-timestamp') return; // Handled in player.js
      
      // Prevent focus loss on toolbar click to fix list/format bugs on selected text
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cmd = btn.dataset.cmd;
        if (cmd) {
          const arg = btn.dataset.arg || null;
          document.execCommand(cmd, false, arg);
          
          // Only explicitly toggle active modes on click, no auto-highlighting
          if (['bold', 'italic', 'underline'].includes(cmd)) {
            btn.classList.toggle('active');
          } else if (cmd === 'removeFormat') {
            document.querySelectorAll('.note-tool').forEach(b => b.classList.remove('active'));
          }
        }
      });
    });

    // Export notes button
    const exportBtn = document.getElementById('btn-export-notes');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportNotesAsPDF);
    }

    // FN-5: Notes search (highlight matching text)
    const searchInput = document.getElementById('notes-search');
    if (searchInput) {
      let searchDebounce = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => highlightSearch(searchInput.value.trim()), 250);
      });
    }
  }

  function setContext(playlistId, videoId, youtubeId) {
    currentPlaylistId = playlistId;
    currentVideoId = videoId;
    const actualYoutubeId = youtubeId || videoId;
    
    // Auto-upgrade legacy SPAN timestamps in notes editor to native anchors
    const editor = document.getElementById('notes-editor');
    if (editor) {
      editor.querySelectorAll('span.note-timestamp').forEach(span => {
        const time = span.getAttribute('data-time');
        const ytUrl = `https://www.youtube.com/watch?v=${actualYoutubeId}&t=${time}s`;
        const a = document.createElement('a');
        a.href = ytUrl;
        a.target = '_blank';
        a.className = 'note-timestamp';
        a.setAttribute('contenteditable', 'false');
        a.setAttribute('data-time', time);
        // We use innerHTML to insert the SVG icon safely
        a.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${span.innerHTML}`;
        span.parentNode.replaceChild(a, span);
      });
      editor.dispatchEvent(new Event('input')); // force save
    }

    const statusEl = document.getElementById('notes-status');
    if (statusEl) {
      statusEl.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Saved';
      statusEl.className = 'notes-status saved';
    }
  }

  function onInput() {
    const statusEl = document.getElementById('notes-status');
    if (statusEl) {
      statusEl.innerHTML = '<i class="fa-solid fa-spinner"></i> Saving...';
      statusEl.className = 'notes-status saving';
    }
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(save, 1500);
  }

  async function save() {
    if (!currentPlaylistId || !currentVideoId) return;
    const rawHtml = document.getElementById('notes-editor').innerHTML;
    // MED-2: Sanitize before persisting to Firestore — prevents stored XSS
    const html = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
    try {
      await FirestoreOps.updateVideo(currentPlaylistId, currentVideoId, { notes: html });
      const statusEl = document.getElementById('notes-status');
      if (statusEl) {
        statusEl.innerHTML = '<i class="fa-solid fa-cloud-check"></i> Saved';
        statusEl.className = 'notes-status saved';
      }
    } catch (err) {
      console.error('Notes save error:', err);
      const statusEl = document.getElementById('notes-status');
      if (statusEl) {
        statusEl.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Error';
        statusEl.className = 'notes-status error';
      }
    }
  }

  async function exportNotesAsPDF() {
    if (!currentPlaylistId || !currentVideoId) {
      showToast('No active video context', 'warning');
      return;
    }

    try {
      showToast('Generating PDF...', 'info');
      const videos = await FirestoreOps.getVideos(currentPlaylistId);
      const playlists = await FirestoreOps.getPlaylists();
      const playlist = playlists.find(p => p.id === currentPlaylistId);
      const playlistTitle = playlist ? playlist.title : 'Playlist';
      
      const currentVideo = videos.find(v => v.id === currentVideoId);
      if (!currentVideo || !currentVideo.notes || currentVideo.notes.trim() === '') {
        showToast('No notes to export for this video', 'info');
        return;
      }

      // Build the HTML wrapper
      const wrapper = document.createElement('div');
      wrapper.style.padding = '40px 50px';
      wrapper.style.fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
      wrapper.style.color = '#1e293b';
      wrapper.style.background = '#ffffff';

      // Advanced SVG Logo for PlayPulse replaced with Favicon Apple-Touch Icon
      const origin = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') 
          ? window.location.origin 
          : 'https://' + window.location.hostname;
      const logoHtml = `<img src="${origin}/favicon/apple-touch-icon.png" width="28" height="28" style="border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" />`;

      // Header Branding (Updated with deeper blue #2563eb / #3b82f6 theme instead of indigo)
      wrapper.innerHTML = `
        <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 24px; margin-bottom: 32px; display: flex; align-items: flex-start; justify-content: space-between;">
          <div style="flex: 1;">
            <h1 style="margin: 0 0 8px 0; color: #0f172a; font-size: 32px; font-weight: 800; letter-spacing: -0.5px;">${currentVideo.title || 'Video Notes'}</h1>
            <p style="margin: 0 0 4px 0; color: #64748b; font-size: 15px; font-weight: 500;">Playlist: ${playlistTitle}</p>
            <p style="margin: 0; color: #94a3b8; font-size: 13px;">Exported on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric'})}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 10px; background: #f8fafc; padding: 12px 14px; border-radius: 12px; border: 1px solid #e2e8f0;">
            ${logoHtml}
            <span style="font-weight: 800; font-size: 20px; color: #2563eb; letter-spacing: -0.5px;">PlayPulse</span>
          </div>
        </div>
      `;

      const videoHTML = formatNotesHTMLForPDF(currentVideo);
      
      const contentSection = document.createElement('div');
      contentSection.style.fontSize = '16px';
      contentSection.style.lineHeight = '1.7';
      contentSection.style.color = '#334155';
      
      // Inject some CSS rules for blockquotes and code and lists
      const styleNode = document.createElement('style');
      styleNode.innerHTML = `
        .pdf-content h1, .pdf-content h2, .pdf-content h3 { color: #0f172a; margin-top: 24px; margin-bottom: 12px; font-weight: 700; }
        .pdf-content h3 { font-size: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
        .pdf-content p { margin-bottom: 16px; }
        .pdf-content ul, .pdf-content ol { margin-bottom: 16px; padding-left: 24px; }
        .pdf-content li { margin-bottom: 8px; }
        .pdf-content mark { background: #fef08a; padding: 2px 4px; border-radius: 4px; font-weight: 500; }
        .pdf-content b, .pdf-content strong { color: #0f172a; font-weight: 700; }
        .pdf-content .note-link {
          display: inline-block;
          vertical-align: middle;
          background: #eff6ff;
          color: #2563eb;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border: 1px solid #bfdbfe;
          transition: all 0.2s;
        }
      `;
      contentSection.appendChild(styleNode);
      
      const bodyWrapper = document.createElement('div');
      bodyWrapper.className = 'pdf-content';
      bodyWrapper.innerHTML = videoHTML;
      contentSection.appendChild(bodyWrapper);
      
      wrapper.appendChild(contentSection);

      const opt = {
        margin:       [15, 15, 15, 15],
        filename:     `${(currentVideo.title || 'notes').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] },
        enableLinks:  true
      };

      if (typeof html2pdf === 'undefined') {
        throw new Error('PDF generator library not loaded');
      }

      html2pdf().set(opt).from(wrapper).save().then(() => {
         // Done
      }).catch(err => {
         console.error('PDF generation error:', err);
         showToast('Error generating PDF', 'error');
      });

    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to prepare PDF data', 'error');
    }
  }

  function formatNotesHTMLForPDF(v) {
    let html = v.notes || '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
    
    // Create professional clickable timestamp buttons for PDF (or retain newer <a> format)
    tempDiv.querySelectorAll('.note-timestamp').forEach(el => {
      if (el.tagName === 'A') {
        el.classList.remove('note-timestamp');
        el.classList.add('note-link');
      } else {
        const time = el.getAttribute('data-time');
        const actualYoutubeId = v.videoId || v.id;
        const ytUrl = `https://www.youtube.com/watch?v=${actualYoutubeId}&t=${time}s`;
        
        const a = document.createElement('a');
        a.href = ytUrl;
        a.target = '_blank';
        a.className = 'note-link';
        a.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>${el.innerHTML}`;
        
        el.parentNode.replaceChild(a, el);
      }
    });
    
    return tempDiv.innerHTML;
  }

  /* FN-5: Highlight matching text in notes editor */
  let originalHTML = null;
  function highlightSearch(query) {
    const editor = document.getElementById('notes-editor');
    if (!editor) return;
    // Restore original content if we previously highlighted
    if (originalHTML !== null) {
      editor.innerHTML = originalHTML;
    }
    if (!query || query.length < 2) {
      originalHTML = null;
      return;
    }
    originalHTML = editor.innerHTML;
    // Escape regex chars
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    // Walk text nodes and wrap matches  
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      if (!regex.test(node.textContent)) continue;
      const span = document.createElement('span');
      span.innerHTML = DOMPurify.sanitize(node.textContent.replace(regex, '<mark class="note-highlight" style="background:var(--accent);color:#fff;border-radius:2px;padding:0 2px">$1</mark>'), { ADD_TAGS: ['mark'], ADD_ATTR: ['style'] });
      node.parentNode.replaceChild(span, node);
    }
  }



  return { init, setContext, save };
})();
