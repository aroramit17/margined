# @inferlytic/sdk — private beta

Node 20+, ESM. No prompts or response bodies are transmitted. Install from this repository after `npm run sdk:build`; this package has not been published to npm.

```ts
import OpenAI from 'openai';
import { Inferlytic } from '@inferlytic/sdk';
const telemetry = new Inferlytic({
  apiKey: process.env.INFERLYTIC_KEY!,
  endpoint: 'https://your-inferlytic-host/api/v1/events',
  onError: error => console.error(error.message),
});
const client = telemetry.wrapOpenAI(new OpenAI());
await telemetry.withCustomer({customerId: 'cus_123', feature:'Deep research'}, async () => {
  await client.chat.completions.create({model:'gpt-4.1-mini', messages:[{role:'user',content:'Hello'}], stream:false});
});
await telemetry.flush(); // Required before a serverless invocation returns.
```

- `wrapOpenAI` supports Chat Completions and Responses, `wrapAnthropic` supports Messages.
- Explicit wrappers are required; initialization does not globally monkey-patch provider SDKs.
- Context is isolated with AsyncLocalStorage. Nest `withFeature(name, callback)` inside `withCustomer`.
- Wrapped create methods return ordinary Promises; provider-specific `.withResponse()` / `.asResponse()` helpers are not supported. Provider request options are passed through.
- Streaming rejects before making the provider request. For streaming applications, use the original client and call `track()` with final provider usage.
- Only standard global text token rates are supported. Tool fees, audio, images, batch discounts, priority tiers, regional multipliers and negotiated rates are not included. Avoid attributing these request types as standard text usage.
- Automatic flush every 5 seconds, in batches of 100. A failed batch retains event IDs and is retried on the next flush. No disk durability: call `close()` on shutdown. Attach `onError` for queue overflow and rejected batches; a permanently invalid event must be corrected by the caller, not retried forever.
- A successful generation is returned even when recording usage fails. Missing customer context throws before generation.
- `track({provider,model,inputTokens,outputTokens,customerId,...})` supports explicit recording, optional UUID `id` for deduplication, and optional ISO `timestamp`.
