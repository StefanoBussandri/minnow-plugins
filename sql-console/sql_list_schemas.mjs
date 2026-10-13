import { listSchemas } from './db.mjs';

export default async function handler(_args, ctx) {
  return listSchemas(ctx);
}
