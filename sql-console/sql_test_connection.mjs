import { testConnection } from './db.mjs';

export default async function handler(_args, ctx) {
  return testConnection(ctx);
}
