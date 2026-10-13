// J.A.R.V.I.S. Neural Graph-RAG & Associative Memory Engine
export interface GraphNode {
  id: string;
  label: string;
  type: 'concept' | 'project' | 'preference' | 'codebase' | 'telemetry';
  properties: Record<string, any>;
  lastUpdated: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: 'DEPENDS_ON' | 'RESOLVED_BY' | 'ASSOCIATED_WITH' | 'CREATED_BY' | 'TRIGGERS';
  weight: number;
}

export interface KnowledgeGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

class AssociativeKnowledgeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];

  constructor() {
    this.seedFoundationalKnowledge();
  }

  // Seed default Stark Industries / JARVIS foundational memory
  private seedFoundationalKnowledge() {
    const defaultNodes: GraphNode[] = [
      { id: 'arc-reactor', label: 'Palladium & Vibranium Arc Core', type: 'concept', properties: { powerOutput: '3 GJ/s', status: 'Optimal' }, lastUpdated: new Date().toISOString() },
      { id: 'aarsu-system', label: 'Aarsu Companion Engine', type: 'project', properties: { framework: 'React + Node.js + Gemini', version: '2.4.0' }, lastUpdated: new Date().toISOString() },
      { id: 'iron-legion', label: 'Autonomous Agent Swarm', type: 'project', properties: { agents: ['Sentinel', 'Architect', 'Tactician'] }, lastUpdated: new Date().toISOString() },
      { id: 'google-grounding', label: 'Google Search & Code Execution', type: 'concept', properties: { provider: 'Google Cloud Pro', latency: '<350ms' }, lastUpdated: new Date().toISOString() },
      { id: 'user-profile', label: 'Primary User Identity', type: 'preference', properties: { privilege: 'Stark Admin (Alpha Protocol)' }, lastUpdated: new Date().toISOString() }
    ];

    defaultNodes.forEach(node => this.nodes.set(node.id, node));

    this.edges = [
      { id: 'e1', source: 'aarsu-system', target: 'arc-reactor', relation: 'DEPENDS_ON', weight: 0.95 },
      { id: 'e2', source: 'aarsu-system', target: 'iron-legion', relation: 'TRIGGERS', weight: 0.90 },
      { id: 'e3', source: 'iron-legion', target: 'google-grounding', relation: 'ASSOCIATED_WITH', weight: 0.85 },
      { id: 'e4', source: 'user-profile', target: 'aarsu-system', relation: 'CREATED_BY', weight: 1.0 }
    ];
  }

  public addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  public addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }

  public queryAssociations(entityId: string, depth = 2): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const visitedNodes = new Set<string>();
    const matchedEdges: GraphEdge[] = [];
    const queue: Array<{ id: string; d: number }> = [{ id: entityId, d: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visitedNodes.has(current.id) || current.d > depth) continue;
      visitedNodes.add(current.id);

      // Find all adjacent edges
      const connectedEdges = this.edges.filter(e => e.source === current.id || e.target === current.id);
      for (const edge of connectedEdges) {
        if (!matchedEdges.find(me => me.id === edge.id)) {
          matchedEdges.push(edge);
        }
        const neighborId = edge.source === current.id ? edge.target : edge.source;
        if (!visitedNodes.has(neighborId) && current.d + 1 <= depth) {
          queue.push({ id: neighborId, d: current.d + 1 });
        }
      }
    }

    const matchedNodes = Array.from(visitedNodes)
      .map(id => this.nodes.get(id))
      .filter((n): n is GraphNode => Boolean(n));

    return { nodes: matchedNodes, edges: matchedEdges };
  }

  public getFullGraph(): KnowledgeGraphData {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges]
    };
  }
}

export const jarvisGraph = new AssociativeKnowledgeGraph();
