import { App, PluginSettingTab, Setting } from "obsidian";
import type IntrospectorPlugin from "./main";
import type { IntrospectorSettings, Personality, Provider } from "./types";

export const DEFAULT_SETTINGS: IntrospectorSettings = {
  provider: 'anthropic',
  apiKey: '',
  openRouterModel: 'anthropic/claude-sonnet-4',
  saveFolder: 'Introspections',
  contextFolders: [],
  contextTags: [],
  defaultPersonality: 'socratic'
};

export class IntrospectorSettingTab extends PluginSettingTab {
  plugin: IntrospectorPlugin;

  constructor(app: App, plugin: IntrospectorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Introspector Settings' });

    new Setting(containerEl)
      .setName('Provider')
      .setDesc('Choose your AI provider')
      .addDropdown(dropdown => dropdown
        .addOption('anthropic', 'Anthropic (Direct)')
        .addOption('openrouter', 'OpenRouter')
        .setValue(this.plugin.settings.provider)
        .onChange(async (value) => {
          this.plugin.settings.provider = value as Provider;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide relevant fields
        }));

    const apiKeyDesc = this.plugin.settings.provider === 'anthropic'
      ? 'Your Anthropic API key (starts with sk-ant-...)'
      : 'Your OpenRouter API key (starts with sk-or-...)';

    const apiKeyPlaceholder = this.plugin.settings.provider === 'anthropic'
      ? 'sk-ant-...'
      : 'sk-or-...';

    new Setting(containerEl)
      .setName('API key')
      .setDesc(apiKeyDesc)
      .addText(text => text
        .setPlaceholder(apiKeyPlaceholder)
        .setValue(this.plugin.settings.apiKey)
        .onChange(async (value) => {
          this.plugin.settings.apiKey = value;
          await this.plugin.saveSettings();
        }));

    if (this.plugin.settings.provider === 'openrouter') {
      new Setting(containerEl)
        .setName('Model')
        .setDesc('OpenRouter model ID (e.g., anthropic/claude-sonnet-4, openai/gpt-4o)')
        .addText(text => text
          .setPlaceholder('anthropic/claude-sonnet-4')
          .setValue(this.plugin.settings.openRouterModel)
          .onChange(async (value) => {
            this.plugin.settings.openRouterModel = value;
            await this.plugin.saveSettings();
          }));
    }

    new Setting(containerEl)
      .setName('Save folder')
      .setDesc('Folder where introspection notes will be saved')
      .addText(text => text
        .setPlaceholder('Introspections')
        .setValue(this.plugin.settings.saveFolder)
        .onChange(async (value) => {
          this.plugin.settings.saveFolder = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Context folders')
      .setDesc('Comma-separated list of folders to read for context')
      .addText(text => text
        .setPlaceholder('Journal, Daily Notes')
        .setValue(this.plugin.settings.contextFolders.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.contextFolders = value
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Context tags')
      .setDesc('Comma-separated list of tags to include for context')
      .addText(text => text
        .setPlaceholder('reflection, journal')
        .setValue(this.plugin.settings.contextTags.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.contextTags = value
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Default personality')
      .setDesc('The default questioning style')
      .addDropdown(dropdown => dropdown
        .addOption('socratic', 'Socratic Guide')
        .addOption('warm', 'Warm Therapist')
        .addOption('challenger', 'Direct Challenger')
        .setValue(this.plugin.settings.defaultPersonality)
        .onChange(async (value) => {
          this.plugin.settings.defaultPersonality = value as Personality;
          await this.plugin.saveSettings();
        }));
  }
}
