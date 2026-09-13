// Ameer AI ChatBot — Controller & Interaction Engine
document.addEventListener('DOMContentLoaded', () => {
  // State
  let currentStep = 1;
  const totalSteps = 4;
  let isSubmitting = false;
  let typingInterval = null;
  
  let userConfig = {
    persona: 'Software Architect',
    personaDesc: 'Idiomatic code, refactoring patterns, and systems design.',
    tone: 'Concise & Code-First',
    model: localStorage.getItem('ameer_ai_gemini_model') || localStorage.getItem('nova_gemini_model') || 'gemini-flash-latest',
    apiKey: localStorage.getItem('ameer_ai_gemini_api_key') || localStorage.getItem('nova_gemini_api_key') || ''
  };

  // Universal API base URL: Use relative path '' on all live servers and tunnels; only fallback to localhost:8000 if opened via file://
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8000' : '';

  // DOM Elements - Wizard
  const wizardCard = document.getElementById('wizardCard');
  const chatWorkspace = document.getElementById('chatWorkspace');
  const progressLine = document.getElementById('progressLine');
  const stepNodes = document.querySelectorAll('.step-node');
  const stepViews = document.querySelectorAll('.step-content');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const skipBtn = document.getElementById('skipBtn');

  // Summary Elements
  const summaryPersona = document.getElementById('summaryPersona');
  const summaryTone = document.getElementById('summaryTone');
  const summaryModel = document.getElementById('summaryModel');

  // Chat Elements
  const activePersonaBadge = document.getElementById('activePersonaBadge');
  const chatModelBadge = document.getElementById('chatModelBadge');
  const welcomeChatMsg = document.getElementById('welcomeChatMsg');
  const chatStream = document.getElementById('chatStream');
  const chatForm = document.getElementById('chatForm');
  const chatInputField = document.getElementById('chatInputField');
  const reopenOnboardingBtn = document.getElementById('reopenOnboardingBtn');

  // Settings Drawer Elements
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const settingsDrawer = document.getElementById('settingsDrawer');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const modelSelect = document.getElementById('modelSelect');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const saveNotice = document.getElementById('saveNotice');

  // Populate stored settings
  if (apiKeyInput && userConfig.apiKey) apiKeyInput.value = userConfig.apiKey;
  if (modelSelect) modelSelect.value = userConfig.model;
  if (chatModelBadge) chatModelBadge.textContent = userConfig.model;

  // Suggested Prompts by Persona
  const personaPrompts = {
    'Software Architect': [
      { text: 'Architect a real-time collaborative canvas with WebSockets and CRDTs.' },
      { text: 'Refactor this asynchronous data pipeline for sub-50ms p99 latency.' },
      { text: 'Design an event-driven microservices topology with circuit breakers.' }
    ],
    'Research Analyst': [
      { text: 'Perform a comparative statistical analysis on model benchmark results.' },
      { text: 'Structure an empirical hypothesis test for latency distribution anomalies.' },
      { text: 'Synthesize key variance metrics and confidence intervals from this dataset.' }
    ],
    'Creative Strategist': [
      { text: 'Draft a compelling product narrative for an AI-native design platform.' },
      { text: 'Generate 5 high-converting marketing hooks for our developer tool launch.' },
      { text: 'Design a user journey map for frictionless first-time developer onboarding.' }
    ],
    'Autonomous Executive': [
      { text: 'Draft an executive decision memo on our cloud migration trade-offs.' },
      { text: 'Create a prioritized 30-60-90 day engineering execution roadmap.' },
      { text: 'Synthesize cross-team OKRs into an actionable operational framework.' }
    ]
  };

  // Sample Snippets for Step 3
  const samples = {
    code: {
      lang: 'TYPESCRIPT',
      text: `// High-throughput WebSocket Stream Handler
export class AgentStreamSession {
  private socket: WebSocket;
  private buffer: RingBuffer<Uint8Array>;

  constructor(endpoint: string) {
    this.socket = new WebSocket(endpoint);
    this.buffer = new RingBuffer(1024 * 64);
    this.bindEvents();
  }

  public async streamTokens(onToken: (tok: string) => void) {
    for await (const chunk of this.socket) {
      const decoded = TextDecoder.decode(chunk);
      onToken(decoded);
    }
  }
}`
    },
    vision: {
      lang: 'MULTIMODAL INSPECTOR',
      text: `[Frame Analysis: User Interface Wireframe]
• Detected 4 glassmorphic card containers with 1px border-subtle.
• Color Space: Deep space dark (#07090e) with 14% violet glow radial mask.
• Accessibility Check: Contrast ratio is 11.4:1 (Passes WCAG AAA).
• Latency recommendation: Hardware accelerated transforms on cards.`
    },
    analysis: {
      lang: 'SYSTEMS ARCHITECTURE',
      text: `SYSTEM TOPOLOGY & RESILIENCY PLAN:
1. Ingress Layer: Edge Anycast Proxy (p99 latency < 8ms)
2. Orchestration: Distributed State Machine with Event Sourcing
3. Model Gateway: Multi-region Gemini fallback routing pool
4. Cache Tier: Low-latency Redis in-memory cache with 99.98% hit rate`
    }
  };

  // Health check on initialization
  async function checkHealth() {
    const statusText = document.getElementById('headerStatusText');
    const statusPill = document.getElementById('headerStatusPill');
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data.has_api_key || userConfig.apiKey) {
          if (statusText) statusText.textContent = 'GCP Gemini Connected';
          if (statusPill) statusPill.className = 'status-pill status-connected';
        } else {
          if (statusText) statusText.textContent = 'GCP Gemini Ready (Key/Sim)';
          if (statusPill) statusPill.className = 'status-pill status-ready';
        }
      } else {
        throw new Error('Health check error');
      }
    } catch (e) {
      if (statusText) statusText.textContent = 'Offline Simulation Active';
      if (statusPill) statusPill.className = 'status-pill status-offline';
    }
  }

  // Stepper Controller
  function updateStep(step) {
    // Clear typing demo interval if leaving step 3
    if (currentStep === 3 && step !== 3) {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    }

    currentStep = step;

    // Update progress bar
    const progressPercent = ((currentStep - 1) / (totalSteps - 1)) * 100;
    progressLine.style.width = `${progressPercent}%`;

    // Update node states
    stepNodes.forEach(node => {
      const nodeStep = parseInt(node.getAttribute('data-step'), 10);
      node.classList.remove('active', 'completed');
      if (nodeStep === currentStep) {
        node.classList.add('active');
      } else if (nodeStep < currentStep) {
        node.classList.add('completed');
      }
    });

    // Update Views
    stepViews.forEach(view => view.classList.remove('active'));
    const targetView = document.getElementById(`stepView${currentStep}`);
    if (targetView) targetView.classList.add('active');

    // Update Footer Buttons
    prevBtn.disabled = currentStep === 1;

    if (currentStep === totalSteps) {
      nextBtn.textContent = '🚀 Launch Ameer AI Workspace';
      nextBtn.className = 'btn btn-launch';
      updateSummary();
    } else {
      nextBtn.textContent = 'Continue →';
      nextBtn.className = 'btn btn-primary';
    }

    // Trigger dynamic sampler typing when entering step 3
    if (currentStep === 3) {
      const activeTab = document.querySelector('.sampler-tab.active');
      const sampleKey = activeTab ? activeTab.getAttribute('data-sample') : 'code';
      triggerTypingDemo(sampleKey);
    }
  }

  // Summary & Suggested Prompts Updater
  function updateSummary() {
    if (summaryPersona) summaryPersona.textContent = userConfig.persona;
    if (summaryTone) summaryTone.textContent = userConfig.tone;
    if (summaryModel) summaryModel.textContent = userConfig.model;
    updateSuggestedPrompts();
  }

  function updateSuggestedPrompts() {
    const container = document.getElementById('suggestedPrompts');
    if (!container) return;
    const prompts = personaPrompts[userConfig.persona] || personaPrompts['Software Architect'];
    container.innerHTML = '';
    prompts.forEach(p => {
      const chip = document.createElement('div');
      chip.className = 'prompt-chip';
      chip.setAttribute('data-prompt', p.text);
      chip.setAttribute('role', 'button');
      chip.setAttribute('tabindex', '0');
      chip.innerHTML = `<span>"${p.text}"</span><span class="arrow">→</span>`;
      chip.addEventListener('click', () => launchWorkspace(p.text));
      chip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          launchWorkspace(p.text);
        }
      });
      container.appendChild(chip);
    });
  }

  // Step 2: Role Selection
  const roleCards = document.querySelectorAll('.role-card');
  roleCards.forEach(card => {
    const selectRole = () => {
      roleCards.forEach(c => {
        c.classList.remove('selected');
        c.setAttribute('aria-checked', 'false');
      });
      card.classList.add('selected');
      card.setAttribute('aria-checked', 'true');
      userConfig.persona = card.getAttribute('data-role');
      userConfig.personaDesc = card.getAttribute('data-desc');
    };

    card.addEventListener('click', selectRole);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectRole();
      }
    });
  });

  // Step 2: Tone Selection
  const tonePills = document.querySelectorAll('.tone-pill-btn');
  tonePills.forEach(pill => {
    const selectTone = () => {
      tonePills.forEach(p => {
        p.classList.remove('selected');
        p.setAttribute('aria-checked', 'false');
      });
      pill.classList.add('selected');
      pill.setAttribute('aria-checked', 'true');
      userConfig.tone = pill.getAttribute('data-tone');
    };

    pill.addEventListener('click', selectTone);
    pill.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectTone();
      }
    });
  });

  // Step 3: Interactive Sampler Typing Demo
  const samplerTabs = document.querySelectorAll('.sampler-tab');
  const previewTextEl = document.getElementById('samplerPreviewText');
  const previewTag = document.getElementById('previewLanguageTag');

  function triggerTypingDemo(key) {
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }
    const sample = samples[key] || samples.code;
    if (previewTag) previewTag.textContent = sample.lang;
    if (previewTextEl) previewTextEl.textContent = '';
    
    let index = 0;
    const speed = 12; // ms per char
    
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';

    typingInterval = setInterval(() => {
      if (!previewTextEl) {
        clearInterval(typingInterval);
        return;
      }
      if (index < sample.text.length) {
        previewTextEl.textContent = sample.text.substring(0, index + 1);
        previewTextEl.appendChild(cursor);
        index++;
      } else {
        clearInterval(typingInterval);
        typingInterval = null;
      }
    }, speed);
  }

  samplerTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      samplerTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const sampleKey = tab.getAttribute('data-sample');
      triggerTypingDemo(sampleKey);
    });
  });

  // Step Navigation Listeners
  stepNodes.forEach(node => {
    node.addEventListener('click', () => {
      const step = parseInt(node.getAttribute('data-step'), 10);
      updateStep(step);
    });
  });

  nextBtn.addEventListener('click', () => {
    if (currentStep < totalSteps) {
      updateStep(currentStep + 1);
    } else {
      launchWorkspace();
    }
  });

  prevBtn.addEventListener('click', () => {
    if (currentStep > 1) {
      updateStep(currentStep - 1);
    }
  });

  skipBtn.addEventListener('click', () => {
    updateStep(totalSteps);
  });

  // Settings Drawer Toggle
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      settingsDrawer.style.display = settingsDrawer.style.display === 'none' ? 'block' : 'none';
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      settingsDrawer.style.display = 'none';
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      userConfig.apiKey = apiKeyInput.value.trim();
      userConfig.model = modelSelect.value;
      localStorage.setItem('ameer_ai_gemini_api_key', userConfig.apiKey);
      localStorage.setItem('ameer_ai_gemini_model', userConfig.model);
      if (chatModelBadge) chatModelBadge.textContent = userConfig.model;
      if (summaryModel) summaryModel.textContent = userConfig.model;

      checkHealth();

      saveNotice.style.display = 'inline';
      setTimeout(() => {
        saveNotice.style.display = 'none';
        settingsDrawer.style.display = 'none';
      }, 1200);
    });
  }

  // Launch Workspace
  function launchWorkspace(initialUserMessage = null) {
    wizardCard.style.display = 'none';
    chatWorkspace.classList.add('active');

    activePersonaBadge.textContent = `${userConfig.persona} • ${userConfig.tone}`;
    if (chatModelBadge) chatModelBadge.textContent = userConfig.model;
    
    welcomeChatMsg.innerHTML = `👋 <strong>Welcome!</strong> I am calibrated as <strong>Ameer AI</strong> (${userConfig.persona}) with a <em>${userConfig.tone}</em> response profile.<br><br>Connected via Ameer AI Engine (<code>${userConfig.model}</code>). What are we working on today?`;

    if (initialUserMessage) {
      appendUserMessage(initialUserMessage);
      sendQueryToGemini(initialUserMessage);
    } else {
      chatInputField.focus();
    }
  }

  // Reopen Onboarding / Reconfigure
  reopenOnboardingBtn.addEventListener('click', () => {
    chatWorkspace.classList.remove('active');
    wizardCard.style.display = 'flex';
    updateStep(2);
  });

  // Robust Markdown-to-HTML parser for responses
  function renderMarkdown(md) {
    if (!md) return '';

    const codeBlocks = [];
    // 1. Protect code blocks (support both \r\n and \n)
    let text = md.replace(/```([a-zA-Z0-9_\-\+]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = `__CODE_BLOCK_${codeBlocks.length}__`;
      const escapedCode = code.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const langClass = lang ? ` language-${lang}` : '';
      const html = `<div class="code-block-wrapper"><button class="code-copy-btn" type="button">Copy</button><pre><code class="${langClass}">${escapedCode}</code></pre></div>`;
      codeBlocks.push(html);
      return id;
    });

    // 2. Protect inline code
    const inlineCodes = [];
    text = text.replace(/`([^`]+)`/g, (m, c) => {
      const id = `__INLINE_CODE_${inlineCodes.length}__`;
      inlineCodes.push(`<code>${c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`);
      return id;
    });

    // 3. Escape HTML entities in regular text
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 4. Headings
    text = text.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
    text = text.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    text = text.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    text = text.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

    // 5. Bold and Italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 6. Ordered lists
    text = text.replace(/^\s*\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
    text = text.replace(/((?:<oli>.*?<\/oli>\s*)+)/gs, (match) => {
      return `<ol>${match.replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>')}</ol>`;
    });

    // 7. Bullet lists (group consecutive items cleanly without swallowing between text)
    text = text.replace(/^\s*[•\-\*]\s+(.+)$/gm, '<uli>$1</uli>');
    text = text.replace(/((?:<uli>.*?<\/uli>\s*)+)/gs, (match) => {
      return `<ul>${match.replace(/<uli>/g, '<li>').replace(/<\/uli>/g, '</li>')}</ul>`;
    });

    // 8. Paragraph line breaks
    text = text.replace(/\r?\n\r?\n/g, '<br><br>');

    // 9. Restore inline code
    inlineCodes.forEach((codeHtml, idx) => {
      text = text.replace(`__INLINE_CODE_${idx}__`, codeHtml);
    });

    // 10. Restore code blocks
    codeBlocks.forEach((blockHtml, idx) => {
      text = text.replace(`__CODE_BLOCK_${idx}__`, blockHtml);
    });

    return text;
  }

  // Attach clipboard copy listeners to code blocks
  function attachCopyListeners(container) {
    const buttons = container.querySelectorAll('.code-copy-btn');
    buttons.forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pre = btn.parentElement.querySelector('pre');
        if (!pre) return;
        const textToCopy = pre.innerText || pre.textContent;
        try {
          await navigator.clipboard.writeText(textToCopy);
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 2000);
        } catch (err) {
          btn.textContent = 'Error';
        }
      });
    });
  }

  // Append user message
  function appendUserMessage(text) {
    const row = document.createElement('div');
    row.className = 'msg-row user';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    chatStream.appendChild(row);
    chatStream.scrollTo({ top: chatStream.scrollHeight, behavior: 'smooth' });
  }

  // Append AI message with loading state
  function appendLoadingMessage() {
    const row = document.createElement('div');
    row.className = 'msg-row ai';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble loading';
    bubble.innerHTML = '<div class="loading-dot"></div><div class="loading-dot"></div><div class="loading-dot"></div>';
    row.appendChild(bubble);
    chatStream.appendChild(row);
    chatStream.scrollTo({ top: chatStream.scrollHeight, behavior: 'smooth' });
    return { row, bubble };
  }

  // In-flight submission lock
  function setSubmitting(submitting) {
    isSubmitting = submitting;
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
      sendBtn.disabled = submitting;
      sendBtn.textContent = submitting ? 'Thinking...' : 'Send ↵';
      sendBtn.style.opacity = submitting ? '0.7' : '1';
    }
    chatInputField.disabled = submitting;
    if (!submitting) {
      chatInputField.focus();
    }
  }

  // Query Backend Gemini Server
  async function sendQueryToGemini(userText) {
    if (isSubmitting) return;
    setSubmitting(true);

    const { bubble } = appendLoadingMessage();

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          persona: userConfig.persona,
          tone: userConfig.tone,
          model: userConfig.model,
          apiKey: userConfig.apiKey || undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with ${response.status}`);
      }

      const data = await response.json();
      bubble.classList.remove('loading');
      bubble.innerHTML = renderMarkdown(data.reply);
      attachCopyListeners(bubble);
      chatStream.scrollTo({ top: chatStream.scrollHeight, behavior: 'smooth' });

    } catch (err) {
      console.warn('Backend query error, falling back to local reasoning simulator:', err);
      bubble.classList.remove('loading');

      let errorNotice = '';
      if (err.message.includes('Failed to fetch')) {
        errorNotice = `<div style="color: #fbbf24; font-size: 0.82rem; margin-bottom: 8px;">ℹ️ <em>Running in offline simulation mode (start Python server.py for live GCP Gemini API responses).</em></div>`;
      } else {
        errorNotice = `<div style="color: #f87171; font-size: 0.82rem; margin-bottom: 8px;">⚠️ <em>Gemini Notice: ${err.message}</em></div>`;
      }

      let simulatedReply = '';
      if (userConfig.persona === 'Software Architect') {
        simulatedReply = `### Architectural Breakdown: "${userText}"\n\n1. **Pattern Recommendation**: Implement an event-driven decoupled service topology.\n2. **Resilience**: Enforce circuit breakers and exponential backoff retry policies.\n3. **Throughput**: Maintain sub-20ms p99 latency with read-replicas and distributed caching.\n\n\`\`\`typescript\nexport interface PipelineConfig {\n  maxConcurrency: number;\n  retryAttempts?: number;\n  timeoutMs?: number;\n}\n\nexport const DEFAULT_PIPELINE_CONFIG: Required<PipelineConfig> = {\n  maxConcurrency: 16,\n  retryAttempts: 3,\n  timeoutMs: 5000,\n};\n\`\`\``;
      } else if (userConfig.persona === 'Research Analyst') {
        simulatedReply = `### Empirical Synthesis: "${userText}"\n\n1. **Hypothesis Evaluation**: Metrics support positive variance under distributed load.\n2. **Statistical Significance**: Confidence interval 95% (p < 0.01).\n3. **Recommendation**: Prioritize low-latency caching layer.\n\n\`\`\`python\nimport numpy as np\n# Variance confidence test\nconfidence_interval = np.percentile(latency_samples, [2.5, 97.5])\n\`\`\``;
      } else if (userConfig.persona === 'Creative Strategist') {
        simulatedReply = `### Creative Strategy: "${userText}"\n\n• **Core Hook**: Frictionless intelligence directly inside your native workflow.\n• **User Value**: Eliminate cognitive context-switching with proactive reasoning.\n• **Milestone Goal**: Launch developer preview with targeted benchmark proof-points.`;
      } else {
        simulatedReply = `### Executive Memo: "${userText}"\n\n1. **Strategic Context**: Alignment with core efficiency and reliability milestones.\n2. **Operational Framework**: Allocate resources to Phase 1 validation.\n3. **Key Result**: Deliver production-ready pipeline within current sprint.`;
      }

      bubble.innerHTML = errorNotice + renderMarkdown(simulatedReply);
      attachCopyListeners(bubble);
      chatStream.scrollTo({ top: chatStream.scrollHeight, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  }

  // Chat Form Submission
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = chatInputField.value.trim();
    if (!query || isSubmitting) return;
    chatInputField.value = '';
    chatInputField.style.height = 'auto';
    appendUserMessage(query);
    sendQueryToGemini(query);
  });

  // Enter to send, Shift+Enter for newline in textarea
  chatInputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event('submit'));
    }
  });

  // Auto-expand textarea
  chatInputField.addEventListener('input', () => {
    chatInputField.style.height = 'auto';
    chatInputField.style.height = Math.min(chatInputField.scrollHeight, 140) + 'px';
  });

  // Keyboard navigation on stepper
  document.addEventListener('keydown', (e) => {
    if (chatWorkspace.classList.contains('active')) return;
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag)) return;

    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (currentStep < totalSteps) {
        updateStep(currentStep + 1);
      } else if (currentStep === totalSteps && e.key === 'Enter') {
        launchWorkspace();
      }
    } else if (e.key === 'ArrowLeft') {
      if (currentStep > 1) {
        updateStep(currentStep - 1);
      }
    }
  });

  // Initializations
  updateStep(1);
  checkHealth();
});
