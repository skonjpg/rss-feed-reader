// Bookmarklet source (unminified for debugging)
(function() {
  function extractContent() {
    let title = document.querySelector('h1') || document.querySelector('title');
    let content = '';
    let container = null;

    // Try to find article container
    const selectors = [
      'article',
      '[role=article]',
      'main',
      '[class*=article-body]',
      '[class*=story-body]',
      '[class*=post-content]',
      '.content'
    ];

    for (const sel of selectors) {
      container = document.querySelector(sel);
      if (container && container.textContent.length > 500) {
        break;
      }
    }

    if (!container) {
      container = document.body;
    }

    // Extract text elements
    let textElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
    if (textElements.length === 0) {
      textElements = container.querySelectorAll('div');
    }

    let extracted = Array.from(textElements).map(el => {
      let text = el.textContent.trim();
      if (text.length < 30) return '';

      // Format headings
      if (el.tagName.match(/^H[1-6]$/)) {
        return '\n## ' + text + '\n';
      }

      // Format blockquotes
      if (el.tagName === 'BLOCKQUOTE') {
        return '> ' + text;
      }

      return text;
    }).filter(t => t.length > 0);

    // Deduplicate
    let uniqueLines = new Set();
    content = extracted.filter(line => {
      if (uniqueLines.has(line)) return false;
      uniqueLines.add(line);
      return true;
    }).join('\n\n');

    // Reuters-specific extraction if content is too short
    if (content.length < 200 && window.location.hostname.includes('reuters')) {
      console.log('[Reuters] Using data-testid extraction');
      let reutersParagraphs = Array.from(
        document.querySelectorAll('[data-testid*=paragraph], [data-testid*=body], [data-testid*=article], p')
      ).map(p => p.textContent.trim())
       .filter(t => {
         if (t.length < 40) return false;
         if (t.includes('Sign up')) return false;
         if (t.includes('Register')) return false;
         if (t.includes('Log in')) return false;
         if (t.includes('Reporting by') && t.length < 100) return false;
         return true;
       });

      if (reutersParagraphs.length >= 5) {
        content = reutersParagraphs.join('\n\n');
        console.log('[Reuters] Extracted ' + reutersParagraphs.length + ' paragraphs');
      }
    }

    // Final fallback
    if (content.length < 200) {
      content = container.textContent.trim();
    }

    // Format output
    let formatted = '--- ' + title.textContent.trim() + ' ---\n' +
                    'Source: ' + window.location.hostname + '\n' +
                    'URL: ' + window.location.href + '\n\n' +
                    content + '\n---\n';

    return formatted;
  }

  let result = extractContent();
  console.log('[Bookmarklet] Extracted ' + result.length + ' characters');

  // Try postMessage first
  try {
    if (window.opener && !window.opener.closed) {
      console.log('[Bookmarklet] Trying postMessage to window.opener');
      window.opener.postMessage({
        type: 'ARTICLE_CONTENT',
        content: result
      }, '*');

      // Show success notification
      let notification = document.createElement('div');
      notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:20px 30px;border-radius:8px;z-index:999999;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:sans-serif;font-weight:600;font-size:16px';
      notification.innerHTML = '✅ Article sent!<br><small style="font-weight:400;opacity:0.9">' + result.length + ' characters</small>';
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 3000);
      return;
    }
  } catch (e) {
    console.log('[Bookmarklet] postMessage failed:', e);
  }

  // Fallback to localStorage
  console.log('[Bookmarklet] Using localStorage fallback');
  localStorage.setItem('rss_article_content', JSON.stringify({
    content: result,
    timestamp: Date.now()
  }));

  // Show modal
  let modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:999999;display:flex;align-items:center;justify-content:center';

  let box = document.createElement('div');
  box.style.cssText = 'background:white;padding:30px;border-radius:12px;max-width:600px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  box.innerHTML = '<h2 style="margin:0 0 20px 0;color:#1e293b">📄 Article Extracted</h2>' +
                  '<p style="color:#10b981;margin-bottom:15px;font-weight:600">✅ Saved to clipboard + localStorage</p>' +
                  '<p style="color:#64748b;margin-bottom:20px;font-size:14px">' + result.split('\n').length + ' lines (' + result.length + ' characters)<br>Go back to RSS Reader tab - content will auto-appear!</p>' +
                  '<textarea readonly style="width:100%;height:250px;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-family:monospace;font-size:11px;resize:vertical">' + result.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</textarea>' +
                  '<div style="display:flex;gap:12px;margin-top:20px">' +
                  '<button id="copyBtn" style="flex:1;padding:12px 24px;background:#10b981;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">📋 Copy Again</button>' +
                  '<button id="closeBtn" style="padding:12px 24px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">Close</button>' +
                  '</div>';

  modal.appendChild(box);
  document.body.appendChild(modal);

  // Copy to clipboard
  navigator.clipboard.writeText(result).catch(() => {});

  // Button handlers
  document.getElementById('copyBtn').onclick = function() {
    navigator.clipboard.writeText(result).then(() => {
      this.textContent = '✅ Copied!';
      setTimeout(() => {
        this.textContent = '📋 Copy Again';
      }, 1500);
    });
  };

  document.getElementById('closeBtn').onclick = function() {
    document.body.removeChild(modal);
  };

  modal.onclick = function(e) {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  };
})();
