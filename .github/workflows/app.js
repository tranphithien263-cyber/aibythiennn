const WORKER_URL = 'https://ff-ai.YOUR-SUBDOMAIN.workers.dev';

const chat = document.getElementById('chat');
const input = document.getElementById('input');
const sendBtn = document.getElementById('send');
const clearBtn = document.getElementById('clearBtn');

const STORAGE_KEY = 'ffai_history_v1';
let history = [];
try { history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch {}
let sending = false;

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderMarkdown(text) {
  let h = escapeHtml(text);
  h = h.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code.trim()}</code></pre>`);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/^\s*[-*] (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
  h = h.split(/\n{2,}/).map((p) => {
    if (/^<(ul|pre|h3)/.test(p.trim())) return p;
    return p.trim() ? `<p>${p.replace(/\n/g, '<br>')}</p>` : '';
  }).join('');
  return h;
}

function scrollBottom() {
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
}

function removeWelcome() {
  const w = chat.querySelector('.welcome');
  if (w) w.remove();
}

function addMsg(role, html, isHtml = false) {
  removeWelcome();
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  if (isHtml) div.innerHTML = html;
  else div.textContent = html;
  chat.appendChild(div);
  scrollBottom();
  return div;
}

function addTyping() {
  removeWelcome();
  const div = document.createElement('div');
  div.className = 'msg bot typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  chat.appendChild(div);
  scrollBottom();
  return div;
}

function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); } catch {}
}

function restoreHistory() {
  if (history.length === 0) return;
  removeWelcome();
  for (const m of history) {
    if (m.role === 'user') addMsg('user', m.content);
    else addMsg('bot', renderMarkdown(m.content), true);
  }
}

async function sendMessage(text) {
  if (sending || !text.trim()) return;
  sending = true;
  sendBtn.disabled = true;

  addMsg('user', text);
  history.push({ role: 'user', content: text });
  saveHistory();

  const typing = addTyping();
  let acc = '';

  try {
    const res = await fetch(`${WORKER_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-20) })
    });

    if (!res.ok || !res.body) {
      typing.remove();
      const err = await res.text();
      addMsg('bot', 'Lỗi: ' + err);
      return;
    }

    typing.remove();
    const botDiv = addMsg('bot', '', true);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) {
            acc += delta;
            botDiv.innerHTML = renderMarkdown(acc);
            scrollBottom();
          }
        } catch {}
      }
    }

    if (acc) {
      history.push({ role: 'assistant', content: acc });
      saveHistory();
    }
  } catch (err) {
    typing.remove();
    addMsg('bot', 'Lỗi kết nối: ' + err.message);
  } finally {
    sending = false;
    sendBtn.disabled = input.value.trim() === '';
    input.focus();
  }
}

sendBtn.addEventListener('click', () => {
  const t = input.value.trim();
  if (t) { input.value = ''; autoResize(); sendMessage(t); }
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const t = input.value.trim();
    if (t) { input.value = ''; autoResize(); sendMessage(t); }
  }
});

function autoResize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  sendBtn.disabled = input.value.trim() === '' || sending;
}
input.addEventListener('input', autoResize);

clearBtn.addEventListener('click', () => {
  history = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  chat.innerHTML = '';
  location.reload();
});

document.querySelectorAll('.chip').forEach((c) => {
  c.addEventListener('click', () => sendMessage(c.dataset.q));
});

restoreHistory();
input.focus();
