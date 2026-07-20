import { Outlet, useLocation } from "react-router-dom";

import { CommandPaletteProvider } from "../../contexts/CommandPaletteProvider";
import { useAutoConnectFromUrl } from "../../hooks/useAutoConnectFromUrl";
import { useConnectionLayoutContext } from "../../hooks/useConnectionLayoutContext";
import { useConnectionWindowLifecycle } from "../../hooks/useConnectionWindowLifecycle";
import { useGlobalShortcuts } from "../../hooks/useGlobalShortcuts";
import { CommandPaletteModal } from "../modals/CommandPaletteModal";
import { ProductionBanner } from "./ProductionBanner";
import { RightSidebar } from "./RightSidebar";
import { Sidebar } from "./Sidebar";
import { SplitPaneLayout } from "./SplitPaneLayout";

const MainLayoutContent = () => {
  const { splitView, isSplitVisible } = useConnectionLayoutContext();
  const location = useLocation();
  useGlobalShortcuts();
  useAutoConnectFromUrl();
  useConnectionWindowLifecycle();

  const showSplit =
    !!splitView &&
    isSplitVisible &&
    location.pathname !== "/" &&
    location.pathname !== "/connections" &&
    location.pathname !== "/settings";

  return (
    <div className="flex h-screen bg-base text-primary overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ProductionBanner />
        {showSplit ? <SplitPaneLayout {...splitView} /> : <Outlet />}
      </main>
      <RightSidebar />
      <CommandPaletteModal />
    </div>
  );
};

export const MainLayout = () => (
  <CommandPaletteProvider>
    <MainLayoutContent />
  </CommandPaletteProvider>
);
