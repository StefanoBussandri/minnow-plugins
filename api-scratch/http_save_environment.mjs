import { saveEnvironment } from './http.mjs';

export default async function handler(args, ctx) {
  return saveEnvironment(ctx, args || {});
}
