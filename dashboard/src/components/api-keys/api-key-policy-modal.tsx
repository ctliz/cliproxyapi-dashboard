"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Modal, ModalHeader, ModalTitle, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useTranslations } from "next-intl";
import { API_ENDPOINTS } from "@/lib/api-endpoints";

export interface ApiKeyItem {
  id: string;
  name: string;
  keyPreview: string;
  createdAt: string;
  lastUsedAt: string | null;
  policyEnabled: boolean;
  allowedModels: string[];
  fallbackProvider: string | null;
  fallbackModel: string | null;
}

export interface ProviderOption {
  id: string;
  name: string;
  models: string[];
}

interface ApiKeyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: ApiKeyItem | null;
  onSaved: (updated: {
    id: string;
    policyEnabled: boolean;
    allowedModels: string[];
    fallbackProvider: string | null;
    fallbackModel: string | null;
  }) => void;
  availableModels: string[];
  providers: ProviderOption[];
  onRefreshModels?: () => Promise<void>;
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  );
}

export function ApiKeyPolicyModal({
  isOpen,
  onClose,
  apiKey,
  onSaved,
  availableModels: initialAvailableModels,
  providers: initialProviders,
  onRefreshModels,
}: ApiKeyPolicyModalProps) {
  const t = useTranslations("apiKeys");
  const tc = useTranslations("common");
  const { showToast } = useToast();

  const [policyEnabled, setPolicyEnabled] = useState(false);
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [fallbackProvider, setFallbackProvider] = useState("");
  const [fallbackModel, setFallbackModel] = useState("");
  const [customPattern, setCustomPattern] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Live state for models & providers
  const [liveModels, setLiveModels] = useState<string[]>(initialAvailableModels);
  const [liveProviders, setLiveProviders] = useState<ProviderOption[]>(initialProviders);
  const [modelSearch, setModelSearch] = useState("");
  const [selectedProviderFilter, setSelectedProviderFilter] = useState<string>("all");

  const loadLiveModels = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(API_ENDPOINTS.PROXY.MODELS, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          setLiveModels(data.models);
        }
        if (Array.isArray(data.providers) && data.providers.length > 0) {
          setLiveProviders(data.providers);
        }
      }
    } catch {
      // Fallback to initial
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Sync internal state and trigger live refresh when opened
  useEffect(() => {
    if (apiKey && isOpen) {
      setPolicyEnabled(Boolean(apiKey.policyEnabled));
      setAllowedModels(Array.isArray(apiKey.allowedModels) ? [...apiKey.allowedModels] : []);
      setFallbackProvider(apiKey.fallbackProvider || "");
      setFallbackModel(apiKey.fallbackModel || "");
      setCustomPattern("");
      setModelSearch("");
      setSelectedProviderFilter("all");
      void loadLiveModels();
    }
  }, [apiKey, isOpen, loadLiveModels]);

  useEffect(() => {
    if (initialAvailableModels.length > 0) setLiveModels(initialAvailableModels);
    if (initialProviders.length > 0) setLiveProviders(initialProviders);
  }, [initialAvailableModels, initialProviders]);

  const handleAddPattern = (patternToAdd?: string) => {
    const raw = (patternToAdd !== undefined ? patternToAdd : customPattern).trim();
    if (!raw) return;

    if (allowedModels.some((m) => m.toLowerCase() === raw.toLowerCase())) {
      showToast(t("policyPatternExists"), "error");
      return;
    }

    setAllowedModels((prev) => [...prev, raw]);
    if (patternToAdd === undefined) {
      setCustomPattern("");
    }
  };

  const handleRemoveModel = (modelToRemove: string) => {
    setAllowedModels((prev) => prev.filter((m) => m !== modelToRemove));
  };

  const handleAllowAll = () => {
    if (!allowedModels.includes("*")) {
      setAllowedModels((prev) => ["*", ...prev.filter((m) => m !== "*")]);
    }
  };

  const handleClearAll = () => {
    setAllowedModels([]);
  };

  const handleAddProviderModels = (providerModels: string[]) => {
    if (!providerModels || providerModels.length === 0) return;
    setAllowedModels((prev) => {
      const existing = new Set(prev.map((m) => m.toLowerCase()));
      const toAdd = providerModels.filter((m) => !existing.has(m.toLowerCase()));
      return [...prev, ...toAdd];
    });
  };

  // Filter available models for selection dropdown
  const filteredModels = useMemo(() => {
    const term = modelSearch.trim().toLowerCase();
    let list = liveModels.filter(
      (m) => !allowedModels.some((am) => am.toLowerCase() === m.toLowerCase())
    );

    if (selectedProviderFilter !== "all") {
      const prov = liveProviders.find((p) => p.id === selectedProviderFilter);
      if (prov) {
        const provSet = new Set(prov.models.map((m) => m.toLowerCase()));
        list = list.filter((m) => provSet.has(m.toLowerCase()));
      }
    }

    if (term) {
      list = list.filter((m) => m.toLowerCase().includes(term));
    }
    return list;
  }, [liveModels, allowedModels, modelSearch, selectedProviderFilter, liveProviders]);

  // Models available under currently selected fallback provider
  const fallbackModelOptions = useMemo(() => {
    if (!fallbackProvider) return liveModels;
    const found = liveProviders.find(
      (p) => p.id.toLowerCase() === fallbackProvider.toLowerCase()
    );
    if (found && found.models.length > 0) {
      return found.models;
    }
    return liveModels;
  }, [fallbackProvider, liveProviders, liveModels]);

  const handleSave = async () => {
    if (!apiKey) return;
    setSaving(true);

    try {
      const endpoint = API_ENDPOINTS.USER.API_KEY_POLICY(apiKey.id);
      const res = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyEnabled,
          allowedModels,
          fallbackProvider: fallbackProvider.trim() || null,
          fallbackModel: fallbackModel.trim() || null,
        }),
      });

      if (!res.ok) {
        showToast(t("toastPolicyUpdateFailed"), "error");
        setSaving(false);
        return;
      }

      showToast(t("toastPolicyUpdateSuccess"), "success");
      onSaved({
        id: apiKey.id,
        policyEnabled,
        allowedModels,
        fallbackProvider: fallbackProvider.trim() || null,
        fallbackModel: fallbackModel.trim() || null,
      });
      setSaving(false);
      onClose();
    } catch {
      showToast(t("toastNetworkError"), "error");
      setSaving(false);
    }
  };

  if (!apiKey) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <ModalHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-primary)] border border-[var(--surface-border)]">
              <ShieldIcon className="size-4 text-emerald-500" />
            </div>
            <div>
              <ModalTitle>{t("policyModalTitle")}</ModalTitle>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {t("policyModalSubtitle", { name: apiKey.name })}
                <span className="ml-2 font-mono text-[11px] bg-[var(--surface-muted)] px-1.5 py-0.5 rounded border border-[var(--surface-border)]">
                  {apiKey.keyPreview}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await loadLiveModels();
              if (onRefreshModels) await onRefreshModels();
              showToast("Models refreshed from proxy", "info");
            }}
            disabled={refreshing}
            className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] border border-[var(--surface-border)] px-2.5 py-1 rounded-md transition-colors mr-6"
            title={t("policyRefreshModelsButton")}
          >
            <RefreshIcon className={`size-3 ${refreshing ? "animate-spin text-emerald-500" : ""}`} />
            <span>{refreshing ? t("policyRefreshingModels") : t("policyRefreshModelsButton")}</span>
          </button>
        </div>
      </ModalHeader>

      <ModalContent>
        <div className="space-y-5">
          {/* Policy Toggle Card */}
          <div className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]/60 p-3.5">
            <div className="space-y-0.5 pr-4">
              <label
                htmlFor="policy-enable-toggle"
                className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
              >
                {t("policyEnableLabel")}
              </label>
              <p className="text-xs text-[var(--text-muted)]">
                {t("policyEnableDescription")}
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                id="policy-enable-toggle"
                type="checkbox"
                checked={policyEnabled}
                onChange={(e) => setPolicyEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-neutral-300 dark:bg-neutral-700 after:absolute after:top-[2px] after:start-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
            </label>
          </div>

          {!policyEnabled ? (
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 text-xs text-[var(--text-muted)] flex items-center gap-2">
              <svg className="size-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>{t("policyDisabledNotice")}</span>
            </div>
          ) : (
            <div className="space-y-5 animate-fadeIn">
              {/* Allowed Models Section */}
              <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {t("policyAllowedModelsTitle")}
                    </span>
                    <HelpTooltip content={t("policyAllowedModelsTooltip")} />
                    <span className="inline-flex items-center text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-1.5 py-0.5 rounded border border-emerald-500/20">
                      {t("policyLiveModelsCount", { count: liveModels.length })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAllowAll}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-500 transition-colors px-2 py-0.5 rounded hover:bg-emerald-500/10 border border-emerald-500/20"
                    >
                      {t("policyAllowAllButton")}
                    </button>
                    {allowedModels.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAll}
                        className="text-xs text-[var(--text-muted)] hover:text-rose-500 transition-colors px-2 py-0.5 rounded hover:bg-rose-500/10"
                      >
                        {t("policyClearAllButton")}
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Provider Presets (populated with live models) */}
                {liveProviders.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-[var(--text-muted)] mr-1">
                      Quick Add:
                    </span>
                    {liveProviders
                      .filter((p) => p.models && p.models.length > 0)
                      .slice(0, 8)
                      .map((provider) => (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => handleAddProviderModels(provider.models)}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full border border-[var(--surface-border)] bg-[var(--surface-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
                          title={`Add ${provider.models.length} ${provider.name} models`}
                        >
                          {t("policyAddPreset", { provider: provider.name })}
                          <span className="ml-1 text-[9px] opacity-70 font-mono">({provider.models.length})</span>
                        </button>
                      ))}
                  </div>
                )}

                {/* Selected Tag Badges */}
                <div className="min-h-16 rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)]/30 p-2.5">
                  {allowedModels.length === 0 ? (
                    <div className="flex items-center justify-center h-12 text-xs text-amber-500/90 font-medium">
                      {t("policyNoAllowedModelsWarning")}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {allowedModels.map((item) => {
                        const isWildcard = item.includes("*");
                        return (
                          <span
                            key={item}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
                              isWildcard
                                ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-500/30"
                                : "bg-[var(--surface-base)] text-[var(--text-primary)] border border-[var(--surface-border)]"
                            }`}
                          >
                            <span>{item}</span>
                            {isWildcard && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-700 dark:text-purple-300 uppercase tracking-tight font-sans">
                                {t("policyWildcardBadge")}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveModel(item)}
                              className="ml-0.5 text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                              aria-label={`Remove ${item}`}
                            >
                              &times;
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Model Input & Search Dropdown */}
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {/* Search & Select Real-time System Model */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-[var(--text-muted)]">
                          {t("policySelectModelPlaceholder")}
                        </label>
                        {liveProviders.length > 0 && (
                          <select
                            value={selectedProviderFilter}
                            onChange={(e) => setSelectedProviderFilter(e.target.value)}
                            className="text-[10px] rounded border border-[var(--surface-border)] bg-[var(--surface-base)] px-1.5 py-0.5 text-[var(--text-secondary)] focus:outline-none"
                          >
                            <option value="all">{t("policyAllProviders")}</option>
                            {liveProviders.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          placeholder={`Search ${liveModels.length} models...`}
                          className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        {filteredModels.length > 0 && (
                          <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] shadow-sm p-1">
                            {filteredModels.slice(0, 40).map((model) => (
                              <button
                                key={model}
                                type="button"
                                onClick={() => {
                                  handleAddPattern(model);
                                }}
                                className="w-full flex items-center justify-between px-2 py-1 text-xs font-mono rounded hover:bg-[var(--surface-muted)] text-[var(--text-primary)] text-left truncate transition-colors"
                              >
                                <span className="truncate">{model}</span>
                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans shrink-0 ml-2">
                                  + Add
                                </span>
                              </button>
                            ))}
                            {filteredModels.length > 40 && (
                              <div className="text-center text-[10px] text-[var(--text-muted)] py-1 border-t border-[var(--surface-border)] mt-1">
                                Showing 40 of {filteredModels.length} models. Type to filter.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Custom Wildcard Pattern Input */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-[var(--text-muted)]">
                        {t("policyCustomPatternPlaceholder")}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={customPattern}
                          onChange={(e) => setCustomPattern(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddPattern();
                            }
                          }}
                          placeholder="e.g. claude-3-5-*, gpt-4o*"
                          className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-1.5 text-xs font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => handleAddPattern()}
                          disabled={!customPattern.trim()}
                          className="text-xs px-3 py-1.5 shrink-0 rounded-md"
                        >
                          {t("policyAddPatternButton")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fallback Routing Section */}
              <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {t("policyFallbackTitle")}
                    </span>
                    <HelpTooltip content={t("policyFallbackTooltip")} />
                  </div>

                  {(fallbackProvider || fallbackModel) && (
                    <button
                      type="button"
                      onClick={() => {
                        setFallbackProvider("");
                        setFallbackModel("");
                      }}
                      className="text-xs text-[var(--text-muted)] hover:text-rose-500 transition-colors px-2 py-0.5 rounded hover:bg-rose-500/10"
                    >
                      {t("policyFallbackClearButton")}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Fallback Provider */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-primary)]">
                      {t("policyFallbackProviderLabel")}
                    </label>
                    <div className="space-y-1">
                      <select
                        value={fallbackProvider}
                        onChange={(e) => {
                          const prov = e.target.value;
                          setFallbackProvider(prov);
                          const found = liveProviders.find((p) => p.id === prov);
                          const firstModel = found?.models[0];
                          if (firstModel && !fallbackModel) {
                            setFallbackModel(firstModel);
                          }
                        }}
                        className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">{t("policyFallbackProviderPlaceholder")}</option>
                        {liveProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id}) {p.models.length > 0 ? `· ${p.models.length} models` : ""}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={fallbackProvider}
                        onChange={(e) => setFallbackProvider(e.target.value)}
                        placeholder="Or custom provider ID..."
                        className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Fallback Model */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-primary)]">
                      {t("policyFallbackModelLabel")}
                    </label>
                    <div className="space-y-1">
                      <select
                        value={fallbackModel}
                        onChange={(e) => setFallbackModel(e.target.value)}
                        className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">{t("policyFallbackModelPlaceholder")}</option>
                        {fallbackModelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={fallbackModel}
                        onChange={(e) => setFallbackModel(e.target.value)}
                        placeholder="Or custom fallback model..."
                        className="w-full rounded-md border border-[var(--surface-border)] bg-[var(--surface-base)] px-2.5 py-1 text-[11px] font-mono text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Real-time Summary Card */}
              <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface-muted)]/40 p-3.5 text-xs space-y-1.5">
                <div className="font-semibold text-[var(--text-secondary)]">
                  {t("policySummaryTitle")}
                </div>
                <div className="text-[var(--text-muted)] flex flex-col gap-1">
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">
                      {t("policySummaryAllowed", {
                        models: allowedModels.length > 0 ? allowedModels.join(", ") : "None",
                      })}
                    </span>
                  </div>
                  <div>
                    {fallbackProvider && fallbackModel ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {t("policySummaryFallback", {
                          provider: fallbackProvider,
                          model: fallbackModel,
                        })}
                      </span>
                    ) : (
                      <span>{t("policySummaryNoFallback")}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ModalContent>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          {tc("cancel")}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("policySavingButton") : t("policySaveButton")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
