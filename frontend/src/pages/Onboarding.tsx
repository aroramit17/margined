import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ArrowRight, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4 | 5;

export default function Onboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [projectName, setProjectName] = useState("");
  const [project, setProject] = useState<{ id: string; api_key: string; name: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [eventReceived, setEventReceived] = useState(false);
  const [polling, setPolling] = useState(false);
  const [alertEmail, setAlertEmail] = useState("");
  const [alertThreshold, setAlertThreshold] = useState(50);

  async function createProject() {
    if (!projectName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const p = await api.projects.create(projectName.trim());
      setProject(p);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function pollForFirstEvent() {
    if (!project) return;
    setPolling(true);
    // Poll for 60 seconds
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const summary = await api.summary(project.id);
        if (summary.total_customers > 0) {
          setEventReceived(true);
          break;
        }
      } catch {
        // ignore
      }
    }
    setPolling(false);
  }

  async function saveAlert() {
    if (!project || !alertEmail) {
      setStep(5);
      return;
    }
    try {
      await api.alerts.create(project.id, {
        alert_type: "margin_threshold",
        threshold: alertThreshold,
        channel: "email",
        destination: alertEmail,
      });
    } catch {
      // non-fatal
    }
    setStep(5);
  }

  const steps = ["Name project", "Install SDK", "Test event", "Connect Stripe", "Set alert"];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Progress */}
      <div className="border-b">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          {steps.map((label, i) => {
            const n = (i + 1) as Step;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                    done && "bg-primary text-primary-foreground",
                    active && "border-2 border-primary text-primary",
                    !done && !active && "border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </div>
                <span
                  className={cn(
                    "text-xs hidden sm:block",
                    active ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                {i < steps.length - 1 && (
                  <div className="w-6 h-px bg-border mx-1" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">Name your project</h2>
                <p className="text-muted-foreground text-sm">
                  One project per codebase or product. You can create more later.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Project name</label>
                <input
                  autoFocus
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createProject()}
                  placeholder="My AI SaaS"
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <button
                onClick={createProject}
                disabled={!projectName.trim() || loading}
                className="flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && project && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">Install the SDK</h2>
                <p className="text-muted-foreground text-sm">
                  One pip install. One argument. That's it.
                </p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">1. Install</p>
                <CodeBlock code="pip install margined" onCopy={() => copyToClipboard("pip install margined")} />
              </div>

              <div>
                <p className="text-sm font-medium mb-2">2. Initialize and track</p>
                <CodeBlock
                  code={`import margined\nmargined.init(api_key="${project.api_key}")\n\n# Wrap your existing LLM call:\nresponse = margined.track(\n    client.messages.create(\n        model="claude-sonnet-4-6",\n        max_tokens=1024,\n        messages=[{"role": "user", "content": prompt}]\n    ),\n    user_id=current_user.id,\n    feature="your_feature_name",\n)`}
                  onCopy={() => copyToClipboard(`import margined\nmargined.init(api_key="${project.api_key}")`)}
                />
              </div>

              <div className="bg-muted rounded-lg px-4 py-3 text-sm">
                <p className="font-medium mb-1">Your API key</p>
                <div className="flex items-center gap-2 font-mono text-xs break-all">
                  <span className="flex-1">{project.api_key}</span>
                  <button
                    onClick={() => copyToClipboard(project.api_key)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-muted-foreground text-xs mt-1">
                  Store as <code>MARGINED_API_KEY</code> in your environment.
                </p>
              </div>

              <button
                onClick={() => {
                  setStep(3);
                  pollForFirstEvent();
                }}
                className="flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:opacity-90"
              >
                I've added it — continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">Send a test event</h2>
                <p className="text-muted-foreground text-sm">
                  Make one LLM call with the SDK. We'll detect it automatically.
                </p>
              </div>

              {eventReceived ? (
                <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <Check className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Event received!</p>
                    <p className="text-xs text-green-600">Your SDK is connected and tracking.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 bg-muted rounded-lg px-4 py-3">
                  {polling ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin shrink-0" />
                  ) : (
                    <div className="h-2.5 w-2.5 rounded-full bg-yellow-400 shrink-0" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    {polling ? "Waiting for first event…" : "No events yet — run your app and make an LLM call"}
                  </p>
                </div>
              )}

              <CodeBlock
                code={`# Quick test\nimport margined\nmargined.init(api_key="${project?.api_key}")\n\nimport anthropic\nclient = anthropic.Anthropic()\nresponse = margined.track(\n    client.messages.create(\n        model="claude-haiku-4-5-20251001",\n        max_tokens=10,\n        messages=[{"role": "user", "content": "Hi"}],\n    ),\n    user_id="test_user",\n    feature="test",\n)\nmargined.flush()\nprint("Done!")`}
                onCopy={() => {}}
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(4)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:opacity-90"
                >
                  {eventReceived ? "Continue" : "Skip for now"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4 */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">Connect Stripe</h2>
                <p className="text-muted-foreground text-sm">
                  Unlock the margin column — LLM cost vs. what each customer pays you.
                </p>
              </div>

              <div className="bg-muted rounded-lg px-4 py-3 text-sm space-y-2">
                <p className="font-medium">What you'll get:</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>✓ Gross margin per customer (MRR − LLM cost)</li>
                  <li>✓ Margin-at-risk alerts</li>
                  <li>✓ Pricing calculator powered by real usage data</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(5)}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:opacity-90"
                >
                  Connect Stripe
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setStep(5)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {/* Step 5 */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">Set your first alert</h2>
                <p className="text-muted-foreground text-sm">
                  Get notified when a customer's LLM cost exceeds a % of their subscription.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Alert email</label>
                  <input
                    type="email"
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">
                    Trigger when LLM cost exceeds <strong>{alertThreshold}%</strong> of MRR
                  </label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>10%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={saveAlert}
                  className="flex items-center gap-2 bg-primary text-primary-foreground rounded-md px-5 py-2 text-sm font-medium hover:opacity-90"
                >
                  {alertEmail ? "Save alert & open dashboard" : "Skip & open dashboard"}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Redirect after step 5 completes */}
          {step === 5 && !alertEmail && (
            <div className="mt-4">
              <button
                onClick={() => navigate(`/dashboard/${project?.id}`)}
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Go to dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ code, onCopy }: { code: string; onCopy: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    onCopy();
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative bg-zinc-950 rounded-lg overflow-hidden">
      <pre className="text-zinc-200 text-xs p-4 overflow-x-auto leading-relaxed">{code}</pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
