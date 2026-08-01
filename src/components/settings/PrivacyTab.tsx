import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../hooks/useSettings";
import { useDatabase } from "../../hooks/useDatabase";
import {
  DEFAULT_MASKING_PATTERNS,
  normalizeMaskingPatterns,
} from "../../utils/columnMasking";
import { SettingSection, SettingRow, SettingToggle } from "./SettingControls";

const TEXTAREA_CLASS =
  "w-full h-28 bg-base border border-strong rounded-lg p-3 text-primary text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors resize-y";

const SELECT_CLASS =
  "bg-base border border-strong rounded px-3 py-1.5 text-sm text-primary focus:outline-none focus:border-blue-500";

/** Privacy settings: sensitive-column masking in the results grid (#485). */
export function PrivacyTab() {
  const { t } = useTranslation();
  const { settings, updateSetting } = useSettings();
  const { connections } = useDatabase();

  const maskingEnabled = settings.columnMaskingEnabled ?? true;
  const patterns = settings.columnMaskingPatterns ?? DEFAULT_MASKING_PATTERNS;
  const overrides = settings.columnMaskingOverrides ?? {};

  // Textareas edit a draft and commit normalized values on blur so typing
  // trailing newlines doesn't fight the controlled value.
  const [patternsDraft, setPatternsDraft] = useState<string | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string>("");
  const [includeDraft, setIncludeDraft] = useState<string | null>(null);
  const [excludeDraft, setExcludeDraft] = useState<string | null>(null);

  const connId = selectedConnId || connections[0]?.id || "";
  const connOverride = overrides[connId] ?? {};
  const include = connOverride.include ?? [];
  const exclude = connOverride.exclude ?? [];

  const commitOverride = (field: "include" | "exclude", raw: string) => {
    const list = normalizeMaskingPatterns(raw.split("\n"));
    const next = { ...overrides };
    const entry = { ...next[connId], [field]: list };
    if (!entry.include?.length && !entry.exclude?.length) {
      delete next[connId];
    } else {
      next[connId] = entry;
    }
    updateSetting("columnMaskingOverrides", next);
  };

  return (
    <div>
      <SettingSection
        title={t("settings.columnMasking")}
        description={t("settings.columnMaskingDesc")}
      >
        <SettingRow
          label={t("settings.columnMaskingEnabled")}
          description={t("settings.columnMaskingEnabledDesc")}
        >
          <SettingToggle
            checked={maskingEnabled}
            onChange={(v) => updateSetting("columnMaskingEnabled", v)}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.maskingPatterns")}
          description={t("settings.maskingPatternsDesc")}
          vertical
        >
          <textarea
            value={patternsDraft ?? patterns.join("\n")}
            disabled={!maskingEnabled}
            onChange={(e) => setPatternsDraft(e.target.value)}
            onBlur={() => {
              if (patternsDraft !== null) {
                updateSetting(
                  "columnMaskingPatterns",
                  normalizeMaskingPatterns(patternsDraft.split("\n")),
                );
                setPatternsDraft(null);
              }
            }}
            className={TEXTAREA_CLASS}
            placeholder={DEFAULT_MASKING_PATTERNS.join("\n")}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection
        title={t("settings.maskingOverrides")}
        description={t("settings.maskingOverridesDesc")}
      >
        <SettingRow
          label={t("settings.maskingConnection")}
          description={t("settings.maskingConnectionDesc")}
        >
          <select
            value={connId}
            disabled={!maskingEnabled || connections.length === 0}
            onChange={(e) => {
              setSelectedConnId(e.target.value);
              setIncludeDraft(null);
              setExcludeDraft(null);
            }}
            className={SELECT_CLASS}
          >
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </SettingRow>

        <SettingRow
          label={t("settings.maskingInclude")}
          description={t("settings.maskingIncludeDesc")}
          vertical
        >
          <textarea
            value={includeDraft ?? include.join("\n")}
            disabled={!maskingEnabled || !connId}
            onChange={(e) => setIncludeDraft(e.target.value)}
            onBlur={() => {
              if (includeDraft !== null) {
                commitOverride("include", includeDraft);
                setIncludeDraft(null);
              }
            }}
            className={TEXTAREA_CLASS}
            placeholder={t("settings.maskingOverridePlaceholder")}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.maskingExclude")}
          description={t("settings.maskingExcludeDesc")}
          vertical
        >
          <textarea
            value={excludeDraft ?? exclude.join("\n")}
            disabled={!maskingEnabled || !connId}
            onChange={(e) => setExcludeDraft(e.target.value)}
            onBlur={() => {
              if (excludeDraft !== null) {
                commitOverride("exclude", excludeDraft);
                setExcludeDraft(null);
              }
            }}
            className={TEXTAREA_CLASS}
            placeholder={t("settings.maskingOverridePlaceholder")}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}
