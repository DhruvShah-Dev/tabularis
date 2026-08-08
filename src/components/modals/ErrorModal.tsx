import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Copy, X } from "lucide-react";
import { Modal } from "../ui/Modal";
import { copyTextToClipboard } from "../../utils/clipboard";

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
}

export const ErrorModal = ({ isOpen, onClose, message }: ErrorModalProps) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyTextToClipboard(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="bg-elevated border border-strong rounded-xl shadow-2xl w-[520px] max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-default bg-base">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-900/30 rounded-lg">
              <AlertTriangle size={20} className="text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-primary">
              {t("common.error")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <pre className="text-sm text-secondary whitespace-pre-wrap break-words select-text font-mono">
            {message}
          </pre>
        </div>

        <div className="p-4 border-t border-default bg-base/50 flex justify-end gap-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 text-secondary hover:text-primary border border-strong rounded-lg text-sm font-medium transition-colors"
          >
            {copied ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
            {copied ? t("dataGrid.copied") : t("common.copy")}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
