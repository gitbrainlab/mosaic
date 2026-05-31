import { run as runRouter } from '@netlify/async-workloads/_internal/router.js';
import type { Context } from '@netlify/functions';
import { asyncWorkloadConfig } from './hunt-workload';

const huntWorkloadMapping = {
  config: asyncWorkloadConfig,
  workloadMapping: {
    fnPath: 'netlify/functions/hunt-workload.ts',
    fnName: 'hunt-workload',
    urlPath: '/.netlify/functions/hunt-workload',
  },
};

export default async function handler(request: Request, context: Context) {
  return runRouter(request, context, [huntWorkloadMapping]);
}
