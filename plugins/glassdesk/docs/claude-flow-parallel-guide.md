# Claude-Flow Parallel Execution Guide

Reference for the [`claude-flow`](https://www.npmjs.com/package/claude-flow) MCP server, used for multi-agent orchestration. Exact tool surface depends on the installed version — this guide reflects common patterns. Consult `claude-flow --help` or the package README for authoritative details.

## Quick Start

### Initialize Swarm
Use `swarm_init` to create a multi-agent topology:

- `hierarchical` — single coordinator with workers (default; anti-drift)
- `mesh` — peer-to-peer for independent parallel work
- `star` — hub-and-spoke centralized control
- `ring` — sequential pipeline processing
- `hybrid` — combined hierarchical-mesh for multi-domain tasks
- `adaptive` — dynamic topology auto-selected based on workload

```javascript
swarm_init({
  topology: "hierarchical",
  strategy: "balanced",
  maxAgents: 8
})
```

### Spawn Agents
Use `agent_spawn` to create individual agents:

```javascript
agent_spawn({
  type: "researcher",
  name: "research-1"
})
```

For batched fan-out, call `agent_spawn` repeatedly or use `task_orchestrate` with `strategy: "parallel"` to spawn workers around a shared task. claude-flow's marketing advertises ~10-20× speedups for large batch operations vs sequential MCP round-trips — measure for your workload.

### Orchestrate Tasks
```javascript
task_orchestrate({
  task: "Implement feature X",
  strategy: "parallel",  // or "sequential", "adaptive"
  priority: "high",
  maxAgents: 3
})
```

## Patterns for /plan Command

### Parallel Research
When `/plan:hard` needs multiple research threads:

1. Spawn `researcher` agents per aspect (`mesh` topology for independent work)
2. Run in parallel via `task_orchestrate({strategy: "parallel"})`
3. Aggregate results after all complete

### Multi-Phase Planning
For `/plan:parallel`:

1. Init swarm with `hierarchical` topology
2. Coordinator manages phase sequencing
3. Worker agents execute phases in parallel where dependencies allow

## Patterns for /code Command

### Parallel Implementation
For `/code:parallel` with multiple files:

1. Spawn `coder` agents per independent module
2. Use `star` topology with coordinator
3. Sequential merge step for conflict resolution

### Parallel Testing
For test phases:

1. Spawn `tester` agents per test suite
2. Use `parallel` strategy
3. Aggregate pass/fail results

## MCP Tools Reference

Common tool surface (subset of claude-flow's full API):

| Tool | Purpose | Key Params |
|------|---------|------------|
| `swarm_init` | Create topology | topology, strategy, maxAgents |
| `agent_spawn` | Spawn an agent | type, name, capabilities |
| `agent_list` | List active agents | swarmId |
| `agent_metrics` | Performance metrics | agentId |
| `task_orchestrate` | Run task | task, strategy, priority |
| `task_status` | Track task progress | taskId |
| `swarm_status` | Monitor swarm health | swarmId |
| `memory_usage` | Memory ops (store/recall) | namespace, key, value |
| `memory_search` | Semantic vector search | query, limit |

> claude-flow exposes 300+ tools across many modules; this table covers the orchestration core. Run `agent_list` or check the package docs for the full surface.

## Agent Types

claude-flow ships 100+ specialized agent types. Common core types:

| Type | Use Case |
|------|----------|
| `researcher` | Information gathering, analysis |
| `coder` | Code implementation |
| `tester` | Test execution, validation |
| `planner` | Task decomposition, strategy |
| `reviewer` | Code review, quality gates |
| `coordinator` | Task orchestration |

Domain-specific agents (`backend-dev`, `mobile-dev`, `ml-developer`, `pr-manager`, `security-architect`, etc.) are available — list runtime-available types via `agent_list` after initializing a swarm.

## Integration Notes

- Install: `npm i -g claude-flow@alpha`
- Compatible with Claude Code CLI as an MCP server
- Memory persistence via `memory_usage` and `memory_search`
- Versioning: claude-flow is evolving rapidly (recently rebranded to Ruflo in v3.5+); exact tool names may shift between releases — pin a version for reproducibility

## See Also

- [claude-flow on npm](https://www.npmjs.com/package/claude-flow)
- [claude-flow on GitHub](https://github.com/ruvnet/claude-flow)
