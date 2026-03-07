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

    // Toolbar buttons — MED-1: replaced deprecated execCommand with Selection/Range API
    document.querySelectorAll('.note-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        applyFormatCommand(cmd);
        editor.focus();
      });
    });

    // Export notes button
    const exportBtn = document.getElementById('btn-export-notes');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportNotesAsMarkdown);
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

  function setContext(playlistId, videoId) {
    currentPlaylistId = playlistId;
    currentVideoId = videoId;
    document.getElementById('notes-status').textContent = 'Saved';
  }

  function onInput() {
    document.getElementById('notes-status').textContent = 'Saving...';
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
      document.getElementById('notes-status').textContent = 'Saved';
    } catch (err) {
      console.error('Notes save error:', err);
      document.getElementById('notes-status').textContent = 'Error saving';
    }
  }

  async function exportNotesAsMarkdown() {
    if (!currentPlaylistId) {
      showToast('No playlist context', 'warning');
      return;
    }

    try {
      const videos = await FirestoreOps.getVideos(currentPlaylistId);
      const playlists = await FirestoreOps.getPlaylists();
      const playlist = playlists.find(p => p.id === currentPlaylistId);
      const playlistTitle = playlist ? playlist.title : 'Playlist Notes';

      let md = `# ${playlistTitle}\n\n`;

      for (const v of videos) {
        if (!v.notes) continue;
        md += `## ${v.title || 'Untitled Video'}\n\n`;
        md += htmlToMarkdown(v.notes) + '\n\n';
      }

      if (md.split('\n').length <= 3) {
        showToast('No notes to export', 'info');
        return;
      }

      // Download as .md file
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${playlistTitle.replace(/[^a-zA-Z0-9]/g, '_')}_notes.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Notes exported!', 'success');
    } catch (err) {
      console.error('Export error:', err);
      showToast('Failed to export notes', 'error');
    }
  }

  function htmlToMarkdown(html) {
    let md = html;
    // Convert bold
    md = md.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    // Convert italic
    md = md.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    // Convert ordered list items with numbering
    md = md.replace(/<ol>(.*?)<\/ol>/gis, (match, inner) => {
      let counter = 0;
      return inner.replace(/<li>(.*?)<\/li>/gi, (m, content) => {
        counter++;
        return counter + '. ' + content;
      });
    });
    // Convert remaining (unordered) list items
    md = md.replace(/<li>(.*?)<\/li>/gi, '- $1');
    // Remove ul/ol tags
    md = md.replace(/<\/?ul>/gi, '');
    md = md.replace(/<\/?ol>/gi, '');
    // Convert br and div to newlines
    md = md.replace(/<br\s*\/?>/gi, '\n');
    md = md.replace(/<\/div>/gi, '\n');
    md = md.replace(/<div>/gi, '');
    md = md.replace(/<\/p>/gi, '\n');
    md = md.replace(/<p>/gi, '');
    // Strip remaining HTML tags
    md = md.replace(/<[^>]+>/g, '');
    // Decode common HTML entities
    md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    // Clean up extra newlines
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
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

  /**
   * MED-1: Modern replacement for document.execCommand.
   * Supports: bold, italic, underline, insertOrderedList, insertUnorderedList.
   */
  function applyFormatCommand(cmd) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    // List commands require execCommand (no pure Selection API equivalent)
    // They are safe here since we control the command string entirely from data-cmd attributes
    if (cmd === 'insertOrderedList' || cmd === 'insertUnorderedList') {
      // eslint-disable-next-line no-deprecated -- no Selection API equivalent for list toggling
      document.execCommand(cmd, false, null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!range || range.collapsed) return;

    const tagMap = { bold: 'STRONG', italic: 'EM', underline: 'U' };
    const tag = tagMap[cmd];
    if (!tag) return;

    // Check if selection is already wrapped in this tag — if so, unwrap it
    const ancestor = range.commonAncestorContainer;
    const existingEl = (ancestor.nodeType === 3 ? ancestor.parentElement : ancestor).closest(tag);
    if (existingEl) {
      // Unwrap: replace the element with its children
      const parent = existingEl.parentNode;
      while (existingEl.firstChild) parent.insertBefore(existingEl.firstChild, existingEl);
      parent.removeChild(existingEl);
      return;
    }

    // Wrap the selected content in the tag
    const el = document.createElement(tag);
    try {
      range.surroundContents(el);
    } catch {
      // surroundContents fails on partial selections across element boundaries
      // Fall back: extract, wrap, re-insert
      el.appendChild(range.extractContents());
      range.insertNode(el);
    }
  }

  return { init, setContext, save };
})();
