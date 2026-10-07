/**
 * js/ai/aiUI.js
 * -----------------------------------------------------------------
 * DAONG AI ASSISTANT — UI ENHANCEMENT LAYER
 *
 * The chat panel's markup, styling and open/close behaviour already
 * exist (the #aiat-root block in each page + ai-assistant-toggle.css/js).
 * This file does not rebuild any of that. It only adds the pieces the
 * original component didn't have, by enhancing the markup in place:
 *
 *   - a "Clear" control in the panel header,
 *   - an empty state with tappable suggested questions for the page
 *     the visitor is actually on,
 *   - a one-off backend health check that colours the status dot, so a
 *     misconfigured deployment is visible before anyone types.
 *
 * Everything here is optional polish: if this file fails to load the
 * assistant still works exactly as before.
 *
 * Runs on the daong:ai-assistant-ready event dispatched by
 * ai-assistant-toggle.js (and falls back to the existing instance if
 * that event already fired).
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  function enhance(widget) {
    if (!widget || !widget.panel || widget.__aiUiEnhanced) return;
    widget.__aiUiEnhanced = true;

    addClearButton(widget);
    renderSuggestions(widget);
    probeBackend(widget);

    document.addEventListener('daong:ai-conversation-cleared', () => renderSuggestions(widget));
  }

  /* =========================================================
     CLEAR CONVERSATION
     Placed next to the existing close button, using the same
     .aiat-* visual language rather than a new one.
     ========================================================= */
  function addClearButton(widget) {
    const head = widget.panel.querySelector('.aiat-panel-head');
    const closeBtn = document.getElementById('aiat-close');
    if (!head || !closeBtn || head.querySelector('.aiat-clear-btn')) return;

    const actions = document.createElement('div');
    actions.className = 'aiat-head-actions';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'aiat-clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.setAttribute('aria-label', 'Clear this conversation');
    clearBtn.addEventListener('click', () => widget.clearConversation());

    head.insertBefore(actions, closeBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn); // keep close as the right-most control
  }

  /* =========================================================
     EMPTY STATE / SUGGESTED QUESTIONS
     ========================================================= */
  function renderSuggestions(widget) {
    if (!window.daongAiContext) return;
    // Only offer prompts when the thread is just the greeting.
    if (widget.messages.filter((m) => m.role === 'user').length) return;

    const existing = widget.messagesEl.querySelector('.aiat-suggestions');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.className = 'aiat-suggestions';

    window.daongAiContext.suggestions().forEach((question) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'aiat-chip';
      chip.textContent = question; // textContent: these are our own strings, and stay text either way
      chip.addEventListener('click', () => widget.sendText(question));
      wrap.appendChild(chip);
    });

    widget.messagesEl.appendChild(wrap);
    widget.messagesEl.scrollTop = widget.messagesEl.scrollHeight;
  }

  /* =========================================================
     BACKEND HEALTH
     A red dot and a quiet note beat a green dot that lies.
     ========================================================= */
  async function probeBackend(widget) {
    if (!window.daongAiService) return;
    const result = await window.daongAiService.health();
    if (result.ok) {
      widget.setStatus('idle');
      return;
    }
    widget.setStatus('error');
    const subtitle = widget.panel.querySelector('.aiat-subtitle');
    if (subtitle) subtitle.textContent = 'Assistant service offline';
  }

  document.addEventListener('daong:ai-assistant-ready', (e) => enhance(e.detail && e.detail.instance));

  // If ai-assistant-toggle.js initialised before this script ran (e.g.
  // both were injected after DOMContentLoaded), enhance the live one.
  if (window.__aiAssistantToggleInstance) enhance(window.__aiAssistantToggleInstance);
})();
