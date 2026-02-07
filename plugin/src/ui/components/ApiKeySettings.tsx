import React, { useState, useEffect } from "react";
import { getApiKey, setApiKey, clearApiKey } from "../lib/api-key-store";
import { Key, Trash2, Check, AlertCircle, Eraser } from "lucide-react";

export function ApiKeySettings() {
  const [key, setKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [clearing, setClearing] = useState(false);
  const [clearStatus, setClearStatus] = useState<{ type: "idle" | "success" | "error"; message?: string }>({ type: "idle" });

  useEffect(() => {
    getApiKey().then((k) => {
      setSavedKey(k);
      setLoading(false);
    });

    // Listen for clear response
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      if (msg.type === "canvas-documentation-cleared") {
        setClearing(false);
        setClearStatus({
          type: "success",
          message: msg.removedCount > 0
            ? `Removed ${msg.removedCount} item${msg.removedCount !== 1 ? "s" : ""} from canvas`
            : "No Edgy elements found on canvas",
        });
        setTimeout(() => setClearStatus({ type: "idle" }), 3000);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function handleSave() {
    const trimmed = key.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await setApiKey(trimmed);
      setSavedKey(trimmed);
      setKey("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await clearApiKey();
      setSavedKey(null);
      setStatus("idle");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  function maskKey(k: string): string {
    if (k.length <= 12) return "••••••••";
    return k.slice(0, 7) + "••••" + k.slice(-4);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-7">
      <p className="text-sm text-muted-foreground">
        Configure AI-powered review to reduce false positives and improve finding descriptions.
      </p>

      <div className="rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Anthropic API Key</span>
        </div>

        {savedKey ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-secondary px-2 py-1 rounded overflow-hidden text-ellipsis">
                {maskKey(savedKey)}
              </code>
              <button
                onClick={handleRemove}
                disabled={saving}
                className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 transition-colors"
                style={{ borderRadius: 4 }}
              >
                <Trash2 className="w-3 h-3" />
                Remove
              </button>
            </div>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <Check className="w-3 h-3" />
              AI review is enabled
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={!key.trim() || saving}
              className="w-full py-2 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save API Key"}
            </button>
          </div>
        )}

        {status === "saved" && (
          <p className="text-xs text-green-600">Key saved successfully.</p>
        )}
        {status === "error" && (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="w-3 h-3" />
            Failed to save key. Please try again.
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          Your API key is stored locally in Figma and never sent anywhere except
          directly to the Anthropic API.
        </p>
        <p>
          Without a key, Edgy uses heuristic analysis only. With a key, findings
          are reviewed by Claude to remove false positives and improve descriptions.
        </p>
      </div>

      {/* Clear Canvas Documentation */}
      <div className="rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Eraser className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Canvas Cleanup</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Remove all Edgy health indicators and reports from the current page.
        </p>

        <button
          onClick={() => {
            setClearing(true);
            setClearStatus({ type: "idle" });
            parent.postMessage({ pluginMessage: { type: "clear-canvas-documentation" } }, "*");
          }}
          disabled={clearing}
          className="w-full py-2 px-4 rounded-lg border text-sm font-medium hover:bg-secondary disabled:opacity-50 transition-colors"
          style={{ borderRadius: 4 }}
        >
          {clearing ? "Clearing..." : "Clear Canvas Documentation"}
        </button>

        {clearStatus.type === "success" && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <Check className="w-3 h-3" />
            {clearStatus.message}
          </div>
        )}
        {clearStatus.type === "error" && (
          <div className="flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="w-3 h-3" />
            Failed to clear canvas
          </div>
        )}
      </div>
    </div>
  );
}
