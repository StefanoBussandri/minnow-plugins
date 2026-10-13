import { listCollections } from './http.mjs';

export default async function handler(_args, ctx) {
  return listCollections(ctx);
}
