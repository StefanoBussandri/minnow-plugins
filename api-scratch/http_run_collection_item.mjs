import { runCollectionItem } from './http.mjs';

export default async function handler(args, ctx) {
  return runCollectionItem(ctx, args || {});
}
