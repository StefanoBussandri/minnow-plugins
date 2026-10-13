import { saveSnippet } from './db.mjs';

export default async function handler(args, ctx) {
  return saveSnippet(ctx, args || {});
}
