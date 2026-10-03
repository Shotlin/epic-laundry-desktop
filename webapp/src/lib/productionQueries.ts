import type { QueryClient } from '@tanstack/react-query'

/** Keep every production read model current after a floor-state or assignment command. */
export function invalidateProductionViews(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['production-queue'] }),
    client.invalidateQueries({ queryKey: ['production-load'] }),
    client.invalidateQueries({ queryKey: ['production-workload'] }),
    client.invalidateQueries({ queryKey: ['production-schedule'] }),
    client.invalidateQueries({ queryKey: ['production-supervisor-metrics'] }),
  ])
}
