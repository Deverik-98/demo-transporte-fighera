import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Dashboard } from "./components/modules/dashboard";
import { Alerts } from "./components/modules/alerts";
import { Trips } from "./components/modules/trips";
import { Costs } from "./components/modules/costs";
import { ExpirationConfig } from "./components/modules/expiration-config";
import { Security } from "./components/modules/security";
import { VehiclesModule } from "./components/modules/vehicles";
import { DocumentsModule } from "./components/modules/documents";
import { TVModeDashboard } from "./components/modules/tv-mode-dashboard";
import {
  LayoutDashboard,
  Truck,
  DollarSign,
  Settings,
  Shield,
  Bell,
  User,
  Moon,
  Sun,
  Menu,
  X,
  Car,
  FolderOpen,
} from "lucide-react";
import { useTheme } from "next-themes";
import { OperationsDataProvider, useOperationsData, UserRole } from "./lib/operations-data";
import { Toaster } from "./components/ui/sonner";
import { canAccess } from "./components/auth/RbacGuard";
import { BrandLogo } from "./components/brand/BrandLogo";
import { BRAND_NAME } from "./lib/brand";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

function AppContent() {
  const [currentView, setCurrentView] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("Administrador");
  const [documentsFocusTripId, setDocumentsFocusTripId] = useState<string | null>(null);
  const { resetDemoData } = useOperationsData();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ tripId?: string }>).detail;
      if (!detail?.tripId) return;
      setDocumentsFocusTripId(detail.tripId);
      setCurrentView("documents");
    };
    window.addEventListener("tf-open-trip-documents", handler);
    return () => window.removeEventListener("tf-open-trip-documents", handler);
  }, []);

  const menuItems = [
    { id: "dashboard", label: "Centro de Operaciones", icon: LayoutDashboard },
    { id: "trips", label: "Gestión de Viajes", icon: Truck },
    { id: "vehicles", label: "Flota de Vehículos", icon: Car },
    { id: "documents", label: "Documentación", icon: FolderOpen },
    { id: "costs", label: "Costos y Rentabilidad", icon: DollarSign },
    { id: "configurations", label: "Configuraciones", icon: Settings },
    { id: "security", label: "Usuarios y Seguridad", icon: Shield },
    { id: "tvmode", label: "TV Mode", icon: LayoutDashboard },
  ];

  const renderContent = () => {
    switch (currentView) {
      case "dashboard":
        return <Dashboard onOpenAlertsHistory={() => setCurrentView("alerts")} />;
      case "trips":
        return (
          <Trips
            onFocusTripInMap={(tripId, zoneId) => {
              setCurrentView("dashboard");
              window.dispatchEvent(new CustomEvent("tf-focus-trip", { detail: { tripId, zoneId } }));
            }}
            onOpenTripDocuments={(tripId) => {
              setDocumentsFocusTripId(tripId);
              setCurrentView("documents");
            }}
          />
        );
      case "costs":
        return <Costs />;
      case "alerts":
        return <Alerts />;
      case "vehicles":
        return <VehiclesModule />;
      case "documents":
        return (
          <DocumentsModule
            focusTripId={documentsFocusTripId}
            onFocusTripConsumed={() => setDocumentsFocusTripId(null)}
          />
        );
      case "configurations":
        return <ExpirationConfig />;
      case "security":
        return <Security />;
      case "tvmode":
        return <TVModeDashboard />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <header className="border-b border-border bg-card px-3 py-2 sm:px-6">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 sm:min-h-14">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </Button>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <BrandLogo variant="compact" priority className="shrink-0" />
              <h1 className="truncate text-base font-semibold sm:text-xl">{BRAND_NAME}</h1>
            <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">ERP Logístico</Badge>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:gap-3">
            <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
          </Button>
          <ThemeToggle />
            <Button variant="ghost" className="flex items-center gap-2">
            <User className="h-5 w-5" />
              <span className="hidden lg:inline">Rol: {currentUserRole}</span>
          </Button>
          <select
              className="h-9 min-w-0 rounded-md border bg-background px-2 py-1 text-sm max-sm:w-full sm:w-auto"
            value={currentUserRole}
            onChange={(event) => setCurrentUserRole(event.target.value as UserRole)}
          >
            {(["Administrador", "Operador", "Supervisor", "Chofer", "Visualizador"] as UserRole[]).map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
            <Button variant="outline" size="sm" className="max-sm:w-full" onClick={resetDemoData}>
            Reset demo data
          </Button>
          </div>
        </div>
      </header>

      <div className="relative flex flex-1 min-h-0">
        {!sidebarCollapsed ? (
          <button
            type="button"
            aria-label="Cerrar menú lateral"
            className="absolute inset-0 z-30 bg-black/45 md:hidden"
            onClick={() => setSidebarCollapsed(true)}
          />
        ) : null}
        <aside
          className={`border-r border-border bg-sidebar transition-all duration-300 absolute inset-y-0 left-0 z-40 w-[min(18rem,86vw)] transform md:static md:inset-auto md:z-auto md:transform-none ${
            sidebarCollapsed ? "-translate-x-full md:w-0 md:overflow-hidden" : "translate-x-0 md:w-72"
          }`}
        >
          <nav className="h-full overflow-y-auto p-3 sm:p-4 space-y-2">
            {menuItems
              .filter((item) => canAccess(currentUserRole, item.id as Parameters<typeof canAccess>[1]))
              .map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id);
                      if (window.matchMedia("(max-width: 767px)").matches) {
                        setSidebarCollapsed(true);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto bg-background p-3 sm:p-6">
          <div className="max-w-[1600px] mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="tf-admin-theme-v2"
    >
      <OperationsDataProvider>
        <AppContent />
        <Toaster richColors position="top-right" />
      </OperationsDataProvider>
    </ThemeProvider>
  );
}