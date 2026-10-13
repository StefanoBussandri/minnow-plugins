import { listEnvironments } from './http.mjs';

export default async function handler(_args, ctx) {
  return listEnvironments(ctx);
}
