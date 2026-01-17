import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { IntrospectorSettings, IntrospectionSummary, ConversationMessage } from '../types';
import { CONTEXT_FILE_LIMIT, CONTEXT_SNIPPET_LENGTH } from '../constants';

export class VaultService {
  constructor(private app: App) {}

  async getContextFromVault(settings: IntrospectorSettings): Promise<string> {
    const contextParts: string[] = [];
    const files = this.app.vault.getMarkdownFiles();

    // Filter by configured folders
    const relevantFiles: TFile[] = [];

    for (const file of files) {
      // Check if file is in a context folder
      const inContextFolder = settings.contextFolders.some(folder =>
        file.path.startsWith(normalizePath(folder) + '/')
      );

      if (inContextFolder) {
        relevantFiles.push(file);
      }
    }

    // Sort by modification time, take most recent files
    relevantFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const recentFiles = relevantFiles.slice(0, CONTEXT_FILE_LIMIT);

    // Read content from recent files
    for (const file of recentFiles) {
      const content = await this.app.vault.read(file);
      const snippet = content.slice(0, CONTEXT_SNIPPET_LENGTH);
      contextParts.push(`From "${file.basename}":\n${snippet}${content.length > CONTEXT_SNIPPET_LENGTH ? '...' : ''}`);
    }

    return contextParts.join('\n\n---\n\n');
  }

  async createIntrospectionNote(summary: IntrospectionSummary, settings: IntrospectorSettings): Promise<TFile> {
    // Ensure folder exists
    const folderPath = normalizePath(settings.saveFolder);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);

    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }

    // Create filename with date
    const filename = `${summary.date}-introspection.md`;
    const filePath = normalizePath(`${folderPath}/${filename}`);

    // Check if file exists and add suffix if needed
    let finalPath = filePath;
    let counter = 1;
    while (this.app.vault.getAbstractFileByPath(finalPath)) {
      finalPath = normalizePath(`${folderPath}/${summary.date}-introspection-${counter}.md`);
      counter++;
    }

    // Format the note content
    const content = this.formatNoteContent(summary);

    // Create the file
    const file = await this.app.vault.create(finalPath, content);
    return file;
  }

  private formatNoteContent(summary: IntrospectionSummary): string {
    const insightsSection = summary.insights
      .map(insight => `- ${insight}`)
      .join('\n');

    const linksSection = summary.suggestedLinks
      .map(link => `- ${link}`)
      .join('\n');

    const conversationSection = summary.conversation
      .map(msg => {
        const speaker = msg.role === 'user' ? '**You**' : '**Introspector**';
        return `${speaker}: ${msg.content}`;
      })
      .join('\n\n');

    return `# Introspection - ${summary.date}

## Opening

${summary.haiku}

## Insights

${insightsSection}

## Related Notes

${linksSection}

---

<details>
<summary>Full Conversation</summary>

${conversationSection}

</details>
`;
  }

  async findRelatedNotes(links: string[]): Promise<string[]> {
    const existingLinks: string[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const link of links) {
      // Extract note name from [[Note Name]] format
      const match = link.match(/\[\[(.+?)\]\]/);
      if (match && match[1]) {
        const noteName = match[1];
        const exists = files.some(f =>
          f.basename.toLowerCase() === noteName.toLowerCase()
        );
        if (exists) {
          existingLinks.push(link);
        }
      }
    }

    return existingLinks;
  }
}
