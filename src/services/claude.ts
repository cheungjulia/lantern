import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { ConversationMessage, Personality, Provider } from '../types';
import { getSystemPrompt } from '../prompts/personalities';
import { SUMMARY_PROMPT, formatSummaryRequest } from '../prompts/summary';

export class ClaudeService {
  private apiKey: string = '';
  private provider: Provider = 'anthropic';
  private openRouterModel: string = 'anthropic/claude-sonnet-4';

  configure(provider: Provider, apiKey: string, openRouterModel?: string): void {
    this.provider = provider;
    this.apiKey = apiKey;
    this.openRouterModel = openRouterModel ?? 'anthropic/claude-sonnet-4';
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private getModel() {
    if (this.provider === 'anthropic') {
      const anthropic = createAnthropic({ apiKey: this.apiKey });
      return anthropic('claude-sonnet-4-20250514');
    } else {
      const openrouter = createOpenRouter({ apiKey: this.apiKey });
      return openrouter.chat(this.openRouterModel);
    }
  }

  async *streamConversation(
    personality: Personality,
    messages: ConversationMessage[],
    vaultContext: string
  ): AsyncGenerator<string> {
    const systemPrompt = vaultContext
      ? `${getSystemPrompt(personality)}\n\nContext from their recent notes:\n${vaultContext}`
      : getSystemPrompt(personality);

    const formattedMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    const result = streamText({
      model: this.getModel(),
      system: systemPrompt,
      messages: formattedMessages,
      maxOutputTokens: 500
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  async *startConversationStream(
    personality: Personality,
    vaultContext: string
  ): AsyncGenerator<string> {
    const systemPrompt = vaultContext
      ? `${getSystemPrompt(personality)}\n\nContext from their recent notes:\n${vaultContext}`
      : getSystemPrompt(personality);

    const result = streamText({
      model: this.getModel(),
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Begin the session.' }],
      maxOutputTokens: 500
    });

    for await (const chunk of result.textStream) {
      yield chunk;
    }
  }

  async generateSummary(conversation: ConversationMessage[]): Promise<{ insights: string[]; links: string[] }> {
    const conversationText = conversation
      .map(m => `${m.role === 'user' ? 'You' : 'Introspector'}: ${m.content}`)
      .join('\n\n');

    const result = streamText({
      model: this.getModel(),
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content: formatSummaryRequest(conversationText) }],
      maxOutputTokens: 1000
    });

    let text = '';
    for await (const chunk of result.textStream) {
      text += chunk;
    }

    return this.parseSummaryResponse(text);
  }

  private parseSummaryResponse(text: string): { insights: string[]; links: string[] } {
    const insights: string[] = [];
    const links: string[] = [];

    const lines = text.split('\n');
    let section: 'none' | 'insights' | 'links' = 'none';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toUpperCase().startsWith('INSIGHTS:')) {
        section = 'insights';
      } else if (trimmed.toUpperCase().startsWith('LINKS:')) {
        section = 'links';
      } else if (trimmed.startsWith('- ')) {
        const content = trimmed.slice(2).trim();
        if (section === 'insights' && content) {
          insights.push(content);
        } else if (section === 'links' && content) {
          links.push(content);
        }
      }
    }

    return { insights, links };
  }
}
