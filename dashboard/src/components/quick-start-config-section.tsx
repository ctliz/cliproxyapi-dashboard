"use client";

import { useTranslations } from "next-intl";
import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ModelSelector } from "@/components/model-selector";
import { CopyBlock } from "@/components/copy-block";

interface QuickStartConfigSectionProps {
  apiKeys: { key: string; name: string | null }[];
  availableModels: string[];
  modelSourceMap: Map<string, string>;
  modelProvidersMap?: Map<string, string[]>;
  initialExcludedModels: string[];
  isSubscribed?: boolean;
  proxyUrl: string;
}

type TabType = "curl" | "python" | "node" | "claude";

export function QuickStartConfigSection({
  apiKeys,
  availableModels,
  modelSourceMap,
  modelProvidersMap,
  initialExcludedModels,
  isSubscribed = false,
  proxyUrl,
}: QuickStartConfigSectionProps) {
  const t = useTranslations("quickStartConfig");
  const [excludedModels, setExcludedModels] = useState<string[]>(initialExcludedModels);
  const [activeTab, setActiveTab] = useState<TabType>("curl");
  const [selectedApiKey, setSelectedApiKey] = useState<string>(
    apiKeys[0]?.key ?? "your-api-key"
  );

  // Filter out globally excluded models
  const activeModels = useMemo(() => {
    const excludedSet = new Set(excludedModels);
    return availableModels.filter((m) => !excludedSet.has(m));
  }, [availableModels, excludedModels]);

  const exampleModel = useMemo(() => {
    if (activeModels.length === 0) return "gpt-5.6-luna";
    const preferred = [
      "gpt-5.6-luna",
      "gemini-3.7-flash-high",
      "claude-3-7-sonnet",
      "gpt-4o",
      "gemini-2.5-flash",
    ];
    for (const p of preferred) {
      if (activeModels.includes(p)) return p;
    }
    return activeModels[0];
  }, [activeModels]);

  const claudeDefaultModel = useMemo(() => {
    if (activeModels.includes("gemini-2.5-flash")) return "gemini-2.5-flash";
    if (activeModels.includes("claude-3-7-sonnet")) return "claude-3-7-sonnet";
    return exampleModel;
  }, [activeModels, exampleModel]);

  const normalizedProxyUrl = useMemo(() => {
    return proxyUrl.replace(/\/+$/, "");
  }, [proxyUrl]);

  const curlCode = useMemo(() => {
    return `curl ${normalizedProxyUrl}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${selectedApiKey}" \\
  -d '{
    "model": "${exampleModel}",
    "messages": [
      {
        "role": "user",
        "content": "Hello CLIProxyAPI!"
      }
    ]
  }'`;
  }, [normalizedProxyUrl, selectedApiKey, exampleModel]);

  const pythonCode = useMemo(() => {
    return `from openai import OpenAI

client = OpenAI(
    base_url="${normalizedProxyUrl}/v1",
    api_key="${selectedApiKey}",
)

response = client.chat.completions.create(
    model="${exampleModel}",
    messages=[
        {"role": "user", "content": "Hello CLIProxyAPI!"}
    ],
)

print(response.choices[0].message.content)`;
  }, [normalizedProxyUrl, selectedApiKey, exampleModel]);

  const nodeCode = useMemo(() => {
    return `import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "${normalizedProxyUrl}/v1",
  apiKey: "${selectedApiKey}",
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: "${exampleModel}",
    messages: [
      { role: "user", content: "Hello CLIProxyAPI!" }
    ],
  });

  console.log(completion.choices[0].message.content);
}

main();`;
  }, [normalizedProxyUrl, selectedApiKey, exampleModel]);

  const claudeCode = useMemo(() => {
    return `export ANTHROPIC_BASE_URL="${normalizedProxyUrl}"
export ANTHROPIC_AUTH_TOKEN="${selectedApiKey}"
export ANTHROPIC_DEFAULT_SONNET_MODEL="${claudeDefaultModel}"
claude`;
  }, [normalizedProxyUrl, selectedApiKey, claudeDefaultModel]);

  return (
    <div className="space-y-4">
      {availableModels.length > 0 && (
        <section id="model-selection" className="scroll-mt-24">
          <ModelSelector
            availableModels={availableModels}
            modelSourceMap={modelSourceMap}
            modelProvidersMap={modelProvidersMap}
            initialExcludedModels={initialExcludedModels}
            onSelectionChange={setExcludedModels}
            isLocked={isSubscribed}
          />
        </section>
      )}

      <section id="client-integration" className="scroll-mt-24">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)] text-sm text-[var(--text-secondary)]"
                    aria-hidden="true"
                  >
                    &#9654;
                  </span>
                  {t("clientIntegrationTitle")}
                </span>
              </CardTitle>

              {apiKeys.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <label
                    htmlFor="preview-api-key-select"
                    className="text-[var(--text-muted)] shrink-0"
                  >
                    {t("selectActiveKeyLabel")}
                  </label>
                  <select
                    id="preview-api-key-select"
                    value={selectedApiKey}
                    onChange={(e) => setSelectedApiKey(e.target.value)}
                    className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {apiKeys.map((k) => (
                      <option key={k.key} value={k.key}>
                        {k.name
                          ? `${k.name} (${k.key.slice(0, 10)}...)`
                          : `${k.key.slice(0, 12)}...`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {t("clientIntegrationDesc")}
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Endpoints & Auth Bar */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t("endpointOpenAILabel")}
                </span>
                <p className="mt-0.5 font-mono text-xs text-blue-600 break-all">
                  {normalizedProxyUrl}/v1
                </p>
              </div>
              <div className="rounded-md border border-[var(--surface-border)] bg-[var(--surface-muted)]/50 p-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  {t("endpointAnthropicLabel")}
                </span>
                <p className="mt-0.5 font-mono text-xs text-amber-700 break-all">
                  {normalizedProxyUrl}
                </p>
              </div>
            </div>

            {/* Language & Tool Tabs */}
            <div className="flex border-b border-[var(--surface-border)]">
              <button
                type="button"
                onClick={() => setActiveTab("curl")}
                className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "curl"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("tabCurl")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("python")}
                className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "python"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("tabPython")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("node")}
                className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "node"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("tabNode")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("claude")}
                className={`border-b-2 px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === "claude"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("tabClaudeCode")}
              </button>
            </div>

            {/* Code Snippet Box */}
            <div>
              {activeTab === "curl" && <CopyBlock code={curlCode} />}
              {activeTab === "python" && <CopyBlock code={pythonCode} />}
              {activeTab === "node" && <CopyBlock code={nodeCode} />}
              {activeTab === "claude" && <CopyBlock code={claudeCode} />}
            </div>

            {/* Hints & Policy Links */}
            <div className="space-y-2 text-xs text-[var(--text-secondary)]">
              <p className="flex items-start gap-2">
                <span className="text-blue-600 shrink-0">•</span>
                <span>
                  {t("apiKeyNoticePrefix")}{" "}
                  <Link
                    href="/dashboard/api-keys"
                    className="font-medium text-blue-600 underline decoration-blue-400/30 underline-offset-2 hover:text-blue-800"
                  >
                    {t("apiKeyNoticeLink")}
                  </Link>{" "}
                  {t("apiKeyNoticeSuffix")}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-emerald-600 shrink-0">•</span>
                <span>
                  {t("tipModelPolicyPrefix")}{" "}
                  <Link
                    href="/dashboard/api-keys"
                    className="font-medium text-blue-600 underline decoration-blue-400/30 underline-offset-2 hover:text-blue-800"
                  >
                    {t("tipModelPolicyLink")}
                  </Link>
                  {t("tipModelPolicySuffix")}
                </span>
              </p>
              {excludedModels.length > 0 && (
                <p className="flex items-start gap-2">
                  <span className="text-amber-600 shrink-0">•</span>
                  <span>
                    {t("tipGlobalFilterPrefix")}{" "}
                    <code className="rounded bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-[11px] text-amber-700">
                      /v1/models
                    </code>{" "}
                    {t("tipGlobalFilterSuffix")} ({excludedModels.length} excluded)
                  </span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
