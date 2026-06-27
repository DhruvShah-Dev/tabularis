import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Loader2,
  Database,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Copy,
  KeyRound,
  Lock,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import clsx from "clsx";
import { toErrorMessage } from "../../utils/errors";
import type {
  ImportSourceInfo,
  ImportPreview,
  ImportItem,
  ImportResolution,
  ImportAction,
} from "../../types/connectionImport";

interface ImportFromAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful import so the caller can reload connections. */
  onImported: () => void;
}

type Step = "picker" | "preview";

/** Synthetic source: import from a Tabularis JSON export file (handled
 * directly, without the foreign-app preview pipeline). */
const TABULARIS_SOURCE_ID = "tabularis-json";

export const ImportFromAppModal = ({
  isOpen,
  onClose,
  onImported,
}: ImportFromAppModalProps) => {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("picker");
  const [sources, setSources] = useState<ImportSourceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includePasswords, setIncludePasswords] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, ImportAction>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("picker");
    setSelectedId(null);
    setIncludePasswords(true);
    setPreview(null);
    setResolutions({});
    setError(null);
    setLoading(false);
  }, []);

  // Load the source list whenever the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    reset();
    setLoading(true);
    const tabularisSource: ImportSourceInfo = {
      id: TABULARIS_SOURCE_ID,
      displayName: "Tabularis",
      available: true,
      connectionCount: 0,
      readsPasswordsFromKeychain: false,
      needsFile: true,
    };
    invoke<ImportSourceInfo[]>("list_connection_import_sources")
      .then((list) => {
        const all = [tabularisSource, ...list];
        setSources(all);
        const firstAvailable = all.find((s) => s.available);
        setSelectedId(firstAvailable?.id ?? null);
      })
      .catch((e) => setError(toErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [isOpen, reset]);

  const selectedSource = sources.find((s) => s.id === selectedId) ?? null;

  const handleContinue = async () => {
    if (!selectedSource || !selectedSource.available) return;
    setError(null);
    setLoading(true);
    try {
      // Tabularis export file: reuse the existing lossless JSON import path.
      if (selectedSource.id === TABULARIS_SOURCE_ID) {
        const picked = await open({
          filters: [{ name: "JSON", extensions: ["json"] }],
          multiple: false,
        });
        if (!picked || Array.isArray(picked)) {
          setLoading(false);
          return;
        }
        const content = await readTextFile(picked);
        const payload = JSON.parse(content);
        await invoke("import_connections_payload", { payload });
        onImported();
        onClose();
        return;
      }

      let filePath: string | null = null;
      if (selectedSource.needsFile) {
        const picked = await open({ multiple: false });
        if (!picked || Array.isArray(picked)) {
          setLoading(false);
          return;
        }
        filePath = picked;
      }
      const result = await invoke<ImportPreview>("preview_connection_import", {
        sourceId: selectedSource.id,
        includePasswords,
        filePath,
      });
      // Default: import everything, skip duplicates.
      const defaults: Record<number, ImportAction> = {};
      for (const item of result.items) {
        defaults[item.index] = item.status.kind === "duplicate" ? "skip" : "import";
      }
      setPreview(result);
      setResolutions(defaults);
      setStep("preview");
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview || !selectedSource) return;
    setError(null);
    setLoading(true);
    try {
      const payload: ImportResolution[] = preview.items.map((item) => {
        const action = resolutions[item.index] ?? "skip";
        return {
          index: item.index,
          action,
          replaceExistingId:
            action === "replace" && item.status.kind === "duplicate"
              ? item.status.existingId
              : undefined,
        };
      });
      await invoke("apply_connection_import", {
        sourceId: selectedSource.id,
        resolutions: payload,
      });
      onImported();
      onClose();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const importCount = preview
    ? preview.items.filter((i) => (resolutions[i.index] ?? "skip") !== "skip").length
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-sm">
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[640px] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-default bg-base">
          <div className="flex items-center gap-3">
            {step === "preview" && (
              <button
                onClick={() => setStep("picker")}
                className="text-secondary hover:text-primary transition-colors"
                title={t("common.back", { defaultValue: "Back" })}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="p-2 bg-blue-900/30 rounded-lg">
              <Database size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">
                {t("connections.importFromApp.title")}
              </h2>
              <p className="text-xs text-secondary">
                {step === "picker"
                  ? t("connections.importFromApp.subtitle")
                  : t("connections.importFromApp.previewSubtitle", {
                      source: preview?.sourceName ?? "",
                    })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-10 text-muted">
              <Loader2 size={22} className="animate-spin" />
            </div>
          )}

          {!loading && step === "picker" && (
            <SourcePicker
              sources={sources}
              selectedId={selectedId}
              onSelect={setSelectedId}
              includePasswords={includePasswords}
              onTogglePasswords={setIncludePasswords}
            />
          )}

          {!loading && step === "preview" && preview && (
            <PreviewList
              preview={preview}
              resolutions={resolutions}
              onChange={(index, action) =>
                setResolutions((prev) => ({ ...prev, [index]: action }))
              }
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-default bg-base/50 flex justify-between gap-3">
          {step === "preview" && preview?.credentialsAborted ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle size={13} />
              {t("connections.importFromApp.credentialsAborted")}
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-secondary hover:text-primary transition-colors text-sm"
            >
              {t("common.cancel")}
            </button>
            {step === "picker" ? (
              <button
                onClick={handleContinue}
                disabled={!selectedSource?.available || loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("common.continue", { defaultValue: "Continue" })}
              </button>
            ) : (
              <button
                onClick={handleApply}
                disabled={loading || importCount === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("connections.importFromApp.importCount", { count: importCount })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Source picker step ─────────────────────────────────────────────────────

interface SourcePickerProps {
  sources: ImportSourceInfo[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  includePasswords: boolean;
  onTogglePasswords: (value: boolean) => void;
}

const SourcePicker = ({
  sources,
  selectedId,
  onSelect,
  includePasswords,
  onTogglePasswords,
}: SourcePickerProps) => {
  const { t } = useTranslation();

  const subtitle = (s: ImportSourceInfo) => {
    if (s.id === TABULARIS_SOURCE_ID) return t("connections.importFromApp.tabularisJsonHint");
    if (!s.available) return t("connections.importFromApp.notInstalled");
    if (s.needsFile) return t("connections.importFromApp.chooseFile");
    return t("connections.importFromApp.connectionsFound", { count: s.connectionCount });
  };

  const showPasswordToggle = selectedId !== TABULARIS_SOURCE_ID;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {sources.map((s) => {
          const selected = s.id === selectedId;
          return (
            <button
              key={s.id}
              disabled={!s.available}
              onClick={() => onSelect(s.id)}
              className={clsx(
                "w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                selected
                  ? "border-blue-500/60 bg-blue-500/10"
                  : "border-strong bg-base hover:border-blue-400/40",
                !s.available && "opacity-50 cursor-not-allowed hover:border-strong",
              )}
            >
              <div className="p-2 rounded-lg bg-surface-secondary">
                <Database size={18} className="text-secondary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">{s.displayName}</p>
                <p className="text-xs text-muted">{subtitle(s)}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Include passwords toggle */}
      {showPasswordToggle && (
      <label className="flex items-start gap-3 rounded-xl border border-strong bg-base p-3.5 cursor-pointer">
        <input
          type="checkbox"
          checked={includePasswords}
          onChange={(e) => onTogglePasswords(e.target.checked)}
          className="mt-0.5 accent-blue-500"
        />
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
            <KeyRound size={13} />
            {t("connections.importFromApp.includePasswords")}
          </p>
          <p className="text-xs text-muted">
            {t("connections.importFromApp.includePasswordsHint")}
          </p>
        </div>
      </label>
      )}
    </div>
  );
};

// ── Preview step ───────────────────────────────────────────────────────────

interface PreviewListProps {
  preview: ImportPreview;
  resolutions: Record<number, ImportAction>;
  onChange: (index: number, action: ImportAction) => void;
}

const PreviewList = ({ preview, resolutions, onChange }: PreviewListProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {preview.items.map((item) => (
        <PreviewRow
          key={item.index}
          item={item}
          action={resolutions[item.index] ?? "skip"}
          onChange={(action) => onChange(item.index, action)}
        />
      ))}
      {preview.items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          {t("connections.importFromApp.noConnections")}
        </p>
      )}
    </div>
  );
};

interface PreviewRowProps {
  item: ImportItem;
  action: ImportAction;
  onChange: (action: ImportAction) => void;
}

const PreviewRow = ({ item, action, onChange }: PreviewRowProps) => {
  const { t } = useTranslation();
  const isDuplicate = item.status.kind === "duplicate";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-strong bg-base px-3.5 py-2.5">
      <StatusBadge item={item} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-primary">
          {item.name}
          {item.hasPassword && (
            <Lock size={11} className="ml-1.5 inline text-green-400" />
          )}
        </p>
        <p className="truncate text-xs text-muted">
          {item.driverId}
          {" · "}
          {item.port ? `${item.host}:${item.port}` : item.host}
          {item.database ? ` / ${item.database}` : ""}
          {item.groupName ? `  ·  ${item.groupName}` : ""}
        </p>
        {item.status.kind === "warnings" && (
          <p className="mt-0.5 text-xs text-amber-400">
            {item.status.warnings.join(" · ")}
          </p>
        )}
        {isDuplicate && item.status.kind === "duplicate" && (
          <p className="mt-0.5 text-xs text-blue-300">
            {t("connections.importFromApp.duplicateOf", {
              name: item.status.existingName,
            })}
          </p>
        )}
      </div>

      {/* Per-item action selector */}
      <select
        value={action}
        onChange={(e) => onChange(e.target.value as ImportAction)}
        className="shrink-0 rounded-lg border border-strong bg-elevated px-2 py-1 text-xs text-primary focus:border-blue-500 focus:outline-none"
      >
        <option value="import">{t("connections.importFromApp.action.import")}</option>
        <option value="skip">{t("connections.importFromApp.action.skip")}</option>
        {isDuplicate && (
          <option value="replace">{t("connections.importFromApp.action.replace")}</option>
        )}
      </select>
    </div>
  );
};

const StatusBadge = ({ item }: { item: ImportItem }) => {
  if (item.status.kind === "duplicate") {
    return <Copy size={16} className="shrink-0 text-blue-400" />;
  }
  if (item.status.kind === "warnings") {
    return <AlertTriangle size={16} className="shrink-0 text-amber-400" />;
  }
  return <CheckCircle2 size={16} className="shrink-0 text-green-400" />;
};
