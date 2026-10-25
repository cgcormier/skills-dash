import { FileText, RefreshCw, Settings2 } from "lucide-react";
import { isDesktop } from "../storage/skillFiles";
import { WindowControls } from "./WindowControls";
import "./WorkbenchHeader.css";

export function WorkbenchHeader({
  root,
  loading,
  saving,
  legacyLoading,
  reduced,
  onRefresh,
  onImprovementSettings,
  onLegacy,
  onReducedChange,
  notify,
}: {
  root: string;
  loading: boolean;
  saving: boolean;
  legacyLoading: boolean;
  reduced: boolean;
  onRefresh: () => void;
  onImprovementSettings: () => void;
  onLegacy: () => void;
  onReducedChange: (reduced: boolean) => void;
  notify: (message: string) => void;
}) {
  return (
    <>
      <header className="topbar workbench-titlebar">
        <div className="workbench-brand" data-tauri-drag-region>
          <FileText size={19} aria-hidden="true" />
          <span data-tauri-drag-region>
            Skills
            <span className="workbench-subtitle" data-tauri-drag-region>
              Personal workbench
            </span>
          </span>
        </div>
        <span className="runtime">
          {isDesktop() ? "DESKTOP · FILES" : "BROWSER · NO FILE ACCESS"}
        </span>
        {isDesktop() && <WindowControls notify={notify} />}
      </header>
      <div className="workbench-toolbar">
        <div className="workbench-root">
          <span className="workbench-root-label">Skills folder</span>
          <p className="workbench-path" title={root}>
            {root}
          </p>
        </div>
        <div className="workbench-actions">
          <div className="workbench-action-group">
            <button
              className="secondary"
              disabled={loading || saving}
              onClick={onRefresh}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {loading ? "Refreshing…" : "Refresh files"}
            </button>
            <button className="secondary" onClick={onImprovementSettings}>
              <Settings2 size={15} aria-hidden="true" />
              Improvement settings
            </button>
          </div>
          <div className="workbench-action-group workbench-preferences">
            <button
              className="text-button"
              disabled={legacyLoading}
              onClick={onLegacy}
            >
              Legacy archive
            </button>
            <label className="effects-control">
              <input
                type="checkbox"
                checked={reduced}
                onChange={(event) => onReducedChange(event.target.checked)}
              />
              Reduce effects
            </label>
          </div>
        </div>
      </div>
    </>
  );
}
