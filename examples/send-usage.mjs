// Send a synthetic usage event to YOUR configured local/test workspace.
// Never use this sample to create fictitious usage in a production workspace.
import { Inferlytic } from '../packages/sdk/dist/index.js';
if (!process.env.INFERLYTIC_KEY || !process.env.STRIPE_CUSTOMER_ID) {
  throw new Error('Set INFERLYTIC_KEY and STRIPE_CUSTOMER_ID for your test workspace.');
}
const telemetry = new Inferlytic({
  apiKey: process.env.INFERLYTIC_KEY,
  endpoint: process.env.INFERLYTIC_ENDPOINT ?? 'http://127.0.0.1:3000/api/v1/events',
  flushIntervalMs: 0,
});
telemetry.track({
  customerId: process.env.STRIPE_CUSTOMER_ID,
  feature: 'deep-research',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  inputTokens: 10000,
  outputTokens: 2000,
});
await telemetry.close();
console.log('Test usage accepted. Expected estimated cost: $0.0072. Open the live dashboard.');
