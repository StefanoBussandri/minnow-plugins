import { listSnippets } from './db.mjs';

export default async function handler(_args, ctx) {
  return listSnippets(ctx);
}
