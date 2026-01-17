import { Plugin, Notice, WorkspaceLeaf } from 'obsidian';
import type { IntrospectorSettings } from './types';
import { DEFAULT_SETTINGS, IntrospectorSettingTab } from './settings';
import { ClaudeService } from './services/claude';
import { VaultService } from './services/vault';
import { IntrospectorView, VIEW_TYPE_INTROSPECTOR } from './ui/IntrospectorView';

export default class IntrospectorPlugin extends Plugin {
  settings: IntrospectorSettings = DEFAULT_SETTINGS;
  private claudeService: ClaudeService = new ClaudeService();
  private vaultService: VaultService | null = null;

  private configureClaudeService(): void {
    if (this.settings.apiKey) {
      this.claudeService.configure(
        this.settings.provider,
        this.settings.apiKey,
        this.settings.anthropicModel,
        this.settings.openRouterModel
      );
    }
  }

  async onload() {
    await this.loadSettings();

    // Initialize services
    this.vaultService = new VaultService(this.app);
    this.configureClaudeService();

    // Register the sidebar view
    this.registerView(
      VIEW_TYPE_INTROSPECTOR,
      (leaf) => new IntrospectorView(
        leaf,
        this.settings,
        this.claudeService,
        this.vaultService!
      )
    );

    // Add ribbon icon
    this.addRibbonIcon('brain', 'Start introspection', () => {
      this.openIntrospector();
    });

    // Add command
    this.addCommand({
      id: 'open-introspector',
      name: 'Start introspection session',
      callback: () => {
        this.openIntrospector();
      }
    });

    // Add settings tab
    this.addSettingTab(new IntrospectorSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_INTROSPECTOR);
  }

  private async openIntrospector() {
    if (!this.settings.apiKey) {
      new Notice('Please configure your API key in Introspector settings.');
      return;
    }

    // Update config in case it changed
    this.configureClaudeService();

    if (!this.vaultService) {
      new Notice('Plugin not fully initialized. Please reload.');
      return;
    }

    // Check if view is already open
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_INTROSPECTOR);
    if (existing.length > 0 && existing[0]) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    // Open in right sidebar
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({
        type: VIEW_TYPE_INTROSPECTOR,
        active: true
      });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.configureClaudeService();
  }
}
