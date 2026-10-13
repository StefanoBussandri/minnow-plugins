import { runQuery } from './db.mjs';

export default async function handler(args, ctx) {
  return runQuery(ctx, args || {});
}
