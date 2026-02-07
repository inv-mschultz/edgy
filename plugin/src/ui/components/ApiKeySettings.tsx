import React, { useState, useEffect } from "react";
import { getApiKey, setApiKey, clearApiKey } from "../lib/api-key-store";
import { Key, Trash2, Check, AlertCircle } from "lucide-react";

export function ApiKeySettings({ onBack }: { onBack: () => void }) {
  const [key, setKey] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    getApiKey().then((k) => {
      setSavedKey(k);
      setLoading(false);
    });
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
    <div className="flex flex-col gap-4 p-4">
      <div>
        <button
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure AI-powered review to reduce false positives and improve finding descriptions.
        </p>
      </div>

      <div className="rounded-lg border p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Anthropic API Key</span>
        </div>

        {savedKey ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <code className="text-xs bg-secondary px-2 py-1 rounded">
                {maskKey(savedKey)}
              </code>
              <button
                onClick={handleRemove}
                disabled={saving}
                className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 disabled:opacity-50"
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
    </div>
  );
}
