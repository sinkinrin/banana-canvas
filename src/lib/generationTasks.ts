const tasks = new Map<string, AbortController>();

export function registerGenerationTask(nodeId: string, controller: AbortController) {
  tasks.set(nodeId, controller);
  return () => { if (tasks.get(nodeId) === controller) tasks.delete(nodeId); };
}

export function cancelGenerationTask(nodeId: string) {
  tasks.get(nodeId)?.abort();
}
