export type Personality = 'socratic' | 'warm' | 'challenger';
export type Provider = 'anthropic' | 'openrouter';

export const PERSONALITY_OPTIONS: { value: Personality; label: string }[] = [
  { value: 'socratic', label: 'Socratic Guide' },
  { value: 'warm', label: 'Warm Therapist' },
  { value: 'challenger', label: 'Direct Challenger' }
];

export interface IntrospectorSettings {
  provider: Provider;
  apiKey: string;
  anthropicModel: string;
  openRouterModel: string;
  saveFolder: string;
  contextFolders: string[];
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
