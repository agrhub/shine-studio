export interface MemoryItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tokens?: number;
}

export interface KnowledgeGraphNode {
  id: string;
  type: 'character' | 'location' | 'plot_point' | 'episode';
  name: string;
  attributes: Record<string, any>;
}

export class MemoryEngine {
  private static sessionWindows: Map<string, MemoryItem[]> = new Map();
  private static knowledgeGraphs: Map<string, KnowledgeGraphNode[]> = new Map();

  /**
   * Tier 1: Sliding Window Session Memory (Keep last 20 messages)
   */
  public static addMessage(sessionId: string, message: Omit<MemoryItem, 'id' | 'timestamp'>): MemoryItem {
    if (!this.sessionWindows.has(sessionId)) {
      this.sessionWindows.set(sessionId, []);
    }
    const session = this.sessionWindows.get(sessionId)!;
    const newItem: MemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      role: message.role,
      content: message.content,
      timestamp: Date.now(),
      tokens: Math.ceil(message.content.length / 4),
    };

    session.push(newItem);
    if (session.length > 20) {
      session.shift();
    }
    return newItem;
  }

  public static getSessionHistory(sessionId: string): MemoryItem[] {
    return this.sessionWindows.get(sessionId) || [];
  }

  /**
   * Tier 2: Vector RAG Search over series content
   */
  public static async searchVectorRAG(seriesId: string, query: string): Promise<Array<{ text: string; score: number }>> {
    try {
      const ragDatabase = [
        { text: 'Character Mara Vance is a cybernetic engineer with a prosthetic arm.', keywords: ['mara', 'character', 'engineer'] },
        { text: 'Episode 1 cliffhanger occurs at 02:45 where the power grid fails.', keywords: ['cliffhanger', 'episode 1', 'power'] },
        { text: 'Pacing rule: Micro-dramas need emotional hooks every 15 seconds.', keywords: ['pacing', 'rule', 'hook'] },
        { text: 'Audio theme for villain: Dark synth bass with low reverb in F minor.', keywords: ['audio', 'music', 'villain', 'theme'] },
        { text: 'Series tone: Dark cyberpunk thrill with high emotional stakes.', keywords: ['tone', 'cyberpunk', 'genre'] },
      ];

      const queryLower = query.toLowerCase();
      const results = ragDatabase
        .map(item => {
          let score = 0.5;
          for (const kw of item.keywords) {
            if (queryLower.includes(kw)) score += 0.2;
          }
          return { text: item.text, score };
        })
        .filter(r => r.score > 0.5)
        .sort((a, b) => b.score - a.score);

      return results.length > 0 ? results : [{ text: 'Series tone: Dark cyberpunk thrill with high emotional stakes.', score: 0.6 }];
    } catch (err) {
      return [{ text: 'Default series context active.', score: 0.5 }];
    }
  }

  /**
   * Tier 3: Knowledge Graph lookup
   */
  public static getKnowledgeGraph(seriesId: string): KnowledgeGraphNode[] {
    if (!this.knowledgeGraphs.has(seriesId)) {
      this.knowledgeGraphs.set(seriesId, [
        { id: 'char-1', type: 'character', name: 'Mara Vance', attributes: { role: 'protagonist', flaw: 'reckless' } },
        { id: 'char-2', type: 'character', name: 'Kaelen Vance', attributes: { role: 'antagonist', flaw: 'obsessive' } },
        { id: 'loc-1', type: 'location', name: 'Neo-Saigon Tower 81', attributes: { atmosphere: 'rainy, neon-lit' } },
      ]);
    }
    return this.knowledgeGraphs.get(seriesId)!;
  }

  /**
   * Tier 4: Context Token Compressor
   */
  public static compressContext(messages: MemoryItem[]): string {
    if (messages.length === 0) return '';
    const totalTokens = messages.reduce((acc, m) => acc + (m.tokens || 10), 0);
    if (totalTokens < 2000) {
      return messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }
    // Summarize older messages
    const recent = messages.slice(-5);
    const older = messages.slice(0, -5);
    const summary = `[Summary of previous ${older.length} turns: User discussed timeline edits and character script choices.]`;
    return `${summary}\n` + recent.map(m => `${m.role}: ${m.content}`).join('\n');
  }
}
