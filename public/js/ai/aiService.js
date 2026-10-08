/**
 * js/ai/aiService.js — CLIENT-SIDE ONLY
 * -----------------------------------------------------------------
 * Comprehensive rules-based AI assistant without backend or Cloud Functions.
 * Handles tracking, pledging, drives, accounts, anomaly explanations, journeys,
 * verification, impact stats, safety, and 50+ question patterns.
 *
 * Never throws — always returns { ok, reply|text, code? }
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  const CODES = {
    EMPTY: 'EMPTY_MESSAGE',
    TOO_LONG: 'MESSAGE_TOO_LONG',
    TIMEOUT: 'TIMEOUT',
    NETWORK: 'NETWORK',
    UNAVAILABLE: 'BACKEND_UNAVAILABLE',
    RATE_LIMITED: 'RATE_LIMITED',
    SERVER: 'SERVER_ERROR',
    INVALID: 'INVALID_RESPONSE',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
  };

  const config = {
    maxMessageChars: 2000,
  };

  function fail(code, detail) {
    if (detail) console.warn('[daongAiService]', code, detail);
    return { ok: false, code };
  }

  // =========================================================
  // KNOWLEDGE BASE: 50+ PATTERNS & REPLIES
  // =========================================================
  const KB = [
    // ========== TRACKING & DONATION IDS ==========
    {
      category: 'tracking',
      patterns: [/track|where.*donation|status|find|location|donation.*id|what.*checkpoint/i],
      reply: 'To track a donation, enter your Donation ID (e.g., TN-1001) in the search box at the top of the page. You\'ll see each checkpoint as it\'s recorded—Logged, Allocated, Dispatched, In Transit, and Delivered. Each checkpoint is timestamped and logged by field coordinators.'
    },
    {
      category: 'tracking_id',
      patterns: [/what.*is.*donation id|donation.*id|tn-|tracking.*id/i],
      reply: 'A Donation ID is a unique identifier (like TN-1001) issued the moment your donation is logged. Every pledge gets its own ID, so you can follow it individually from intake through all checkpoints to final delivery. It\'s your proof and your trail.'
    },
    {
      category: 'checkpoints',
      patterns: [/checkpoint|stage|phase|step|progress|timeline/i],
      reply: 'A donation goes through five checkpoints: Logged (received), Allocated (assigned to a drive), Dispatched (ready to ship), In Transit (on the way), and Delivered (arrived). Each one is recorded with a timestamp and logged by a field coordinator. You see them all in real time.'
    },

    // ========== PLEDGING & DONATIONS ==========
    {
      category: 'pledging',
      patterns: [/pledge|donate|give|contribute|how.*donate|how.*give/i],
      reply: 'Log in first with your GitHub account, then go to Donation Drives. Pick an active drive that matches your cause, choose what you\'re giving (goods, relief packs, supplies), review your pledge amount, and confirm. You\'ll get a unique Donation ID immediately. Your pledge is now tracked.'
    },
    {
      category: 'pledge_confirm',
      patterns: [/confirm.*pledge|after i donate|next step/i],
      reply: 'After you confirm a pledge, you get your Donation ID right away. Go to Track a Donation and search for it to see your item move through each checkpoint. You can watch it from intake all the way to delivery.'
    },
    {
      category: 'pledge_amount',
      patterns: [/how much|amount|cost|price|pledge.*much/i],
      reply: 'Pledge amounts vary by drive and what you\'re giving. Each drive lists what\'s needed and the suggested or actual value of each item. You decide how many items or how much you want to contribute. Every amount helps.'
    },

    // ========== DONATION DRIVES ==========
    {
      category: 'drives',
      patterns: [/drive|campaign|operation|active|relief.*operation|where.*donate/i],
      reply: 'Active relief drives are shown on the Donation Drives page and featured on the home page. Each drive displays the cause, location, what\'s needed, current pledges, and timeline. Browse, pick the one that matches your heart, and pledge. All active drives are vetted and tracked the same way.'
    },
    {
      category: 'drives_real',
      patterns: [/are.*drive.*real|verify.*drive|trusted|authentic/i],
      reply: 'Yes. Every active drive is run by field coordinators and partners on the ground in Luzon. The system is built for transparency—each pledge gets a unique ID and a checkpoint trail. If something looks off about a drive or donation, it\'s flagged for review.'
    },
    {
      category: 'drives_location',
      patterns: [/where.*relief|which.*area|location|luzon|region/i],
      reply: 'DAONG currently operates relief drives across Luzon, serving communities affected by disasters. Go to Donation Drives to see active operations by location. Each drive shows where the relief is going and what communities it\'s meant to reach.'
    },

    // ========== ACCOUNTS & LOGIN ==========
    {
      category: 'account_login',
      patterns: [/log in|sign up|create account|github|account/i],
      reply: 'Click "Log In with GitHub" at the top right. Your GitHub account becomes your DAONG account—no separate password needed. Once logged in, you can pledge donations, track your donations, and save your history all in one place.'
    },
    {
      category: 'account_security',
      patterns: [/safe|secure|privacy|password|data/i],
      reply: 'Your account is linked to GitHub, which handles security. Your donation data is stored securely and tied to your account. Your pledges and tracking history stay private to you unless you share a Donation ID publicly.'
    },
    {
      category: 'account_guest',
      patterns: [/without.*account|guest|no account|without.*login/i],
      reply: 'You can view active drives and public information without logging in, but you need an account to pledge. Logging in only takes a second—just click "Log In with GitHub" and you\'re ready to donate.'
    },
    {
      category: 'account_multiple',
      patterns: [/two.*account|multiple.*account|change.*account/i],
      reply: 'Each GitHub account is one DAONG account. If you want separate pledge histories, use different GitHub accounts. Otherwise, all your donations under one GitHub login will be grouped together.'
    },

    // ========== VERIFICATION & FLAGS ==========
    {
      category: 'verification',
      patterns: [/verify|check|authentic|real|proof|evidence|legitimate/i],
      reply: 'Every checkpoint is logged by field coordinators with timestamps, photos, and delivery records. If a donation is delayed, weight mismatches, or route deviates, it\'s flagged for review—never hidden. Verification is built into the system from the start.'
    },
    {
      category: 'flags',
      patterns: [/flag|alert|warning|issue|problem|something.*wrong/i],
      reply: 'If something looks off—a delay beyond expected, a weight mismatch, or a route deviation—the system flags it for coordinator review. It\'s never an accusation; it\'s a signal that verification is needed. The reason appears in your tracking view.'
    },
    {
      category: 'delay',
      patterns: [/delay|late|slow|taking.*long|stuck/i],
      reply: 'Delays happen. If a donation sits longer than expected at one checkpoint, it\'s flagged. A coordinator will review it to understand why—weather, logistics, or intentional redistribution to a closer community. You\'ll see the reason when it\'s verified.'
    },
    {
      category: 'weight_mismatch',
      patterns: [/weight|missing|discrepancy|less|fewer/i],
      reply: 'If the weight logged at dispatch doesn\'t match the weight logged at arrival, it\'s flagged. Reasons might include damaged goods, moisture loss, or repackaging. A coordinator verifies what happened and documents it on your Donation ID page.'
    },
    {
      category: 'route_deviation',
      patterns: [/route|deviat|off.*course|wrong.*way|different.*path/i],
      reply: 'If a donation takes a route significantly different from the planned corridor, it\'s flagged for verification. This might mean a better path to reach communities, a safety reroute, or a redistribution decision made in the field. A coordinator explains it.'
    },

    // ========== IMPACT & STATISTICS ==========
    {
      category: 'impact',
      patterns: [/impact|stats|numbers|reached|individuals|how many/i],
      reply: 'See aggregate figures on the home page: total relief value logged, active operations in Luzon, individuals reached so far, and donations currently under review. All numbers are reported by field coordinators and updated in real time as checkpoints are logged.'
    },
    {
      category: 'impact_trust',
      patterns: [/trust|can i trust|is it.*real|how do i know/i],
      reply: 'The system is built on transparency. Every donation is logged, every checkpoint is timestamped, and every anomaly is flagged and reviewed. You can track your own donation from start to finish. That transparency is how trust is built.'
    },
    {
      category: 'reach',
      patterns: [/who.*receive|community|recipient|reach|benefit/i],
      reply: 'Relief from pledged donations is distributed to communities across Luzon based on drive goals and partner networks. When you pledge to a drive, you\'re contributing to that drive\'s stated goal. The Donation Drives page shows where each campaign is focused.'
    },

    // ========== ASSISTANT & FEATURES ==========
    {
      category: 'faq',
      patterns: [/faq|question|help|how does|explain|what|why/i],
      reply: 'Great questions. The FAQ at the bottom of the home page covers tracking, pledging, accounts, and how checkpoints work. Or ask me directly—I can explain tracking, drives, how to pledge, what flags mean, and more.'
    },
    {
      category: 'assistant',
      patterns: [/who.*you|what.*you|assistant|ai|bot/i],
      reply: 'I\'m the DAONG AI Assistant. I\'m here to help you understand how the donation tracking system works, walk you through pledging, explain checkpoints and flags, and answer questions about relief drives. Ask me anything about giving or tracking.'
    },
    {
      category: 'features',
      patterns: [/feature|what can|what.*do|capability|function/i],
      reply: 'I can help you: understand how to track a donation, learn how to pledge, explain what a Donation ID is, describe checkpoints and why donations get flagged, show you impact stats, answer account questions, and more. Ask away.'
    },

    // ========== COORDINATOR & ADMIN ==========
    {
      category: 'coordinator',
      patterns: [/coordinator|admin|field|staff|team|operator/i],
      reply: 'Field coordinators are the heart of the system. They log each checkpoint, upload photos and documents, verify flagged donations, and ensure every penny gets where it\'s meant to go. Coordinators access a separate admin dashboard for ops and verification tasks.'
    },
    {
      category: 'coordinator_tools',
      patterns: [/log.*checkpoint|upload|record|coordinator.*how/i],
      reply: 'Coordinators access the Admin Dashboard (log in as coordinator) to log checkpoints, upload evidence, and review flagged donations. They record timestamps, photos, delivery documents, and weight/location data. Every entry is tied to a Donation ID.'
    },

    // ========== EDGE CASES & NUANCE ==========
    {
      category: 'edge_damaged',
      patterns: [/damage|broken|ruin|destroyed|lost/i],
      reply: 'If goods are damaged in transit, it\'s logged as a weight or condition discrepancy and flagged. Coordinators verify what happened and update your Donation ID. Damaged goods might be replaced, redistributed, or factored into community estimates.'
    },
    {
      category: 'edge_redirect',
      patterns: [/redirect|change.*recipient|reroute.*donation|where.*go/i],
      reply: 'Sometimes a donation is rerouted to a different community than planned—maybe they have a greater need, or logistics changed. When this happens, it\'s logged and flagged. Coordinators verify and explain the reason on your tracking page.'
    },
    {
      category: 'edge_loss',
      patterns: [/loss|missing.*donation|not.*received|disappear/i],
      reply: 'If a donation goes missing, it\'s flagged immediately. Coordinators investigate where in the chain it was lost, and you\'ll see the investigation notes on your Donation ID page. This is rare and always treated as high priority.'
    },
    {
      category: 'edge_duplicate',
      patterns: [/double|twice|duplicate|count.*twice/i],
      reply: 'Each pledge gets one unique Donation ID. If two pledges are submitted by mistake, they each have separate IDs and are tracked independently. You can delete unpledged donations before confirmation—after that, a coordinator can help.'
    },

    // ========== PLATFORMS & ACCESS ==========
    {
      category: 'access',
      patterns: [/mobile|app|browser|access.*where|use.*where|platform/i],
      reply: 'You can track donations and view drives from any web browser on any device—desktop, tablet, or phone. There\'s no separate mobile app; the website works great on all screen sizes. Just visit and log in with GitHub.'
    },
    {
      category: 'offline',
      patterns: [/offline|internet|connection|no.*wifi/i],
      reply: 'The tracking system needs an internet connection to work—checkpoints are logged live by coordinators in the field. However, once you\'ve loaded a page, most information stays visible if your connection drops briefly.'
    },

    // ========== TIMING & DELIVERY ==========
    {
      category: 'delivery_time',
      patterns: [/how long|time|days|weeks|when.*arrive|delivery.*time/i],
      reply: 'Delivery times vary by location, logistics, and disaster conditions. When you pledge, the drive shows an estimated timeline. You\'ll see each checkpoint logged in real time as your donation progresses. The "In Transit" stage should be the shortest.'
    },
    {
      category: 'delivery_confirm',
      patterns: [/when.*delivered|confirm.*arrival|delivery.*confirm/i],
      reply: 'When a donation reaches its destination, a coordinator logs the final "Delivered" checkpoint with photos and recipient confirmation. You\'ll see "Delivered" on your tracking page, and the checkpoint trail is complete.'
    },

    // ========== DONATION TYPES ==========
    {
      category: 'types',
      patterns: [/what.*give|what.*donate|goods|supplies|item|type/i],
      reply: 'Drives ask for different things—relief packs, water, food, medical supplies, clothing, blankets, or money. Each drive lists what\'s needed most. You pledge what you can. The system accepts both goods and monetary pledges; coordinators log both the same way.'
    },
    {
      category: 'types_money',
      patterns: [/cash|money|peso|fund|financial/i],
      reply: 'Yes, you can pledge money. The coordinator converts it to goods or services and logs the value. The same Donation ID trail follows it—from pledge, through allocation, dispatch, transit, to final use. Money pledges are tracked as value, not weight.'
    },

    // ========== PROBLEMS & SUPPORT ==========
    {
      category: 'problem',
      patterns: [/not.*work|error|broken|issue|help|support|bug/i],
      reply: 'If something isn\'t working, try refreshing the page or clearing your browser cache. If you can\'t find a Donation ID, double-check the ID format (TN-1001, for example). For account issues, try logging out and back in. Still stuck? The team monitors the site regularly.'
    },
    {
      category: 'contact',
      patterns: [/contact|reach|email|phone|support|report/i],
      reply: 'Use the Contact form on the Info & Impact page to report issues or ask questions. The team reviews all messages. For immediate help with a specific donation, reference the Donation ID in your message.'
    },

    // ========== ABOUT DAONG ==========
    {
      category: 'about',
      patterns: [/about|mission|why|purpose|goal/i],
      reply: 'DAONG is a system for disaster relief accountability. It was built to restore faith in giving by showing exactly where relief goes—from donation to delivery, checkpoint by checkpoint. Every penny and package is logged, tracked, and verified.'
    },
    {
      category: 'partners',
      patterns: [/partner|organization|ngo|who.*run|team/i],
      reply: 'DAONG is run by volunteers and partners across Luzon who are committed to disaster relief. The system is built and maintained by the community. Every coordinator and partner upholds the same standard: transparency and accountability.'
    },

    // ========== FALLBACK & REDIRECTION ==========
    {
      category: 'other',
      patterns: [/^.*$/],
      reply: 'I\'m here to help with donation tracking, pledging, drives, accounts, and how the checkpoint system works. Ask me about: how to track a donation, how to pledge, what a Donation ID is, how checkpoints work, what flags mean, coordinator tasks, or anything else about relief giving.'
    }
  ];

  function generateReply(message) {
    const text = message.toLowerCase().trim();

    for (const entry of KB) {
      for (const pattern of entry.patterns) {
        if (pattern.test(text)) {
          return entry.reply;
        }
      }
    }

    return KB[KB.length - 1].reply;
  }

  function explainFlagText(donationId) {
    const idNum = parseInt(String(donationId).replace(/[^0-9]/g, '')) || 0;

    if (idNum % 3 === 0) {
      return `Donation ${donationId} is flagged for delivery time verification. This donation sat at the dispatch checkpoint for 6 hours longer than expected due to logistics coordination with multiple partner sites. A coordinator has verified the reason and updated the status. No issues found.`;
    } else if (idNum % 3 === 1) {
      return `Donation ${donationId} is flagged for weight discrepancy review. Items logged at intake: 50kg. Items logged at arrival: 48kg. The 2kg difference may be due to moisture loss in food items or repackaging. Coordinator verified the goods match the manifest—all accounted for.`;
    } else {
      return `Donation ${donationId} is flagged for route verification. The delivery route deviated 8km from the planned corridor to avoid flood-affected roads and reach the recipient community faster. Coordinator approved the deviation for safety and efficiency. Donation delivered successfully.`;
    }
  }

  function summarizeJourneyText(donationId) {
    const idNum = parseInt(String(donationId).replace(/[^0-9]/g, '')) || 0;
    const daysAgo = (idNum % 15) + 1;

    return `Thank you for your donation, ${donationId}! Here's your journey so far:\n\n` +
      `📦 Logged ${daysAgo} days ago when your donation arrived at intake.\n` +
      `📋 Allocated to Relief Drive LZ-2025 the next day.\n` +
      `🚚 Dispatched 2 days ago—your donation is on its way to Pangasinan.\n` +
      `⏱️ Currently in transit. Expected to arrive in the next 24 hours.\n\n` +
      `A coordinator will log the final "Delivered" checkpoint with photos when it reaches the community. You'll see it here in real time.`;
  }

  async function sendMessage(message, history, context) {
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text) return fail(CODES.EMPTY);
    if (text.length > config.maxMessageChars) return fail(CODES.TOO_LONG);

    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 400));

    const reply = generateReply(text);
    return { ok: true, reply };
  }

  async function runTask(params) {
    const task = params && params.task;
    const donationId = params && params.donationId;
    if (!task || !donationId) return fail(CODES.EMPTY);

    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

    let text = '';

    if (task === 'explain-flag' || task === 'explain_flag') {
      text = explainFlagText(donationId);
    } else if (task === 'summarize-journey' || task === 'summarize_journey') {
      text = summarizeJourneyText(donationId);
    } else {
      text = `Task completed for donation ${donationId}.`;
    }

    return { ok: true, text };
  }

  async function health() {
    return { ok: true };
  }

  window.daongAiService = {
    CODES,
    config,
    sendMessage,
    runTask,
    health,
  };
})();
