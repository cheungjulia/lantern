import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import type { ConversationMessage, Personality, IntrospectorSettings, ConversationState, IntrospectionSummary } from '../types';
import { ClaudeService } from '../services/claude';
import { VaultService } from '../services/vault';

export const VIEW_TYPE_INTROSPECTOR = 'introspector-view';

export class IntrospectorView extends ItemView {
  private settings: IntrospectorSettings;
  private claudeService: ClaudeService;
  private vaultService: VaultService;
  private state: ConversationState;
  private inputEl: HTMLTextAreaElement | null = null;
  private conversationEl: HTMLElement | null = null;
  private isLoading: boolean = false;
  private vaultContext: string = '';
  private renderComponent: Component;

  constructor(
    leaf: WorkspaceLeaf,
    settings: IntrospectorSettings,
    claudeService: ClaudeService,
    vaultService: VaultService
  ) {
    super(leaf);
    this.settings = settings;
    this.claudeService = claudeService;
    this.vaultService = vaultService;
    this.renderComponent = new Component();
    this.state = {
      messages: [],
      personality: settings.defaultPersonality,
      startTime: new Date(),
      openingHaiku: ''
    };
  }

  getViewType(): string {
    return VIEW_TYPE_INTROSPECTOR;
  }

  getDisplayText(): string {
    return 'Introspector';
  }

  getIcon(): string {
    return 'brain';
  }

  async onOpen() {
    this.renderComponent.load();
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;

    container.empty();
    container.addClass('introspector-view');

    this.addStyles();

    // Header with personality selector
    const headerEl = container.createDiv({ cls: 'introspector-header' });

    const titleEl = headerEl.createDiv({ cls: 'introspector-title' });
    titleEl.setText('Introspector');

    const selectContainer = headerEl.createDiv({ cls: 'introspector-select-container' });
    const selectEl = selectContainer.createEl('select', { cls: 'introspector-personality-select' });

    const options: { value: Personality; label: string }[] = [
      { value: 'socratic', label: 'Socratic Guide' },
      { value: 'warm', label: 'Warm Therapist' },
      { value: 'challenger', label: 'Direct Challenger' }
    ];

    for (const opt of options) {
      const optionEl = selectEl.createEl('option', { value: opt.value, text: opt.label });
      if (opt.value === this.state.personality) {
        optionEl.selected = true;
      }
    }

    selectEl.addEventListener('change', () => {
      this.state.personality = selectEl.value as Personality;
    });

    // Conversation area
    this.conversationEl = container.createDiv({ cls: 'introspector-conversation' });

    // Input footer (input + buttons together)
    const inputFooter = container.createDiv({ cls: 'introspector-footer' });

    this.inputEl = inputFooter.createEl('textarea', {
      cls: 'introspector-input',
      attr: { placeholder: 'Rambles, tidbits, before and afterthoughts', rows: '2' }
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    const buttonContainer = inputFooter.createDiv({ cls: 'introspector-buttons' });

    const sendBtn = buttonContainer.createEl('button', { cls: 'introspector-btn introspector-btn-primary', text: 'Send' });
    sendBtn.addEventListener('click', () => this.sendMessage());

    const finishBtn = buttonContainer.createEl('button', { cls: 'introspector-btn', text: 'Finish' });
    finishBtn.addEventListener('click', () => this.finishSession());

    const newBtn = buttonContainer.createEl('button', { cls: 'introspector-btn', text: 'New' });
    newBtn.addEventListener('click', () => this.startNewSession());

    // Start the session
    await this.startSession();
  }

  private addStyles() {
    const existingStyle = document.getElementById('introspector-styles');
    if (existingStyle) existingStyle.remove();

    const styleEl = document.createElement('style');
    styleEl.id = 'introspector-styles';
    styleEl.textContent = `
      /* Force full height on all parent containers */
      .workspace-leaf-content[data-type="introspector-view"],
      .workspace-leaf-content[data-type="introspector-view"] > .view-content {
        height: 100% !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
      }

      .introspector-view {
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        flex: 1 1 auto !important;
        height: 100% !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }

      .introspector-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid var(--background-modifier-border);
        flex: 0 0 auto;
        background: var(--background-primary);
      }

      .introspector-title {
        font-weight: 600;
        font-size: 1em;
      }

      .introspector-personality-select {
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
        font-size: 0.85em;
      }

      .introspector-conversation {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .introspector-message {
        padding: 10px 12px;
        border-radius: 8px;
        line-height: 1.5;
        flex: 0 0 auto;
      }

      .introspector-message.assistant {
        background: var(--background-secondary);
        border-left: 3px solid var(--interactive-accent);
      }

      .introspector-message.assistant p {
        margin: 0 0 6px 0;
      }

      .introspector-message.assistant p:last-child {
        margin-bottom: 0;
      }

      .introspector-message.assistant strong {
        color: var(--text-accent);
      }

      .introspector-message.assistant em {
        color: var(--text-muted);
      }

      .introspector-message.assistant ol,
      .introspector-message.assistant ul {
        margin: 6px 0;
        padding-left: 20px;
      }

      .introspector-message.assistant li {
        margin: 2px 0;
      }

      .introspector-message.user {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        margin-left: 20%;
        border-radius: 12px 12px 2px 12px;
      }

      .introspector-message.haiku {
        font-style: italic;
        background: var(--background-secondary);
        border-left: 3px solid var(--interactive-accent);
      }

      .introspector-message.streaming {
        opacity: 0.85;
      }

      .introspector-footer {
        flex: 0 0 auto;
        background: var(--background-secondary);
        padding: 10px;
        border-top: 1px solid var(--background-modifier-border);
      }

      .introspector-input {
        width: 100%;
        resize: none;
        padding: 10px 12px;
        border-radius: 8px;
        border: none;
        background: var(--background-primary);
        color: var(--text-normal);
        font-family: inherit;
        font-size: inherit;
        margin-bottom: 8px;
        box-sizing: border-box;
      }

      .introspector-input:focus {
        outline: none;
        box-shadow: 0 0 0 2px var(--interactive-accent-hover);
      }

      .introspector-input::placeholder {
        color: var(--text-faint);
      }

      .introspector-buttons {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
      }

      .introspector-btn {
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        cursor: pointer;
        font-size: 0.8em;
      }

      .introspector-btn:hover {
        background: var(--background-modifier-hover);
      }

      .introspector-btn-primary {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        border: none;
      }

      .introspector-btn-primary:hover {
        opacity: 0.9;
      }

      .introspector-loading {
        padding: 10px;
        font-style: italic;
        color: var(--text-muted);
        text-align: center;
      }

      .introspector-error {
        color: var(--text-error);
        padding: 10px;
        background: var(--background-secondary);
        border-radius: 8px;
        border-left: 3px solid var(--text-error);
      }

      .introspector-success {
        color: var(--text-success);
        padding: 10px;
        background: var(--background-secondary);
        border-radius: 8px;
        border-left: 3px solid var(--text-success);
      }
    `;
    document.head.appendChild(styleEl);
  }

  private async startSession() {
    if (!this.conversationEl) return;

    this.isLoading = true;
    const msgEl = this.conversationEl.createDiv({
      cls: 'introspector-message assistant haiku streaming'
    });

    try {
      this.vaultContext = await this.vaultService.getContextFromVault(this.settings);

      let fullText = '';
      const stream = this.claudeService.startConversationStream(
        this.state.personality,
        this.vaultContext
      );

      for await (const chunk of stream) {
        fullText += chunk;
        msgEl.empty();
        await MarkdownRenderer.render(
          this.app,
          fullText,
          msgEl,
          '',
          this.renderComponent
        );
        this.conversationEl!.scrollTop = this.conversationEl!.scrollHeight;
      }

      msgEl.removeClass('streaming');
      this.state.openingHaiku = fullText;
      this.state.messages.push({ role: 'assistant', content: fullText });
      this.isLoading = false;
    } catch (error) {
      msgEl.remove();
      this.isLoading = false;
      this.showError(`Failed to start session: ${error}`);
    }
  }

  private async startNewSession() {
    this.state = {
      messages: [],
      personality: this.state.personality,
      startTime: new Date(),
      openingHaiku: ''
    };
    if (this.conversationEl) {
      this.conversationEl.empty();
    }
    await this.startSession();
  }

  private async sendMessage() {
    if (!this.inputEl || !this.conversationEl || this.isLoading) return;

    const userMessage = this.inputEl.value.trim();
    if (!userMessage) return;

    if (userMessage.toLowerCase().includes('aha')) {
      this.state.messages.push({ role: 'user', content: userMessage });
      this.renderUserMessage(userMessage);
      this.inputEl.value = '';
      await this.finishSession();
      return;
    }

    this.state.messages.push({ role: 'user', content: userMessage });
    this.renderUserMessage(userMessage);
    this.inputEl.value = '';

    this.isLoading = true;
    const msgEl = this.conversationEl.createDiv({
      cls: 'introspector-message assistant streaming'
    });

    try {
      let fullText = '';
      const stream = this.claudeService.streamConversation(
        this.state.personality,
        this.state.messages,
        this.vaultContext
      );

      for await (const chunk of stream) {
        fullText += chunk;
        msgEl.empty();
        await MarkdownRenderer.render(
          this.app,
          fullText,
          msgEl,
          '',
          this.renderComponent
        );
        this.conversationEl!.scrollTop = this.conversationEl!.scrollHeight;
      }

      msgEl.removeClass('streaming');
      this.state.messages.push({ role: 'assistant', content: fullText });
      this.isLoading = false;
      this.inputEl?.focus();
    } catch (error) {
      msgEl.remove();
      this.isLoading = false;
      this.showError(`Failed to get response: ${error}`);
    }
  }

  private renderUserMessage(content: string) {
    if (!this.conversationEl) return;
    const msgEl = this.conversationEl.createDiv({
      cls: 'introspector-message user'
    });
    msgEl.setText(content);
    this.conversationEl.scrollTop = this.conversationEl.scrollHeight;
  }

  private async finishSession() {
    if (this.state.messages.length < 2) {
      this.showError('Have a conversation first before finishing.');
      return;
    }

    this.showLoading('Generating insights...');

    try {
      const { insights, links } = await this.claudeService.generateSummary(this.state.messages);

      const existingLinks = await this.vaultService.findRelatedNotes(links);
      const allLinks = [...new Set([...existingLinks, ...links])];

      const summary: IntrospectionSummary = {
        insights,
        suggestedLinks: allLinks,
        conversation: this.state.messages,
        haiku: this.state.openingHaiku,
        date: this.formatDate(this.state.startTime)
      };

      const file = await this.vaultService.createIntrospectionNote(summary, this.settings);

      this.hideLoading();
      this.showSuccess(`Insight captured! Created: ${file.path}`);

      setTimeout(() => {
        this.app.workspace.getLeaf('tab').openFile(file);
      }, 1500);

    } catch (error) {
      this.hideLoading();
      this.showError(`Failed to save insight: ${error}`);
    }
  }

  private async renderConversation() {
    if (!this.conversationEl) return;
    this.conversationEl.empty();

    for (let i = 0; i < this.state.messages.length; i++) {
      const message = this.state.messages[i];
      if (!message) continue;

      const msgEl = this.conversationEl.createDiv({
        cls: `introspector-message ${message.role}`
      });

      if (i === 0 && message.role === 'assistant') {
        msgEl.addClass('haiku');
      }

      if (message.role === 'assistant') {
        await MarkdownRenderer.render(
          this.app,
          message.content,
          msgEl,
          '',
          this.renderComponent
        );
      } else {
        msgEl.setText(message.content);
      }
    }

    this.conversationEl.scrollTop = this.conversationEl.scrollHeight;
  }

  private showLoading(message: string) {
    this.isLoading = true;
    if (this.conversationEl) {
      const loadingEl = this.conversationEl.createDiv({ cls: 'introspector-loading' });
      loadingEl.setText(message);
      this.conversationEl.scrollTop = this.conversationEl.scrollHeight;
    }
  }

  private hideLoading() {
    this.isLoading = false;
    if (this.conversationEl) {
      const loadingEl = this.conversationEl.querySelector('.introspector-loading');
      loadingEl?.remove();
    }
  }

  private showError(message: string) {
    if (this.conversationEl) {
      const errorEl = this.conversationEl.createDiv({ cls: 'introspector-error' });
      errorEl.setText(message);
    }
  }

  private showSuccess(message: string) {
    if (this.conversationEl) {
      const successEl = this.conversationEl.createDiv({ cls: 'introspector-success' });
      successEl.setText(message);
    }
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0] ?? date.toISOString().slice(0, 10);
  }

  async onClose() {
    this.renderComponent.unload();
  }

  updateSettings(settings: IntrospectorSettings) {
    this.settings = settings;
  }
}
