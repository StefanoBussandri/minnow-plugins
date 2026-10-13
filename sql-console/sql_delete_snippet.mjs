import { deleteSnippet } from './db.mjs';

export default async function handler(args, ctx) {
  return deleteSnippet(ctx, args || {});
}
