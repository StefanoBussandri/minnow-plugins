import { buildAndSend } from './http.mjs';

export default async function handler(args, ctx) {
  return buildAndSend(ctx, args || {});
}
