import Anthropic from '@anthropic-ai/sdk';
import type { ConversationMessage, Personality, Provider } from '../types';
import { getSystemPrompt } from '../prompts/personalities';
import { SUMMARY_PROMPT, formatSummaryRequest } from '../prompts/summary';

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class ClaudeService {
  private anthropicClient: Anthropic | null = null;
  private apiKey: string = '';
  private provider: Provider = 'anthropic';
  private openRouterModel: string = 'anthropic/claude-sonnet-4';

  configure(provider: Provider, apiKey: string, openRouterModel?: string): void {
    this.provider = provider;
    this.apiKey = apiKey;
    this.openRouterModel = openRouterModel ?? 'anthropic/claude-sonnet-4';

    if (provider === 'anthropic') {
      this.anthropicClient = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true
      });
    } else {
      this.anthropicClient = null;
    }
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  async startConversation(
    personality: Personality,
    vaultContext: string
  ): Promise<string> {
    const systemPrompt = vaultContext
      ? `${getSystemPrompt(personality)}\n\nContext from their recent notes:\n${vaultContext}`
      : getSystemPrompt(personality);

    if (this.provider === 'anthropic') {
      return this.startConversationAnthropic(systemPrompt);
    } else {
      return this.startConversationOpenRouter(systemPrompt);
    }
  }

  async continueConversation(
    personality: Personality,
    messages: ConversationMessage[],
    vaultContext: string
  ): Promise<{ response: string; detectedResolution: boolean }> {
    const systemPrompt = vaultContext
      ? `${getSystemPrompt(personality)}\n\nContext from their recent notes:\n${vaultContext}`
      : getSystemPrompt(personality);

    let text: string;
    if (this.provider === 'anthropic') {
      text = await this.continueConversationAnthropic(systemPrompt, messages);
    } else {
      text = await this.continueConversationOpenRouter(systemPrompt, messages);
    }

    const detectedResolution = text.toLowerCase().includes('capture') &&
                               text.toLowerCase().includes('insight');

    return { response: text, detectedResolution };
  }

  async generateSummary(conversation: ConversationMessage[]): Promise<{ insights: string[]; links: string[] }> {
    const conversationText = conversation
      .map(m => `${m.role === 'user' ? 'You' : 'Introspector'}: ${m.content}`)
      .join('\n\n');

    let text: string;
    if (this.provider === 'anthropic') {
      text = await this.generateSummaryAnthropic(conversationText);
    } else {
      text = await this.generateSummaryOpenRouter(conversationText);
    }

    return this.parseSummaryResponse(text);
  }

  // Anthropic implementations
  private async startConversationAnthropic(systemPrompt: string): Promise<string> {
    if (!this.anthropicClient) throw new Error('Anthropic client not configured');

    const response = await this.anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Begin the session.' }]
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') throw new Error('Unexpected response type');
    return content.text;
  }

  private async continueConversationAnthropic(systemPrompt: string, messages: ConversationMessage[]): Promise<string> {
    if (!this.anthropicClient) throw new Error('Anthropic client not configured');

    const anthropicMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    const response = await this.anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemPrompt,
      messages: anthropicMessages
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') throw new Error('Unexpected response type');
    return content.text;
  }

  private async generateSummaryAnthropic(conversationText: string): Promise<string> {
    if (!this.anthropicClient) throw new Error('Anthropic client not configured');

    const response = await this.anthropicClient.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SUMMARY_PROMPT,
      messages: [{ role: 'user', content: formatSummaryRequest(conversationText) }]
    });

    const content = response.content[0];
    if (!content || content.type !== 'text') throw new Error('Unexpected response type');
    return content.text;
  }

  // OpenRouter implementations
  private async callOpenRouter(messages: OpenRouterMessage[], maxTokens: number): Promise<string> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://obsidian.md',
        'X-Title': 'Introspector'
      },
      body: JSON.stringify({
        model: this.openRouterModel,
        messages,
        max_tokens: maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json() as OpenRouterResponse;
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('No response from OpenRouter');
    return content;
  }

  private async startConversationOpenRouter(systemPrompt: string): Promise<string> {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Begin the session.' }
    ];
    return this.callOpenRouter(messages, 500);
  }

  private async continueConversationOpenRouter(systemPrompt: string, messages: ConversationMessage[]): Promise<string> {
    const openRouterMessages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ];
    return this.callOpenRouter(openRouterMessages, 500);
  }

  private async generateSummaryOpenRouter(conversationText: string): Promise<string> {
    const messages: OpenRouterMessage[] = [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: formatSummaryRequest(conversationText) }
    ];
    return this.callOpenRouter(messages, 1000);
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
