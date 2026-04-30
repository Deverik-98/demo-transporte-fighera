import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { AlertCircle, CheckCircle, Filter } from "lucide-react";
import { realtimeAlerts } from "../../lib/mock-data";
import { resolveSyncAlert, useSyncAlerts } from "../../lib/sync-store";

export function Alerts() {
  const [filter, setFilter] = useState<string>("all");
  const alerts = useSyncAlerts(
    realtimeAlerts.map((alert) => ({
      id: String(alert.id),
      time: alert.time,
      message: alert.message,
      severity: alert.severity === "Alta" ? "Alta" : "Media",
      source: "web" as const,
      status: "Activa" as const,
    })),
  );

  const filteredAlerts = useMemo(
    () => (filter === "all" ? alerts : alerts.filter((a) => a.status === filter)),
    [alerts, filter],
  );

  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case "Alta":
        return "destructive";
      case "Media":
        return "warning";
      case "Baja":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Gestión de Alertas</h1>
        <div className="flex gap-2">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            Todas
          </Button>
          <Button
            variant={filter === "Activa" ? "default" : "outline"}
            onClick={() => setFilter("Activa")}
          >
            Activas
          </Button>
          <Button
            variant={filter === "Resuelta" ? "default" : "outline"}
            onClick={() => setFilter("Resuelta")}
          >
            Resueltas
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Total de Alertas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{alerts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-red-500">
              {alerts.filter(a => a.status === "Activa").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Resueltas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-green-500">
              {alerts.filter(a => a.status === "Resuelta").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Registro de Alertas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3">Fecha/Hora</th>
                  <th className="text-left p-3">Origen</th>
                  <th className="text-left p-3">Descripción</th>
                  <th className="text-left p-3">Gravedad</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-left p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-border hover:bg-muted/50">
                    <td className="p-3 text-sm text-muted-foreground">{alert.time}</td>
                    <td className="p-3">{alert.source === "mobile" ? "App Chofer" : "Panel Admin"}</td>
                    <td className="p-3">{alert.message}</td>
                    <td className="p-3">
                      <Badge variant={getSeverityVariant(alert.severity)}>
                        {alert.severity}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant={alert.status === "Activa" ? "outline" : "success"}>
                        {alert.status === "Activa" ? (
                          <AlertCircle className="h-3 w-3 mr-1" />
                        ) : (
                          <CheckCircle className="h-3 w-3 mr-1" />
                        )}
                        {alert.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {alert.status === "Activa" ? (
                        <Button size="sm" variant="outline" onClick={() => resolveSyncAlert(alert.id)}>
                          Resolver
                        </Button>
                      ) : (
                        <Badge variant="success">Resuelta</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
