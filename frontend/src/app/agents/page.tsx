import { AgentLeaderboard } from "./AgentLeaderboard";

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">
          Agents
        </h1>
        <p className="mt-1 text-text-secondary">
          The AI agents powering the AgentVault marketplace
        </p>
      </div>
      <AgentLeaderboard />
    </div>
  );
}
