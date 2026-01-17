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

    // Input area
    const inputContainer = container.createDiv({ cls: 'introspector-input-container' });

    this.inputEl = inputContainer.createEl('textarea', {
      cls: 'introspector-input',
      attr: { placeholder: 'Share your thoughts, or pick a number...', rows: '3' }
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Buttons
    const buttonContainer = container.createDiv({ cls: 'introspector-buttons' });

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
    if (existingStyle) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'introspector-styles';
    styleEl.textContent = `
      .introspector-view {
        padding: 16px;
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .introspector-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .introspector-title {
        font-weight: 600;
        font-size: 1.1em;
      }
      .introspector-personality-select {
        padding: 4px 8px;
        border-radius: 4px;
        background: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        color: var(--text-normal);
      }
      .introspector-conversation {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 16px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .introspector-message {
        padding: 12px;
        border-radius: 8px;
        line-height: 1.5;
      }
      .introspector-message.assistant {
        background: var(--background-secondary);
        border-left: 3px solid var(--interactive-accent);
      }
      .introspector-message.assistant p {
        margin: 0 0 8px 0;
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
        margin: 8px 0;
        padding-left: 20px;
      }
      .introspector-message.assistant li {
        margin: 4px 0;
      }
      .introspector-message.user {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        margin-left: 15%;
        border-radius: 8px 8px 0 8px;
      }
      .introspector-message.haiku {
        text-align: center;
        font-style: italic;
        background: linear-gradient(135deg, var(--background-secondary) 0%, var(--background-primary) 100%);
        border: 1px solid var(--background-modifier-border);
        border-left: none;
      }
      .introspector-message.haiku p {
        margin: 4px 0;
      }
      .introspector-message.streaming {
        opacity: 0.9;
      }
      .introspector-input-container {
        margin-bottom: 12px;
      }
      .introspector-input {
        width: 100%;
        resize: vertical;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
        font-family: inherit;
        font-size: inherit;
      }
      .introspector-input:focus {
        outline: none;
        border-color: var(--interactive-accent);
      }
      .introspector-buttons {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }
      .introspector-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-secondary);
        color: var(--text-normal);
        cursor: pointer;
        font-size: 0.9em;
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
        padding: 12px;
        font-style: italic;
        color: var(--text-muted);
        text-align: center;
      }
      .introspector-error {
        color: var(--text-error);
        padding: 12px;
        background: var(--background-secondary);
        border-radius: 8px;
        border-left: 3px solid var(--text-error);
      }
      .introspector-success {
        color: var(--text-success);
        padding: 12px;
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
