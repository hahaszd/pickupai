(function () {
  "use strict";

  var STORAGE_KEY = "pickupai_chat";
  var API_URL = "/api/chat";
  var WELCOME_MSG = "Hi! I\u2019m the PickupAI assistant. Ask me anything about how our AI receptionist works for tradies.";

  // ── Styles ────────────────────────────────────────────────────────────────

  var css = '\
#pai-chat-bubble {\
  position: fixed; bottom: 24px; right: 24px; z-index: 99999;\
  width: 56px; height: 56px; border-radius: 50%;\
  background: #2563eb; color: #fff; border: none; cursor: pointer;\
  box-shadow: 0 4px 16px rgba(37,99,235,.4);\
  display: flex; align-items: center; justify-content: center;\
  transition: transform .2s, box-shadow .2s;\
}\
#pai-chat-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(37,99,235,.5); }\
#pai-chat-bubble svg { width: 26px; height: 26px; fill: #fff; }\
#pai-chat-bubble .pai-close-x { display: none; }\
#pai-chat-bubble.open svg.pai-chat-icon { display: none; }\
#pai-chat-bubble.open .pai-close-x { display: block; font-size: 24px; font-weight: 700; line-height: 1; }\
\
#pai-chat-panel {\
  position: fixed; bottom: 92px; right: 24px; z-index: 99998;\
  width: 380px; max-height: 520px; border-radius: 16px;\
  background: #fff; box-shadow: 0 8px 40px rgba(0,0,0,.18);\
  display: none; flex-direction: column; overflow: hidden;\
  font-family: system-ui, -apple-system, sans-serif;\
}\
#pai-chat-panel.open { display: flex; }\
\
#pai-chat-header {\
  background: #2563eb; color: #fff; padding: 14px 16px;\
  font-weight: 700; font-size: .95rem; display: flex; align-items: center; gap: 8px;\
  flex-shrink: 0;\
}\
#pai-chat-header .pai-dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; flex-shrink: 0; }\
\
#pai-chat-messages {\
  flex: 1; overflow-y: auto; padding: 16px;\
  display: flex; flex-direction: column; gap: 10px;\
  min-height: 200px; max-height: 360px;\
  background: #f8fafc;\
}\
\
.pai-msg {\
  max-width: 82%; padding: 10px 14px; border-radius: 14px;\
  font-size: .88rem; line-height: 1.5; word-wrap: break-word;\
  white-space: pre-wrap;\
}\
.pai-msg a { color: #2563eb; text-decoration: underline; }\
.pai-msg-assistant { background: #fff; color: #1e293b; align-self: flex-start;\
  border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; }\
.pai-msg-user { background: #2563eb; color: #fff; align-self: flex-end;\
  border-bottom-right-radius: 4px; }\
.pai-msg-typing { background: #fff; color: #94a3b8; align-self: flex-start;\
  border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; font-style: italic; }\
\
#pai-chat-input-wrap {\
  display: flex; border-top: 1px solid #e2e8f0; background: #fff;\
  flex-shrink: 0;\
}\
#pai-chat-input {\
  flex: 1; border: none; outline: none; padding: 12px 14px;\
  font-size: .9rem; font-family: inherit; resize: none;\
  max-height: 80px; line-height: 1.4;\
}\
#pai-chat-input::placeholder { color: #94a3b8; }\
#pai-chat-send {\
  background: none; border: none; color: #2563eb; padding: 0 14px;\
  cursor: pointer; font-size: 1.2rem; flex-shrink: 0;\
  display: flex; align-items: center;\
}\
#pai-chat-send:disabled { color: #cbd5e1; cursor: default; }\
#pai-chat-send svg { width: 20px; height: 20px; }\
\
#pai-chat-unavailable {\
  padding: 20px; text-align: center; color: #64748b; font-size: .88rem;\
}\
\
@media (max-width: 640px) {\
  #pai-chat-panel { right: 0; bottom: 0; left: 0; width: 100%; max-height: 100vh;\
    border-radius: 16px 16px 0 0; max-height: 85vh; }\
  #pai-chat-bubble { bottom: 80px; right: 16px; }\
}';

  // ── Inject styles ─────────────────────────────────────────────────────────

  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ── Build DOM ─────────────────────────────────────────────────────────────

  var bubble = document.createElement("button");
  bubble.id = "pai-chat-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML =
    '<svg class="pai-chat-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>' +
    '<span class="pai-close-x">\u00D7</span>';

  var panel = document.createElement("div");
  panel.id = "pai-chat-panel";
  panel.innerHTML =
    '<div id="pai-chat-header"><span class="pai-dot"></span>PickupAI Assistant</div>' +
    '<div id="pai-chat-messages"></div>' +
    '<div id="pai-chat-input-wrap">' +
    '  <textarea id="pai-chat-input" rows="1" placeholder="Ask a question\u2026"></textarea>' +
    '  <button id="pai-chat-send" aria-label="Send"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
    "</div>";

  document.body.appendChild(panel);
  document.body.appendChild(bubble);

  var messagesEl = document.getElementById("pai-chat-messages");
  var inputEl = document.getElementById("pai-chat-input");
  var sendBtn = document.getElementById("pai-chat-send");

  // ── State ─────────────────────────────────────────────────────────────────

  var messages = []; // { role, content }
  var isOpen = false;
  var isStreaming = false;
  var chatAvailable = true;

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) messages = JSON.parse(raw);
    } catch (_) { /* ignore */ }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch (_) { /* ignore */ }
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function linkify(text) {
    return text.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    ).replace(
      /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g,
      '<a href="mailto:$1">$1</a>'
    );
  }

  function renderMessages() {
    var html = "";
    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var cls = m.role === "user" ? "pai-msg-user" : "pai-msg-assistant";
      html += '<div class="pai-msg ' + cls + '">' + linkify(escapeHtml(m.content)) + "</div>";
    }
    messagesEl.innerHTML = html;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addWelcome() {
    if (messages.length === 0) {
      messages.push({ role: "assistant", content: WELCOME_MSG });
      saveHistory();
    }
  }

  function appendStreaming(token) {
    var last = messagesEl.lastElementChild;
    if (last && last.classList.contains("pai-msg-typing")) {
      last.className = "pai-msg pai-msg-assistant";
      last.innerHTML = "";
    }
    if (!last || !last.classList.contains("pai-msg-assistant") || last.dataset.final === "1") {
      var div = document.createElement("div");
      div.className = "pai-msg pai-msg-assistant";
      messagesEl.appendChild(div);
      last = div;
    }
    var existing = last.getAttribute("data-raw") || "";
    existing += token;
    last.setAttribute("data-raw", existing);
    last.innerHTML = linkify(escapeHtml(existing));
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return existing;
  }

  function showTyping() {
    var div = document.createElement("div");
    div.className = "pai-msg pai-msg-typing";
    div.textContent = "Thinking\u2026";
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function removeTyping() {
    var el = messagesEl.querySelector(".pai-msg-typing");
    if (el) el.remove();
  }

  // ── API ───────────────────────────────────────────────────────────────────

  async function sendMessage(text) {
    if (isStreaming || !text.trim()) return;
    isStreaming = true;
    sendBtn.disabled = true;

    messages.push({ role: "user", content: text.trim() });
    saveHistory();
    renderMessages();
    inputEl.value = "";
    autoResize();
    showTyping();

    var historyToSend = messages.filter(function (m) {
      return m.role === "user" || m.role === "assistant";
    }).filter(function (m) {
      return m.content !== WELCOME_MSG;
    });

    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyToSend }),
        credentials: "same-origin",
      });

      if (!res.ok) {
        var err = await res.json().catch(function () { return {}; });
        removeTyping();
        if (res.status === 503) {
          chatAvailable = false;
          showUnavailable();
        } else {
          messages.push({
            role: "assistant",
            content: err.error || "Sorry, something went wrong. Please try again.",
          });
          saveHistory();
          renderMessages();
        }
        isStreaming = false;
        sendBtn.disabled = false;
        return;
      }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var fullText = "";
      var sseBuffer = "";

      while (true) {
        var result = await reader.read();
        if (result.done) break;
        sseBuffer += decoder.decode(result.value, { stream: true });

        var sseLines = sseBuffer.split("\n");
        sseBuffer = sseLines.pop() || "";

        for (var li = 0; li < sseLines.length; li++) {
          var line = sseLines[li].trim();
          if (!line.startsWith("data: ")) continue;
          var payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            var parsed = JSON.parse(payload);
            if (parsed.token) {
              fullText = appendStreaming(parsed.token);
            }
          } catch (_) { /* skip */ }
        }
      }

      if (fullText) {
        var lastEl = messagesEl.lastElementChild;
        if (lastEl) lastEl.dataset.final = "1";
        messages.push({ role: "assistant", content: fullText });
        saveHistory();
      }
      removeTyping();
    } catch (e) {
      console.error("[PickupAI Chat]", e);
      removeTyping();
      messages.push({
        role: "assistant",
        content: "Connection error. Please check your internet and try again.",
      });
      saveHistory();
      renderMessages();
    }

    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }

  function showUnavailable() {
    var inputWrap = document.getElementById("pai-chat-input-wrap");
    if (inputWrap) {
      inputWrap.innerHTML =
        '<div id="pai-chat-unavailable">Chat is temporarily unavailable. Please email <a href="mailto:hello@getpickupai.com.au">hello@getpickupai.com.au</a>.</div>';
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  function toggle() {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    bubble.classList.toggle("open", isOpen);
    bubble.setAttribute("aria-label", isOpen ? "Close chat" : "Open chat");
    if (isOpen) {
      addWelcome();
      renderMessages();
      inputEl.focus();
    }
  }

  function autoResize() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + "px";
  }

  bubble.addEventListener("click", toggle);

  sendBtn.addEventListener("click", function () {
    sendMessage(inputEl.value);
  });

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  inputEl.addEventListener("input", autoResize);

  // ── Initialise ────────────────────────────────────────────────────────────
  loadHistory();
})();
