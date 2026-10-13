import { deleteCollection } from './http.mjs';

export default async function handler(args, ctx) {
  return deleteCollection(ctx, args || {});
}
