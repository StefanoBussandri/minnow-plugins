import { describeTable } from './db.mjs';

export default async function handler(args, ctx) {
  return describeTable(ctx, args || {});
}
