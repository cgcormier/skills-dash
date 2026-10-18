import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minimize2, MoreHorizontal } from "lucide-react";
import { Modal } from "./Modal";

// Mounted only in the native app; browser development has no window IPC.
export function WindowControls({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getCurrentWindow()
        .isMaximized()
        .then((value) => {
          if (active) setMaximized(value);
        })
        .catch(() => {
          /* Actions report errors; a resize read must not interrupt work. */
        });
    };
    refresh();
    window.addEventListener("resize", refresh);
    return () => {
      active = false;
      window.removeEventListener("resize", refresh);
    };
  }, []);

  async function run(action: "fit" | "minimize" | "close") {
    try {
      const appWindow = getCurrentWindow();
      if (action === "fit") {
        await appWindow.toggleMaximize();
        setMaximized(await appWindow.isMaximized());
      } else if (action === "minimize") await appWindow.minimize();
      else await appWindow.close();
      setOptionsOpen(false);
    } catch {
      notify(
        "Window action failed. Try again or use the Windows taskbar controls.",
      );
    }
  }

  return (
    <>
      <button
        className="icon-button window-fit"
        aria-label={maximized ? "Restore window size" : "Fit window to screen"}
        title={maximized ? "Restore window size" : "Fit window to screen"}
        onClick={() => void run("fit")}
      >
        {maximized ? (
          <Minimize2 size={16} aria-hidden="true" />
        ) : (
          <Maximize2 size={16} aria-hidden="true" />
        )}
      </button>
      <button
        className="icon-button"
        aria-label="Window options"
        title="Window options"
        onClick={() => setOptionsOpen(true)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {optionsOpen && (
        <Modal
          title="Window options"
          className="window-options"
          onClose={() => setOptionsOpen(false)}
        >
          <div className="form-body">
            <p>
              Drag the header to move. Double-click it to fit or restore. Drag
              an edge to resize.
            </p>
            <button className="secondary" onClick={() => void run("fit")}>
              {maximized ? "Restore window size" : "Fit window to screen"}
            </button>
            <button className="secondary" onClick={() => void run("minimize")}>
              Minimize window
            </button>
            <button className="secondary" onClick={() => void run("close")}>
              Close window
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
