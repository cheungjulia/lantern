import { ItemView, WorkspaceLeaf, MarkdownRenderer, Component } from 'obsidian';
import type { Personality, IntrospectorSettings, ConversationState, IntrospectionSummary } from '../types';
import { PERSONALITY_OPTIONS } from '../types';
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
    return 'Lantern';
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

    // Header with personality selector
    const headerEl = container.createDiv({ cls: 'introspector-header' });

    const titleEl = headerEl.createDiv({ cls: 'introspector-title' });
    titleEl.setText('Lantern');

    const selectContainer = headerEl.createDiv({ cls: 'introspector-select-container' });
    const selectEl = selectContainer.createEl('select', { cls: 'introspector-personality-select' });

    for (const opt of PERSONALITY_OPTIONS) {
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
      attr: { placeholder: 'Rambles, tidbits, before-and-after-thoughts', rows: '3' }
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

    const finishBtn = buttonContainer.createEl('button', { cls: 'introspector-btn', text: 'Summarise' });
    finishBtn.addEventListener('click', () => this.finishSession());

    const newBtn = buttonContainer.createEl('button', { cls: 'introspector-btn', text: 'New' });
    newBtn.addEventListener('click', () => this.startNewSession());

    // Start the session
    await this.startSession();
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
    return date.toISOString().slice(0, 10);
  }

  async onClose() {
    this.renderComponent.unload();
  }

  updateSettings(settings: IntrospectorSettings) {
    this.settings = settings;
  }
}
