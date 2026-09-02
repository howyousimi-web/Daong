/**
 * ai-assistant-toggle.js
 * -----------------------------------------------------------------
 * Part of a self-contained component:
 *   ai-assistant-toggle.css   (styles)
 *   ai-assistant-toggle.js    (this file)
 * (markup lives inline in each page, between the BEGIN/END AI
 * ASSISTANT TOGGLE COMPONENT comments)
 *
 * Everything below is wrapped in an IIFE, so nothing this file
 * declares ΓÇö not one constant, not the class itself ΓÇö leaks into
 * the host page's global scope. The only thing exposed globally is
 * a single, clearly-namespaced reference to the running instance
 * (see the bottom of this file), so a host page can optionally call
 * .open() / .close() from its own code without any collision risk.
 *
 * This file expects the #aiat-root markup to already exist in the
 * page ΓÇö it does not build or inject any HTML itself, so the markup
 * stays visible and editable wherever it's copied.
 *
 * BACKEND INTEGRATION POINT: search for requestAssistantReply()
 * below ΓÇö that is the one function to replace with a real call to
 * a Flutter/Dart backend (or any other API) once one exists. Until
 * then it only returns generic placeholder text ΓÇö this component
 * does not carry over the old DAONG Assistant's rule-based commands
 * (track a donation, open a page, log in/out, switch theme).
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  // Keep in sync with the @media (max-width: ...) breakpoint in
  // ai-assistant-toggle.css's "RESPONSIVE: SMALL SCREENS" section.
  const AIAT_MOBILE_BREAKPOINT = 640;
  const AIAT_DRAG_THRESHOLD_PX = 6;
  const AIAT_STORAGE_KEY = 'aiat_toggle_position';
  const AIAT_MOCK_LATENCY_MS = 600; // simulated "thinking" delay for the placeholder reply

  // Generic, brand-neutral placeholder replies ΓÇö swap these out, or
  // replace requestAssistantReply() entirely, once a real backend exists.
  const AIAT_PLACEHOLDER_REPLIES = [
    "This is a placeholder response. Connect a real backend inside requestAssistantReply() in ai-assistant-toggle.js to enable live replies.",
    "Thanks for the message ΓÇö this demo doesn't have a live AI connected yet.",
    'Placeholder reply: wire up your Flutter/Dart backend here to make this real.',
  ];

  /**
   * BACKEND INTEGRATION POINT
   * Replace the body of this function with a real call ΓÇö a fetch()
   * to your API, or a message posted to a Flutter WebView bridge.
   * It must keep returning a Promise that resolves to { reply }.
   * @param {string} message - the user's message
   * @param {Array<{role: string, text: string}>} history - recent turns
   */
  function requestAssistantReply(message, history) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const reply = AIAT_PLACEHOLDER_REPLIES[Math.floor(Math.random() * AIAT_PLACEHOLDER_REPLIES.length)];
        resolve({ ok: true, reply });
      }, AIAT_MOCK_LATENCY_MS);
    });
  }

  class AIAssistantToggle {
    constructor() {
      this.toggle = document.getElementById('aiat-toggle');
      this.panel = document.getElementById('aiat-panel');
      this.closeBtn = document.getElementById('aiat-close');
      this.messagesEl = document.getElementById('aiat-messages');
      this.form = document.getElementById('aiat-form');
      this.input = document.getElementById('aiat-input');
      this.sendBtn = document.getElementById('aiat-send');

      if (!this.toggle || !this.panel || !this.closeBtn || !this.messagesEl || !this.form || !this.input || !this.sendBtn) {
        console.warn('AIAssistantToggle: expected markup was not found on this page. Copy the full #aiat-root block into the page.');
        return;
      }

      this.messages = [];
      this._typingEl = null;

      this._restorePosition();
      this._bindDrag();
      this._bindPanel();
      this._seedGreeting();

      window.addEventListener('resize', () => {
        this._clampToggleToViewport();
        if (this._isOpen()) this._positionPanel();
      });
    }

    /* =========================================================
       DRAGGING
       A drag is tracked via Pointer Events (mouse + touch + pen in
       one API). A short distance threshold decides whether a
       press-and-release counts as a "click" (open/close the panel)
       or a "drag" (reposition the button) ΓÇö see suppressClick below.
       ========================================================= */
    _bindDrag() {
      const drag = { pointerId: null, startX: 0, startY: 0, originLeft: 0, originTop: 0, moved: false };
      let suppressClick = false;

      this.toggle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return; // primary mouse button / touch / pen only
        const rect = this.toggle.getBoundingClientRect();
        drag.pointerId = e.pointerId;
        drag.startX = e.clientX;
        drag.startY = e.clientY;
        drag.originLeft = rect.left;
        drag.originTop = rect.top;
        drag.moved = false;
        this.toggle.setPointerCapture(e.pointerId);
      });

      this.toggle.addEventListener('pointermove', (e) => {
        if (e.pointerId !== drag.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < AIAT_DRAG_THRESHOLD_PX) return;
        if (!drag.moved) {
          drag.moved = true;
          this.toggle.classList.add('is-dragging');
        }
        this._setTogglePosition(drag.originLeft + dx, drag.originTop + dy);
      });

      const endDrag = (e) => {
        if (e.pointerId !== drag.pointerId) return;
        if (this.toggle.hasPointerCapture(e.pointerId)) this.toggle.releasePointerCapture(e.pointerId);
        this.toggle.classList.remove('is-dragging');
        if (drag.moved) {
          suppressClick = true; // a click always fires right after pointerup ΓÇö swallow that one
          this._saveTogglePosition();
        }
        drag.pointerId = null;
        drag.moved = false;
      };
      this.toggle.addEventListener('pointerup', endDrag);
      this.toggle.addEventListener('pointercancel', endDrag);

      this.toggle.addEventListener('click', (e) => {
        if (suppressClick) {
          suppressClick = false;
          e.preventDefault();
          return;
        }
        this.togglePanel();
      });
    }

    _setTogglePosition(left, top) {
      const maxLeft = Math.max(window.innerWidth - this.toggle.offsetWidth, 0);
      const maxTop = Math.max(window.innerHeight - this.toggle.offsetHeight, 0);
      const clampedLeft = Math.min(Math.max(left, 0), maxLeft);
      const clampedTop = Math.min(Math.max(top, 0), maxTop);
      this.toggle.style.left = `${clampedLeft}px`;
      this.toggle.style.top = `${clampedTop}px`;
      this.toggle.style.right = 'auto';
      this.toggle.style.bottom = 'auto';
      if (this._isOpen()) this._positionPanel();
    }

    // Remembers where the button was dropped, so repeated use during
    // a session (or across reloads on the same page) keeps the last
    // position. Safe to delete this and _restorePosition's call if a
    // host page doesn't want that persistence.
    _saveTogglePosition() {
      const rect = this.toggle.getBoundingClientRect();
      try {
        localStorage.setItem(AIAT_STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
      } catch { /* storage unavailable */ }
    }

    _restorePosition() {
      let saved = null;
      try {
        saved = JSON.parse(localStorage.getItem(AIAT_STORAGE_KEY));
      } catch { /* malformed or missing value ΓÇö keep the CSS default corner */ }
      if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
        this._setTogglePosition(saved.left, saved.top);
      }
    }

    _clampToggleToViewport() {
      if (!this.toggle.style.left) return; // still at its default CSS corner, nothing can be off-screen
      const rect = this.toggle.getBoundingClientRect();
      this._setTogglePosition(rect.left, rect.top);
    }

    /* =========================================================
       OPEN / CLOSE
       ========================================================= */
    _bindPanel() {
      this.closeBtn.addEventListener('click', () => this.close());

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this._handleSend();
      });

      this.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._handleSend();
        }
        // Shift+Enter is left alone so the textarea inserts a normal newline.
      });

      this.input.addEventListener('input', () => {
        this._autoGrowInput();
        this.sendBtn.disabled = !this.input.value.trim();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen()) this.close();
      });

      document.addEventListener('click', (e) => {
        if (this._isOpen() && !this.panel.contains(e.target) && e.target !== this.toggle) {
          this.close();
        }
      });
    }

    _isOpen() { return this.panel.classList.contains('is-open'); }

    togglePanel() { this._isOpen() ? this.close() : this.open(); }

    open() {
      this._positionPanel();
      this.panel.classList.add('is-open');
      this.panel.removeAttribute('inert');
      this.toggle.setAttribute('aria-expanded', 'true');
      this.toggle.setAttribute('aria-label', 'Close AI assistant');
      this.input.focus();
    }

    close() {
      this.panel.classList.remove('is-open');
      this.panel.setAttribute('inert', '');
      this.toggle.setAttribute('aria-expanded', 'false');
      this.toggle.setAttribute('aria-label', 'Open AI assistant');
      this.toggle.focus();
    }

    // Anchors the panel near the button: prefers opening above it,
    // flips below if there isn't room, and clamps horizontally. Below
    // AIAT_MOBILE_BREAKPOINT this is a no-op so the CSS bottom-sheet
    // layout (ai-assistant-toggle.css) can take over instead.
    _positionPanel() {
      if (window.innerWidth <= AIAT_MOBILE_BREAKPOINT) {
        this.panel.style.left = '';
        this.panel.style.top = '';
        this.panel.style.right = '';
        this.panel.style.bottom = '';
        return;
      }

      const toggleRect = this.toggle.getBoundingClientRect();
      const panelWidth = this.panel.offsetWidth || 360;
      const panelHeight = this.panel.offsetHeight || 480;
      const margin = 16;

      const opensAbove = toggleRect.top - panelHeight - margin > 0;
      const top = opensAbove
        ? toggleRect.top - panelHeight - margin
        : Math.min(toggleRect.bottom + margin, window.innerHeight - panelHeight - margin);

      let left = toggleRect.right - panelWidth;
      left = Math.min(Math.max(left, margin), window.innerWidth - panelWidth - margin);

      this.panel.style.top = `${Math.max(top, margin)}px`;
      this.panel.style.left = `${left}px`;
      this.panel.style.right = 'auto';
      this.panel.style.bottom = 'auto';
    }

    _autoGrowInput() {
      this.input.style.height = 'auto';
      this.input.style.height = `${Math.min(this.input.scrollHeight, 120)}px`;
    }

    /* =========================================================
       MESSAGING
       Everything here only ever calls requestAssistantReply() ΓÇö
       swap that one function's insides out for a real backend and
       nothing else in this file needs to change.
       ========================================================= */
    async _handleSend() {
      const text = this.input.value.trim();
      if (!text) return;

      // ---- add the user's message to the chat interface ----
      this._appendMessage('user', text);
      this.input.value = '';
      this._autoGrowInput();
      this.sendBtn.disabled = true;

      // ---- loading state ----
      this._setLoading(true);

      try {
        // ---- send to backend / receive AI response ----
        const result = await requestAssistantReply(text, this._recentHistory());
        if (result.ok) {
          this._appendMessage('ai', result.reply);
        } else {
          this._appendMessage('system', 'Sorry, the assistant is unavailable right now. Please try again in a moment.', true);
        }
      } catch (err) {
        // ---- error state ----
        this._appendMessage('system', 'Something went wrong sending that message. Please try again.', true);
      } finally {
        this._setLoading(false);
      }
    }

    _recentHistory() {
      // Reshape however a real backend expects prior turns.
      return this.messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
    }

    _setLoading(isLoading) {
      this.input.disabled = isLoading;
      if (isLoading) {
        this._showTyping();
      } else {
        this._hideTyping();
        this.input.focus();
      }
    }

    _showTyping() {
      if (this._typingEl) return;
      const bubble = document.createElement('div');
      bubble.className = 'aiat-msg aiat-msg-ai aiat-msg-typing';
      bubble.setAttribute('aria-label', 'Assistant is typing');
      bubble.innerHTML = '<span></span><span></span><span></span>'; // static markup, no user data ΓÇö safe as innerHTML
      this.messagesEl.appendChild(bubble);
      this._typingEl = bubble;
      this._scrollToBottom();
    }

    _hideTyping() {
      if (!this._typingEl) return;
      this._typingEl.remove();
      this._typingEl = null;
    }

    // ---- adding messages to the chat interface ----
    _appendMessage(role, text, isError = false) {
      this.messages.push({ role, text });
      const bubble = document.createElement('div');
      bubble.className = `aiat-msg aiat-msg-${role}${isError ? ' is-error' : ''}`;
      bubble.textContent = text; // textContent only, never innerHTML ΓÇö never trust message content as markup
      this.messagesEl.appendChild(bubble);
      this._scrollToBottom();
      return bubble;
    }

    _seedGreeting() {
      this._appendMessage('ai', "Hi! I'm your AI Assistant. Ask me anything ΓÇö connect a real backend in ai-assistant-toggle.js to enable live responses.");
    }

    _scrollToBottom() {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  function init() {
    if (!document.getElementById('aiat-toggle')) return; // component markup not on this page
    // The only globals this file ever creates ΓÇö both intentionally
    // namespaced so a host page can call them without risk:
    //   window.AIAssistantToggle           ΓÇö the class, for advanced use
    //   window.__aiAssistantToggleInstance ΓÇö the running instance, e.g.
    //                                        window.__aiAssistantToggleInstance.open()
    window.AIAssistantToggle = AIAssistantToggle;
    window.__aiAssistantToggleInstance = new AIAssistantToggle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // script was added/ran after the DOM was already ready
  }
})();
