import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { costData, monthlyChartData } from "../../lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

export function Costs() {
  const totalCost = costData.reduce((sum, item) => sum + item.cost, 0);
  const totalRevenue = costData.reduce((sum, item) => sum + item.revenue, 0);
  const totalProfit = costData.reduce((sum, item) => sum + item.profit, 0);
  const avgProfit = Math.round(totalProfit / costData.length);

  return (
    <div className="space-y-6">
      <h1>Módulo de Costos</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-red-500" />
              Costo Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              ${totalCost.toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Últimos 6 viajes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Ingresos Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              ${totalRevenue.toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Últimos 6 viajes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Rentabilidad Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl text-green-600">
              ${totalProfit.toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Margen: {Math.round((totalProfit / totalRevenue) * 100)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              Rentabilidad Promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl">
              ${avgProfit.toLocaleString("es-AR")}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Por viaje</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolución Mensual de Costos e Ingresos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => `$${value.toLocaleString("es-AR")}`}
                labelStyle={{ color: "var(--foreground)" }}
                contentStyle={{
                  backgroundColor: "var(--background)",
                  border: "1px solid var(--border)",
                }}
              />
              <Legend />
              <Bar dataKey="costo" fill="hsl(var(--destructive))" name="Costo" />
              <Bar dataKey="ingreso" fill="hsl(var(--chart-2))" name="Ingreso" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Viajes y Costos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3">ID Viaje</th>
                  <th className="text-left p-3">Ruta</th>
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Costo</th>
                  <th className="text-left p-3">Ingreso</th>
                  <th className="text-left p-3">Rentabilidad</th>
                  <th className="text-left p-3">Margen</th>
                </tr>
              </thead>
              <tbody>
                {costData.map((item) => {
                  const margin = Math.round((item.profit / item.revenue) * 100);
                  return (
                    <tr key={item.id} className="border-b border-border hover:bg-muted/50">
                      <td className="p-3">{item.id}</td>
                      <td className="p-3">{item.trip}</td>
                      <td className="p-3 text-sm text-muted-foreground">{item.date}</td>
                      <td className="p-3 text-red-600">${item.cost.toLocaleString("es-AR")}</td>
                      <td className="p-3 text-green-600">${item.revenue.toLocaleString("es-AR")}</td>
                      <td className="p-3">${item.profit.toLocaleString("es-AR")}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          {margin > 30 ? (
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-yellow-500" />
                          )}
                          <span>{margin}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
