# Quickstart

From zero to your first cost event in about 3 minutes; the margin column takes one more step (Stripe).

## 1. Create a project

Sign in at [app.trymargined.com](https://app.trymargined.com) (or your self-hosted dashboard), create a project, and copy the API key (`mgd_...`).

```bash
export MARGINED_API_KEY=mgd_your_key
pip install margined
```

## 2. Track your first call

```python
import margined
margined.init()

import anthropic
client = anthropic.Anthropic()

response = margined.track(
    client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=10,
        messages=[{"role": "user", "content": "Hi"}],
    ),
    user_id="test_user",
    feature="test",
)
margined.flush()  # force-send in a short-lived script
```

The event shows up in the dashboard within seconds. Two tags do all the work:

- `user_id` — your internal customer ID (the same one you use everywhere else). This is what gets joined against Stripe later.
- `feature` — a name for the product surface making the call (`"summarize_document"`, `"chat"`, `"research_agent"`).

## 3. Instrument your app

Pick one of three modes (they compose):

**Explicit wrapper** — wrap each call you care about:

```python
response = margined.track(client.messages.create(...), user_id=uid, feature="chat")
```

**Auto-patch** — zero call-site changes; set ambient context per request:

```python
margined.patch_anthropic()
margined.patch_openai()
margined.set_context(user_id=lambda: g.current_user.id, feature=lambda: request.endpoint)
```

**Decorator** — tag a whole function as one feature:

```python
@margined.feature("research_agent")
def research(user, query):
    with margined.identify(user.id):
        ...
```

Streaming calls: wrap with `margined.track_stream(...)` (see the [SDK reference](sdk-reference.md)).

## 4. Connect Stripe (unlocks the margin column)

Settings → Stripe Customer Mappings. Map each SDK `user_id` to its Stripe customer ID (or use Stripe Connect OAuth). Margined pulls each customer's active subscriptions, normalizes them to monthly recurring revenue, and computes:

```
gross margin = (MRR − LLM cost, 30d) / MRR
```

Webhooks keep MRR fresh on subscription changes; a manual refresh endpoint exists too.

## 5. Set an alert

Settings → Alerts. The default worth having: email me when any customer's LLM cost exceeds 50% of their MRR this month. Slack webhooks are supported — paste the webhook URL, no OAuth.

## Try it with demo data

Don't want to touch your app yet?

```bash
python scripts/seed_demo.py --api-key mgd_your_key --endpoint https://api.trymargined.com/ingest
```

Seeds 45 days of realistic usage for 24 customers, including one Starter-plan customer who is dramatically margin-negative.
