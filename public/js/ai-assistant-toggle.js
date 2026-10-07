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
 * declares — not one constant, not the class itself — leaks into
 * the host page's global scope. The only thing exposed globally is
 * a single, clearly-namespaced reference to the running instance
 * (see the bottom of this file), so a host page can optionally call
 * .open() / .close() from its own code without any collision risk.
 *
 * This file expects the #aiat-root markup to already exist in the
 * page — it does not build or inject any HTML itself, so the markup
 * stays visible and editable wherever it's copied.
 *
 * BACKEND: this component no longer answers anything itself. Every
 * message is handed to window.daongAiAssistant (js/ai/aiAssistant.js),
 * which attaches page context and calls the DAONG AI backend through
 * js/ai/aiService.js. If those files are absent the panel says so
 * plainly instead of inventing a canned reply.
 *
 * Load order (see the script tags at the bottom of each page):
 *   aiContext.js → aiService.js → aiAssistant.js → this file → aiUI.js
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  // Keep in sync with the @media (max-width: ...) breakpoint in
  // ai-assistant-toggle.css's "RESPONSIVE: SMALL SCREENS" section.
  const AIAT_MOBILE_BREAKPOINT = 640;
  const AIAT_DRAG_THRESHOLD_PX = 6;
  const AIAT_STORAGE_KEY = 'aiat_toggle_position';

  /**
   * The single hand-off from UI to logic. Conversation memory, website
   * context and the network call all live behind this one call, so this
   * file stays purely presentational.
   * @param {string} message - the user's message
   * @returns {Promise<{ok: boolean, reply: string}>} reply is always
   *          display-ready text, success or failure.
   */
  function requestAssistantReply(message) {
    if (window.daongAiAssistant) return window.daongAiAssistant.ask(message);
    return Promise.resolve({
      ok: false,
      reply: 'The assistant isn\u2019t wired up on this page \u2014 js/ai/aiAssistant.js did not load.',
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

      this.statusDot = this.panel.querySelector('.aiat-status-dot');
      this.messages = [];
      this._typingEl = null;
      this._busy = false;

      this._restorePosition();
      this._bindDrag();
      this._bindPanel();
      this._restoreConversation();

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
       or a "drag" (reposition the button) — see suppressClick below.
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
          suppressClick = true; // a click always fires right after pointerup — swallow that one
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
      } catch { /* malformed or missing value — keep the CSS default corner */ }
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
        if (!this._isOpen()) return;

        // A handler earlier in this same click may have removed the
        // element that was clicked — tapping a suggestion chip clears
        // the chips. A detached target is no longer "inside" the panel
        // by contains(), which used to read as an outside click and
        // close the panel the instant a chip was tapped, hiding the
        // answer that was already on its way. If the node is gone, the
        // click came from our own UI: leave the panel alone.
        if (e.target instanceof Node && !e.target.isConnected) return;

        // contains() rather than an identity check: the toggle's own SVG
        // icon is the event target when the button itself is clicked.
        if (!this.panel.contains(e.target) && !this.toggle.contains(e.target)) {
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
      // Move focus out before the panel goes inert, but only if it was
      // inside — closing by clicking elsewhere on the page shouldn't
      // yank the caret out of whatever the visitor just clicked.
      const focusWasInside = this.panel.contains(document.activeElement);
      this.panel.classList.remove('is-open');
      this.panel.setAttribute('inert', '');
      this.toggle.setAttribute('aria-expanded', 'false');
      this.toggle.setAttribute('aria-label', 'Open AI assistant');
      if (focusWasInside) this.toggle.focus();
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
       Everything here only ever calls requestAssistantReply() —
       swap that one function's insides out for a real backend and
       nothing else in this file needs to change.
       ========================================================= */
    async _handleSend() {
      if (this._busy) return; // guard against double-submit
      const text = this.input.value.trim();
      if (!text) return; // empty message: nothing to send, no error noise

      // ---- add the user's message to the chat interface ----
      this._clearSuggestions();
      this._appendMessage('user', text);
      this.input.value = '';
      this._autoGrowInput();

      // ---- loading state ----
      this._setLoading(true);

      try {
        // ---- send to service layer / receive AI response ----
        const result = await requestAssistantReply(text);
        if (result && result.ok) {
          this._appendMessage('ai', result.reply);
          this.setStatus('idle');
        } else {
          // aiAssistant.js has already translated the failure into a
          // sentence a visitor can act on — no codes, no stack traces.
          this._appendMessage('system', (result && result.reply) || 'Sorry, I\u2019m having trouble connecting right now. Please try again.', true);
          this.setStatus('error');
        }
      } catch (err) {
        console.error('AIAssistantToggle: unexpected send failure', err);
        this._appendMessage('system', 'Something went wrong sending that message. Please try again.', true);
        this.setStatus('error');
      } finally {
        this._setLoading(false);
      }
    }

    _setLoading(isLoading) {
      this._busy = isLoading;
      this.input.disabled = isLoading;
      this.sendBtn.disabled = isLoading || !this.input.value.trim();
      this.toggle.classList.toggle('is-thinking', isLoading);
      if (isLoading) {
        this.setStatus('thinking');
        this._showTyping();
      } else {
        this._hideTyping();
        if (this._isOpen()) this.input.focus();
      }
    }

    /**
     * Visual connection state on the panel's status dot and the floating
     * button: 'idle' | 'thinking' | 'error'.
     */
    setStatus(state) {
      if (!this.statusDot) return;
      this.statusDot.classList.toggle('is-thinking', state === 'thinking');
      this.statusDot.classList.toggle('is-error', state === 'error');
      const label = state === 'thinking' ? 'Assistant is thinking' : state === 'error' ? 'Assistant unavailable' : 'Assistant ready';
      this.statusDot.setAttribute('title', label);
    }

    _showTyping() {
      if (this._typingEl) return;
      const bubble = document.createElement('div');
      bubble.className = 'aiat-msg aiat-msg-ai aiat-msg-typing';
      bubble.setAttribute('aria-label', 'Assistant is typing');
      bubble.innerHTML = '<span></span><span></span><span></span>'; // static markup, no user data — safe as innerHTML
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
      bubble.textContent = text; // textContent only, never innerHTML — never trust message content as markup
      this.messagesEl.appendChild(bubble);
      this._scrollToBottom();
      return bubble;
    }

    /** Public: send a message programmatically (used by suggestion chips). */
    sendText(text) {
      if (this._busy || !text) return;
      this.input.value = text;
      this._autoGrowInput();
      this._handleSend();
    }

    /** Public: used by aiUI.js to render restored or injected messages. */
    appendMessage(role, text, isError = false) {
      return this._appendMessage(role, text, isError);
    }

    /**
     * Replays the session's conversation (kept by aiAssistant.js) so the
     * thread survives navigation between DAONG's pages, then greets a
     * first-time visitor.
     */
    _restoreConversation() {
      const history = window.daongAiAssistant ? window.daongAiAssistant.getHistory() : [];
      if (history.length) {
        history.forEach((turn) => this._appendMessage(turn.role === 'user' ? 'user' : 'ai', turn.content));
        return;
      }
      this._seedGreeting();
    }

    _seedGreeting() {
      const greeting = window.daongAiContext
        ? window.daongAiContext.greeting()
        : 'Hi \u2014 ask me anything about this site.';
      this._appendMessage('ai', greeting);
    }

    /** Public: wipes the thread and starts over from the greeting. */
    clearConversation() {
      if (window.daongAiAssistant) window.daongAiAssistant.reset();
      this.messages = [];
      this._hideTyping();
      this.messagesEl.textContent = '';
      this._seedGreeting();
      this.setStatus('idle');
      document.dispatchEvent(new CustomEvent('daong:ai-conversation-cleared'));
      if (this._isOpen()) this.input.focus();
    }

    _clearSuggestions() {
      const chips = this.messagesEl.querySelector('.aiat-suggestions');
      if (chips) chips.remove();
    }

    _scrollToBottom() {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  function init() {
    if (!document.getElementById('aiat-toggle')) return; // component markup not on this page
    // The only globals this file ever creates — both intentionally
    // namespaced so a host page can call them without risk:
    //   window.AIAssistantToggle           — the class, for advanced use
    //   window.__aiAssistantToggleInstance — the running instance, e.g.
    //                                        window.__aiAssistantToggleInstance.open()
    window.AIAssistantToggle = AIAssistantToggle;
    window.__aiAssistantToggleInstance = new AIAssistantToggle();
    // aiUI.js listens for this to add the Clear button, suggestion chips
    // and connection indicator without having to guess at load order.
    document.dispatchEvent(new CustomEvent('daong:ai-assistant-ready', {
      detail: { instance: window.__aiAssistantToggleInstance },
    }));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init(); // script was added/ran after the DOM was already ready
  }
})();
