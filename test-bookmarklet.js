// Readable version of bookmarklet for debugging
(function() {
  function extractContent() {
    let title = document.querySelector('h1') || document.querySelector('title');
    let content = '';
    let container = null;

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

    let textElements = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
    if (textElements.length === 0) {
      textElements = container.querySelectorAll('div');
    }

    let extracted = Array.from(textElements).map(el => {
      let text = el.textContent.trim();
      if (text.length < 30) return '';
      if (el.tagName.match(/^H[1-6]$/)) {
        return '\n## ' + text + '\n';
      }
      if (el.tagName === 'BLOCKQUOTE') {
        return '> ' + text;
      }
      return text;
    }).filter(t => t.length > 0);

    let uniqueLines = new Set();
    content = extracted.filter(line => {
      if (uniqueLines.has(line)) return false;
      uniqueLines.add(line);
      return true;
    }).join('\n\n');

    if (content.length < 200) {
      content = container.textContent.trim();
    }

    let formatted = '--- ' + title.textContent.trim() + ' ---\n' +
                    'Source: ' + window.location.hostname + '\n' +
                    'URL: ' + window.location.href + '\n\n' +
                    content + '\n---\n';
    return formatted;
  }

  let result = extractContent();

  // Try to send to parent window via postMessage
  if (window.opener && !window.opener.closed) {
    try {
      window.opener.postMessage({
        type: 'ARTICLE_CONTENT',
        content: result
      }, '*');

      // Show success notification
      let notification = document.createElement('div');
      notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:20px 30px;border-radius:8px;z-index:999999;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:sans-serif;font-weight:600;font-size:16px';
      notification.textContent = '✅ Article sent to RSS Reader!';
      document.body.appendChild(notification);

      setTimeout(() => {
        document.body.removeChild(notification);
      }, 2000);

      return; // Don't show modal
    } catch (e) {
      console.log('Could not send to parent:', e);
    }
  }

  // Fallback: show modal with copy button
  let modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center';

  let box = document.createElement('div');
  box.style.cssText = 'background:white;padding:30px;border-radius:12px;max-width:600px;max-height:80vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3)';
  box.innerHTML = '<h2 style="margin:0 0 20px 0;color:#1e293b">📄 Article Extracted</h2>' +
    '<p style="color:#64748b;margin-bottom:20px">' + result.split('\n').length + ' lines extracted (' + result.length + ' characters)</p>' +
    '<textarea readonly style="width:100%;height:300px;padding:12px;border:2px solid #e2e8f0;border-radius:8px;font-family:monospace;font-size:12px;resize:vertical">' +
    result.replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</textarea>' +
    '<div style="display:flex;gap:12px;margin-top:20px">' +
    '<button id="copyBtn" style="flex:1;padding:12px 24px;background:#10b981;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer">📋 Copy to Clipboard</button>' +
    '<button id="closeBtn" style="padding:12px 24px;background:#64748b;color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer">Close</button>' +
    '</div>';

  modal.appendChild(box);
  document.body.appendChild(modal);

  document.getElementById('copyBtn').onclick = function() {
    navigator.clipboard.writeText(result).then(() => {
      this.textContent = '✅ Copied!';
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 800);
    }).catch(() => {
      alert('Please copy manually from the text box');
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
