import { saveCollection } from './http.mjs';

export default async function handler(args, ctx) {
  return saveCollection(ctx, args || {});
}
