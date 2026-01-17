import { App, Modal, Setting, TextAreaComponent, ButtonComponent } from 'obsidian';
import type { ConversationMessage, Personality, IntrospectorSettings, ConversationState, IntrospectionSummary } from '../types';
import { ClaudeService } from '../services/claude';
import { VaultService } from '../services/vault';

export class IntrospectorModal extends Modal {
  private settings: IntrospectorSettings;
  private claudeService: ClaudeService;
  private vaultService: VaultService;
  private state: ConversationState;
  private inputEl: TextAreaComponent | null = null;
  private conversationEl: HTMLElement | null = null;
  private isLoading: boolean = false;
  private vaultContext: string = '';

  constructor(
    app: App,
    settings: IntrospectorSettings,
    claudeService: ClaudeService,
    vaultService: VaultService
  ) {
    super(app);
    this.settings = settings;
    this.claudeService = claudeService;
    this.vaultService = vaultService;
    this.state = {
      messages: [],
      personality: settings.defaultPersonality,
      startTime: new Date(),
      openingHaiku: ''
    };
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('introspector-modal');

    // Add custom styles
    this.addStyles();

    // Header with personality selector
    const headerEl = contentEl.createDiv({ cls: 'introspector-header' });

    new Setting(headerEl)
      .setName('Personality')
      .addDropdown(dropdown => dropdown
        .addOption('socratic', 'Socratic Guide')
        .addOption('warm', 'Warm Therapist')
        .addOption('challenger', 'Direct Challenger')
        .setValue(this.state.personality)
        .onChange(value => {
          this.state.personality = value as Personality;
        }));

    // Conversation area
    this.conversationEl = contentEl.createDiv({ cls: 'introspector-conversation' });

    // Input area
    const inputContainer = contentEl.createDiv({ cls: 'introspector-input-container' });

    this.inputEl = new TextAreaComponent(inputContainer);
    this.inputEl.inputEl.addClass('introspector-input');
    this.inputEl.setPlaceholder('Share your thoughts...');
    this.inputEl.inputEl.rows = 3;

    // Handle Enter to send (Shift+Enter for newline)
    this.inputEl.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'introspector-buttons' });

    new ButtonComponent(buttonContainer)
      .setButtonText('Send')
      .setCta()
      .onClick(() => this.sendMessage());

    new ButtonComponent(buttonContainer)
      .setButtonText('Finish')
      .onClick(() => this.finishSession());

    // Start the session
    await this.startSession();
  }

  private addStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      .introspector-modal {
        padding: 20px;
        max-width: 600px;
      }
      .introspector-conversation {
        max-height: 400px;
        overflow-y: auto;
        margin: 20px 0;
        padding: 10px;
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
      }
      .introspector-message {
        margin-bottom: 16px;
        padding: 12px;
        border-radius: 8px;
      }
      .introspector-message.assistant {
        background: var(--background-secondary);
        font-style: italic;
      }
      .introspector-message.user {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        margin-left: 20%;
      }
      .introspector-message.haiku {
        text-align: center;
        font-style: italic;
        white-space: pre-line;
      }
      .introspector-input-container {
        margin-bottom: 10px;
      }
      .introspector-input {
        width: 100%;
        resize: vertical;
      }
      .introspector-buttons {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      .introspector-loading {
        opacity: 0.6;
        font-style: italic;
      }
    `;
    document.head.appendChild(styleEl);
  }

  private async startSession() {
    if (!this.conversationEl) return;

    this.isLoading = true;
    const msgEl = this.conversationEl.createDiv({
      cls: 'introspector-message assistant haiku'
    });
    msgEl.setText('Starting session...');

    try {
      this.vaultContext = await this.vaultService.getContextFromVault(this.settings);

      let fullText = '';
      const stream = this.claudeService.startConversationStream(
        this.state.personality,
        this.vaultContext
      );

      for await (const chunk of stream) {
        fullText += chunk;
        msgEl.setText(fullText);
        this.conversationEl!.scrollTop = this.conversationEl!.scrollHeight;
      }

      this.state.openingHaiku = fullText;
      this.state.messages.push({ role: 'assistant', content: fullText });
      this.isLoading = false;
    } catch (error) {
      msgEl.remove();
      this.isLoading = false;
      this.showError(`Failed to start session: ${error}`);
    }
  }

  private async sendMessage() {
    if (!this.inputEl || !this.conversationEl || this.isLoading) return;

    const userMessage = this.inputEl.getValue().trim();
    if (!userMessage) return;

    // Check for "aha" trigger
    if (userMessage.toLowerCase().includes('aha')) {
      this.state.messages.push({ role: 'user', content: userMessage });
      this.renderUserMessage(userMessage);
      this.inputEl.setValue('');
      await this.finishSession();
      return;
    }

    // Add user message
    this.state.messages.push({ role: 'user', content: userMessage });
    this.renderUserMessage(userMessage);
    this.inputEl.setValue('');

    this.isLoading = true;
    const msgEl = this.conversationEl.createDiv({
      cls: 'introspector-message assistant'
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
        msgEl.setText(fullText);
        this.conversationEl!.scrollTop = this.conversationEl!.scrollHeight;
      }

      this.state.messages.push({ role: 'assistant', content: fullText });
      this.isLoading = false;
      this.inputEl?.inputEl.focus();
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

      // Find which suggested links actually exist
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

      // Show success and close
      this.showSuccess(`Insight captured! Created: ${file.path}`);

      // Open the new note
      setTimeout(() => {
        this.app.workspace.getLeaf().openFile(file);
        this.close();
      }, 1500);

    } catch (error) {
      this.hideLoading();
      this.showError(`Failed to save insight: ${error}`);
    }
  }

  private renderConversation() {
    if (!this.conversationEl) return;
    this.conversationEl.empty();

    for (const message of this.state.messages) {
      const msgEl = this.conversationEl.createDiv({
        cls: `introspector-message ${message.role}`
      });

      // Check if this is the opening haiku
      if (message === this.state.messages[0] && message.role === 'assistant') {
        msgEl.addClass('haiku');
      }

      msgEl.setText(message.content);
    }

    // Scroll to bottom
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
      const errorEl = this.conversationEl.createDiv({ cls: 'introspector-message assistant' });
      errorEl.setText(`Error: ${message}`);
      errorEl.style.color = 'var(--text-error)';
    }
  }

  private showSuccess(message: string) {
    if (this.conversationEl) {
      const successEl = this.conversationEl.createDiv({ cls: 'introspector-message assistant' });
      successEl.setText(message);
      successEl.style.color = 'var(--text-success)';
    }
  }

  private formatDate(date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    return dateStr ?? date.toISOString().slice(0, 10);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
