// Uvozi se prvi u server/vercel.ts: uključuje serverless režim prije nego što se učita config.ts.
process.env.SERVERLESS ??= '1';
