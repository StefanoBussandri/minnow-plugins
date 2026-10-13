import { listTables } from './db.mjs';

export default async function handler(args, ctx) {
  return listTables(ctx, args || {});
}
