import { getCollection } from './http.mjs';

export default async function handler(args, ctx) {
  return getCollection(ctx, args || {});
}
