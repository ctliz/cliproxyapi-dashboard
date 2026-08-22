"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalTitle, ModalContent, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { HelpTooltip } from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import { API_ENDPOINTS } from "@/lib/api-endpoints";
import { ApiKeyPolicyModal, type ApiKeyItem } from "@/components/api-keys/api-key-policy-modal";

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback(async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedKey(id ?? text);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  return { copiedKey, copy };
}

const EMPTY_KEYS: ApiKeyItem[] = [];

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>(EMPTY_KEYS);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [keyNameInput, setKeyNameInput] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Policy Modal state
  const [selectedPolicyKey, setSelectedPolicyKey] = useState<ApiKeyItem | null>(null);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [providers, setProviders] = useState<{ id: string; name: string; models: string[] }[]>([]);

  const { showToast } = useToast();
  const { copiedKey, copy } = useCopyToClipboard();
  const t = useTranslations("apiKeys");
  const tc = useTranslations("common");

  const fetchApiKeys = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(API_ENDPOINTS.USER.API_KEYS, { signal });
      if (!res.ok) {
        showToast(t("toastLoadFailed"), "error");
        setLoading(false);
        return;
      }

      const data = await res.json();
      const keys = Array.isArray(data.apiKeys) ? data.apiKeys : [];
      setApiKeys(keys);
      setLoading(false);
    } catch {
      if (signal?.aborted) return;
      showToast(t("toastNetworkError"), "error");
      setLoading(false);
    }
  }, [showToast, t]);

  const fetchModelsAndProviders = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(API_ENDPOINTS.PROXY.MODELS, { signal });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models)) setAvailableModels(data.models);
        if (Array.isArray(data.providers)) setProviders(data.providers);
      }
    } catch {
      // Best-effort background load
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetchApiKeys(controller.signal);
      void fetchModelsAndProviders(controller.signal);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchApiKeys, fetchModelsAndProviders]);

  const handleCreateKey = async () => {
    setCreating(true);

    try {
      const res = await fetch(API_ENDPOINTS.USER.API_KEYS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyNameInput.trim() || tc("default") }),
      });

      if (!res.ok) {
        showToast(t("toastCreateFailed"), "error");
        setCreating(false);
        return;
      }

      const newKey = await res.json();
      showToast(t("toastCreateSuccess"), "success");
      setNewKeyValue(newKey.key);
      setIsCreateModalOpen(false);
      setIsModalOpen(true);
      setCreating(false);
      await fetchApiKeys();
    } catch {
      showToast(t("toastNetworkError"), "error");
      setCreating(false);
    }
  };

  const confirmDelete = (id: string) => {
    setPendingDeleteId(id);
    setShowConfirm(true);
  };

  const handleDeleteKey = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;

    try {
      const res = await fetch(
        `${API_ENDPOINTS.USER.API_KEYS}?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        showToast(t("toastDeleteFailed"), "error");
        return;
      }

      showToast(t("toastDeleteSuccess"), "success");
      setApiKeys((prev) => prev.filter((item) => item.id !== id));
    } catch {
      showToast(t("toastNetworkError"), "error");
    }
  };

  const handleOpenPolicyModal = (apiKey: ApiKeyItem) => {
    setSelectedPolicyKey(apiKey);
    setIsPolicyModalOpen(true);
  };

  const handlePolicySaved = (updated: {
    id: string;
    policyEnabled: boolean;
    fastEnabled: boolean;
    allowedModels: string[];
    fallbackProvider: string | null;
    fallbackModel: string | null;
  }) => {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === updated.id ? { ...k, ...updated } : k))
    );
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNewKeyValue(null);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">{t("pageTitle")}</h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{t("pageDescription")} <HelpTooltip content={t("pageTooltip")} /></p>
          </div>
          <Button onClick={() => { setKeyNameInput(""); setIsCreateModalOpen(true); }} disabled={creating} className="px-2.5 py-1 text-xs" data-testid="api-key-create-trigger">
            {t("createKeyButton")}
          </Button>
        </div>
      </section>

      {loading ? (
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-6 text-center text-sm text-[var(--text-muted)]">{t("loadingText")}</div>
      ) : apiKeys.length === 0 ? (
        <div className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] p-8">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-14 items-center justify-center rounded-full border border-[var(--surface-border)] bg-[var(--surface-base)]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-muted)]" aria-hidden="true">
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
                <circle cx="12" cy="11" r="2" />
                <path d="M12 13a4 4 0 014 4h-8a4 4 0 014-4z" />
              </svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("emptyTitle")}</h3>
              <p className="text-xs text-[var(--text-muted)]">{t("emptyDescription")}</p>
            </div>
            <Button onClick={() => { setKeyNameInput(""); setIsCreateModalOpen(true); }} disabled={creating} className="px-3 py-1.5 text-xs">
              {t("createApiKeyButton")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <section className="min-w-[760px] overflow-hidden rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)]">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_130px_130px_160px] border-b border-[var(--surface-border)] bg-[var(--surface-base)]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              <span>{t("tableHeaderName")}</span>
              <span>{t("tableHeaderPolicy")}</span>
              <span>{t("tableHeaderCreated")}</span>
              <span>{t("tableHeaderLastUsed")}</span>
              <span className="text-right">{t("tableHeaderActions")}</span>
            </div>
            {apiKeys.map((apiKey) => {
              const hasPolicy = Boolean(apiKey.policyEnabled);
              const hasFastMode = Boolean(apiKey.fastEnabled);
              const allowedCount = apiKey.allowedModels?.length || 0;
              const fallbackText =
                apiKey.fallbackProvider && apiKey.fallbackModel
                  ? t("policyTooltipFallback", {
                      provider: apiKey.fallbackProvider,
                      model: apiKey.fallbackModel,
                    })
                  : t("policyTooltipNoFallback");
              const tooltipContent = hasPolicy
                ? t("policyTooltipActive", {
                    models: apiKey.allowedModels?.join(", ") || "None",
                    fallback: fallbackText,
                  })
                : t("policyDisabledNotice");

              return (
                <div
                  key={apiKey.id}
                  className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_130px_130px_160px] items-center border-b border-[var(--surface-border)] px-3 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 pr-2">
                    <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                      {apiKey.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-muted)]">
                      {apiKey.keyPreview}
                    </p>
                  </div>

                  {/* Policy Column */}
                  <div className="min-w-0 pr-2">
                    {hasFastMode && (
                      <span className="mb-1 inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
                        {t("fastBadge")}
                      </span>
                    )}
                    {hasPolicy ? (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            title={tooltipContent}
                          >
                            <ShieldIcon className="size-3 shrink-0" />
                            {t("policyBadgeActive", { count: allowedCount })}
                          </span>
                          <HelpTooltip content={tooltipContent} />
                        </div>
                        {apiKey.fallbackProvider && apiKey.fallbackModel && (
                          <span
                            className="truncate font-mono text-[10px] text-[var(--text-muted)]"
                            title={`Fallback: ${apiKey.fallbackProvider}/${apiKey.fallbackModel}`}
                          >
                            ↳ {apiKey.fallbackProvider}/{apiKey.fallbackModel}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-muted)] border border-[var(--surface-border)]">
                        {t("policyBadgeDisabled")}
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(apiKey.createdAt).toLocaleDateString()}
                  </span>

                  <span className="text-xs text-[var(--text-muted)]">
                    {apiKey.lastUsedAt
                      ? new Date(apiKey.lastUsedAt).toLocaleDateString()
                      : t("neverUsed")}
                  </span>

                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="secondary"
                      onClick={() => handleOpenPolicyModal(apiKey)}
                      className="px-2.5 py-1 text-xs"
                      data-testid={`api-key-policy-trigger-${apiKey.id}`}
                    >
                      <ShieldIcon className="size-3 mr-1 inline-block" />
                      {t("policyButton")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => confirmDelete(apiKey.id)}
                      className="px-2.5 py-1 text-xs"
                      data-testid={`api-key-delete-trigger-${apiKey.id}`}
                    >
                      {t("deleteButton")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* ── Model Policy Modal ── */}
      <ApiKeyPolicyModal
        isOpen={isPolicyModalOpen}
        onClose={() => {
          setIsPolicyModalOpen(false);
          setSelectedPolicyKey(null);
        }}
        apiKey={selectedPolicyKey}
        onSaved={handlePolicySaved}
        availableModels={availableModels}
        providers={providers}
        onRefreshModels={async () => {
          await fetchModelsAndProviders();
        }}
      />

      {/* ── Create Key Modal ── */}
      <Modal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)}>
        <ModalHeader>
          <ModalTitle>{t("createModalTitle")}</ModalTitle>
        </ModalHeader>
        <ModalContent>
          <div className="space-y-4">
            <div>
              <label htmlFor="key-name-input" className="mb-2 block text-sm font-semibold text-[var(--text-secondary)]">
                {t("keyNameLabel")}
              </label>
              <Input
                type="text"
                name="key-name-input"
                value={keyNameInput}
                onChange={setKeyNameInput}
                placeholder={t("keyNamePlaceholder")}
                disabled={creating}
              />
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">{t("keyNameHint")}</p>
            </div>
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
            {t("cancelButton")}
          </Button>
          <Button onClick={handleCreateKey} disabled={creating}>
            {creating ? t("creatingButton") : t("createButton")}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={isModalOpen && newKeyValue !== null} onClose={handleCloseModal}>
        <ModalHeader>
          <ModalTitle>{t("newKeyModalTitle")}</ModalTitle>
        </ModalHeader>
        <ModalContent>
          <div className="space-y-4">
            <div className="rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-4 text-sm">
              <div className="mb-2 font-medium text-[var(--text-primary)]">{t("copyThisKey")}</div>
              <div className="relative group">
                <div className="break-all rounded-sm border border-[var(--surface-border)] bg-[var(--surface-base)] p-3 pr-12 font-mono text-xs text-[var(--text-primary)]">
                  {newKeyValue}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (newKeyValue) {
                      copy(newKeyValue, "modal");
                      showToast(t("toastCopied"), "success");
                    }
                  }}
                  className="absolute right-2.5 top-2.5 rounded-sm border border-[var(--surface-border)] bg-[var(--surface-muted)] p-1.5 text-[var(--text-muted)] transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  title={t("copyButtonTitle")}
                >
                  {copiedKey === "modal" ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>
            <div className="rounded-sm border border-amber-500/20 bg-amber-500/10 p-3 text-sm">
              <span className="text-amber-700">{t("keyShownOnce")}</span>
            </div>
          </div>
        </ModalContent>
        <ModalFooter>
          <Button onClick={handleCloseModal}>{t("savedButton")}</Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => {
          setShowConfirm(false);
          setPendingDeleteId(null);
        }}
        onConfirm={handleDeleteKey}
        title={t("deleteConfirmTitle")}
        message={t("deleteConfirmMessage")}
        confirmLabel={t("deleteConfirmButton")}
        cancelLabel={t("deleteConfirmCancelButton")}
        variant="danger"
      />
    </div>
  );
}
