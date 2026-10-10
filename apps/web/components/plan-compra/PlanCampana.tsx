"use client";

import { useMemo, useState } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Encabezado, Tabla } from "@/components/ui/Tabla";
import { CifrasPlan } from "@/components/plan-compra/CifrasPlan";
import { FilaCategoria, columnasDelPlan, plantillaDelPlan } from "@/components/plan-compra/FilaCategoria";
import { PlanCategoriaModal } from "@/components/plan-compra/PlanCategoriaModal";
import { armarFilas, estadoCampana, fechaLargaES, leerPlan, totalesDelPlan, type CategoriaPlan } from "@/lib/plan-compra-reglas";
import { CalendarDays, Tags } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";

// Compras ▸ Plan de campaña (ADR-0349). Una fila por categoría: sus tres escenarios, lo que ya hay en la red, cuánto comprar y cuánto
// cuesta; al abrirla, su ventana para armar o corregir el plan. Durante y después de la campaña, lo que se vendió de verdad al lado.
// Toda la cuenta vive en lib/plan-compra-reglas.ts (con su prueba); aquí solo se arma la pantalla con sus piezas.

export function PlanCampana({ datos, falla }: { datos: unknown; falla: string | null }) {
  const plan = useMemo(() => leerPlan(datos), [datos]);
  const [abierta, setAbierta] = useState<CategoriaPlan | null>(null);
  const filas = useMemo(() => (plan ? armarFilas(plan) : []), [plan]);

  if (!plan) {
    return (
      <div className="space-y-6">
        <EncabezadoPagina sede="Todas las tiendas" titulo="Plan de campaña" subtitulo="Cuánto comprar por categoría para una campaña." />
        {falla ? (
          <Aviso tono="error">{falla}.</Aviso>
        ) : (
          <div className="card-cayla">
            <Vacio icono={<CalendarDays />} titulo="Todavía no hay ninguna campaña para planificar">
              Cuando exista una campaña, aquí armas cuánto comprar de cada categoría para ella.
            </Vacio>
          </div>
        )}
      </div>
    );
  }

  const estado = estadoCampana(plan.hoy, plan.plan.desde, plan.plan.hasta);
  const totales = totalesDelPlan(filas);

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Plan de campaña"
        subtitulo={`${plan.plan.nombre}, del ${fechaLargaES(plan.plan.desde)} al ${fechaLargaES(plan.plan.hasta)}: cuánto comprar por categoría, con tres escenarios. En enero, al lado, lo que se vendió de verdad.`}
      />

      <CifrasPlan totales={totales} estado={estado} />

      <Tabla>
        <Encabezado columnas={columnasDelPlan(estado)} plantilla={plantillaDelPlan(estado !== "antes")} />
        {filas.length === 0 ? (
          <Vacio tamano="chico" icono={<Tags />} accion={{ texto: "Ir a Categorías", href: "/productos/categorias" }}>
            No hay categorías activas.
          </Vacio>
        ) : (
          filas.map((f) => <FilaCategoria key={f.c.id} f={f} estado={estado} onAbrir={() => setAbierta(f.c)} />)
        )}
      </Tabla>

      <p className="nota-cayla">
        Cómo se calcula: con tus tres escenarios, el sistema compra según cuánto cuesta quedarse corto (lo que dejas de ganar) frente a
        sobrar (lo que pierdes al vender lo que queda más barato). Si lo que sobra se vende casi al mismo precio, conviene cubrir un
        diciembre bueno; si se pierde, conviene quedarse más cerca del flojo. No hay historia de ventas de diciembre en el ERP: estos
        números son tus supuestos, y en enero se comparan con lo que pasó.
      </p>

      {abierta && (
        <PlanCategoriaModal
          planId={plan.plan.id}
          planNombre={plan.plan.nombre}
          categoria={abierta}
          linea={plan.lineas.get(abierta.id)}
          stock={plan.stock.get(abierta.id) ?? 0}
          vendidoPorTalla={plan.vendidoPorTalla.get(abierta.id)}
          onClose={() => setAbierta(null)}
        />
      )}
    </div>
  );
}
