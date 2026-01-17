import { App, PluginSettingTab, Setting } from "obsidian";
import type IntrospectorPlugin from "./main";
import type { IntrospectorSettings, Personality, Provider } from "./types";
import { PERSONALITY_OPTIONS } from "./types";

export const DEFAULT_SETTINGS: IntrospectorSettings = {
  provider: 'anthropic',
  apiKey: '',
  anthropicModel: 'claude-sonnet-4-20250514',
  openRouterModel: 'anthropic/claude-sonnet-4',
  saveFolder: 'Introspections',
  contextFolders: [],
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

    containerEl.createEl('h2', { text: 'Lantern Settings' });

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

    if (this.plugin.settings.provider === 'anthropic') {
      new Setting(containerEl)
        .setName('Model')
        .setDesc('Anthropic model ID (e.g., claude-sonnet-4-20250514, claude-opus-4-20250514)')
        .addText(text => text
          .setPlaceholder('claude-sonnet-4-20250514')
          .setValue(this.plugin.settings.anthropicModel)
          .onChange(async (value) => {
            this.plugin.settings.anthropicModel = value;
            await this.plugin.saveSettings();
          }));
    }

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
      .setName('Default personality')
      .setDesc('The default questioning style')
      .addDropdown(dropdown => {
        for (const opt of PERSONALITY_OPTIONS) {
          dropdown.addOption(opt.value, opt.label);
        }
        return dropdown
          .setValue(this.plugin.settings.defaultPersonality)
          .onChange(async (value) => {
            this.plugin.settings.defaultPersonality = value as Personality;
            await this.plugin.saveSettings();
          });
      });
  }
}
