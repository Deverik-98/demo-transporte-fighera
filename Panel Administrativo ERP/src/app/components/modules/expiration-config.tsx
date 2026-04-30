import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import { useOperationsData } from "../../lib/operations-data";
import { FileCheck, Edit, Save, Calendar } from "lucide-react";

export function ExpirationConfig() {
  const { expirationRules, setExpirationRules } = useOperationsData();
  const [configs, setConfigs] = useState(expirationRules);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    setConfigs(expirationRules);
  }, [expirationRules]);

  const toggleEnabled = (id: number) => {
    setConfigs((prev) => {
      const next = prev.map((config) => (config.id === id ? { ...config, enabled: !config.enabled } : config));
      setExpirationRules(next);
      return next;
    });
  };

  const getFrequencyBadge = (frequency: string) => {
    const colors: Record<string, any> = {
      "Anual": "secondary",
      "Semestral": "outline",
      "Trimestral": "warning",
      "Mensual": "destructive",
    };
    return colors[frequency] || "default";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1>Configuración de Vencimientos</h1>
        <Button>
          <Calendar className="h-4 w-4 mr-2" />
          Nueva Regla
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Reglas de Documentación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3">Tipo de Documento</th>
                  <th className="text-left p-3">Frecuencia de Renovación</th>
                  <th className="text-left p-3">Días de Pre-aviso</th>
                  <th className="text-left p-3">Estado</th>
                  <th className="text-left p-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {configs.map((config) => (
                  <tr key={config.id} className="border-b border-border hover:bg-muted/50">
                    <td className="p-3">{config.docType}</td>
                    <td className="p-3">
                      <Badge variant={getFrequencyBadge(config.frequency)}>
                        {config.frequency}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {editingId === config.id ? (
                        <input
                          type="number"
                          defaultValue={config.prealertDays}
                          className="w-20 px-2 py-1 border border-border rounded bg-background"
                        />
                      ) : (
                        <span>{config.prealertDays} días</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Switch
                        checked={config.enabled}
                        onCheckedChange={() => toggleEnabled(config.id)}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        {editingId === config.id ? (
                          <Button
                            size="sm"
                            onClick={() => setEditingId(null)}
                          >
                            <Save className="h-4 w-4 mr-1" />
                            Guardar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingId(config.id)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Reglas Activas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-green-600">
              {configs.filter(c => c.enabled).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Reglas Inactivas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl text-muted-foreground">
              {configs.filter(c => !c.enabled).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Total de Reglas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl">{configs.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-blue-500/10 border-blue-500">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="mb-1">Motor de Vencimientos</h3>
              <p className="text-sm text-muted-foreground">
                El sistema ejecuta chequeos automáticos cada 24 horas para verificar documentación próxima a vencer.
                Las alertas se generan según los días de pre-aviso configurados para cada tipo de documento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
