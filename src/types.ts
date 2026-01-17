export type Personality = 'socratic' | 'warm' | 'challenger';
export type Provider = 'anthropic' | 'openrouter';

export interface IntrospectorSettings {
  provider: Provider;
  apiKey: string;
  openRouterModel: string;
  saveFolder: string;
  contextFolders: string[];
  contextTags: string[];
  defaultPersonality: Personality;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationState {
  messages: ConversationMessage[];
  personality: Personality;
  startTime: Date;
  openingHaiku: string;
}

export interface IntrospectionSummary {
  insights: string[];
  suggestedLinks: string[];
  conversation: ConversationMessage[];
  haiku: string;
  date: string;
}
