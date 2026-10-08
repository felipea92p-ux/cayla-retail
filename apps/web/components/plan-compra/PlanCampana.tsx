"use client";

import { useMemo, useState } from "react";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { Chip } from "@/components/ui/Chip";
import { PlanCategoriaModal } from "@/components/plan-compra/PlanCategoriaModal";
import { calcular, estadoCampana, fraseDeLoReal, leerPlan, type CategoriaPlan } from "@/lib/plan-compra-reglas";
import { CalendarDays, Tags } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Vacio } from "@/components/ui/Vacio";

// Compras ▸ Plan de campaña (ADR-0349). Una fila por categoría: sus tres escenarios, lo que ya hay en la red, cuánto comprar y cuánto
// cuesta; al abrirla, su ventana para armar o corregir el plan. Durante y después de la campaña, lo que se vendió de verdad al lado.
// Toda la cuenta vive en lib/plan-compra-reglas.ts (con su prueba); aquí solo se dibuja.

const entero = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 });
const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-PE", { day: "numeric", month: "long" });

export function PlanCampana({ datos, falla }: { datos: unknown; falla: string | null }) {
  const plan = useMemo(() => leerPlan(datos), [datos]);
  const [abierta, setAbierta] = useState<CategoriaPlan | null>(null);

  const filas = useMemo(() => {
    if (!plan) return [];
    return plan.categorias
      .map((c) => {
        const linea = plan.lineas.get(c.id);
        const stock = plan.stock.get(c.id) ?? 0;
        return { c, linea, stock, calculo: linea ? calcular(linea, stock) : null, vendido: plan.vendidoEnCampana.get(c.id) ?? 0 };
      })
      // Primero lo que ya tiene plan; después, las que tienen stock o venden (las que más importan para diciembre).
      .sort((a, b) => Number(!!b.linea) - Number(!!a.linea) || b.stock - a.stock || a.c.nombre.localeCompare(b.c.nombre, "es"));
  }, [plan]);

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
  const conPlan = filas.filter((f) => f.linea);
  const aComprar = conPlan.reduce((s, f) => s + (f.calculo?.comprar ?? 0), 0);
  const inversion = conPlan.reduce((s, f) => s + (f.calculo?.inversion ?? 0), 0);
  const vendidoTotal = filas.reduce((s, f) => s + f.vendido, 0);
  const verReal = estado !== "antes";

  const plantilla = verReal
    ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,1.4fr)]"
    : "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)]";
  const columnas: Columna[] = [
    { titulo: "Categoría" },
    { titulo: "Venta esperada", subtitulo: "flojo · normal · bueno" },
    { titulo: "Hay hoy", subtitulo: "en la red", alinear: "der" },
    { titulo: "Comprar", alinear: "der" },
    { titulo: "Inversión", subtitulo: "al costo", alinear: "der" },
    ...(verReal ? [{ titulo: estado === "durante" ? "Vendido hasta hoy" : "Lo que pasó" } as Columna] : []),
  ];

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede="Todas las tiendas"
        titulo="Plan de campaña"
        subtitulo={`${plan.plan.nombre}, del ${fechaLarga(plan.plan.desde)} al ${fechaLarga(plan.plan.hasta)}: cuánto comprar por categoría, con tres escenarios. En enero, al lado, lo que se vendió de verdad.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TarjetaCifra etiqueta="Categorías con plan" valor={`${conPlan.length} de ${filas.length}`}>
          {conPlan.length === 0 ? "Empieza por las que más venden" : "Las demás no suman a la compra"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Prendas a comprar" valor={entero.format(aComprar)}>
          Lo que conviene tener menos lo que ya hay
        </TarjetaCifra>
        <TarjetaCifra etiqueta={verReal ? "Vendido en la campaña" : "Inversión al costo"} valor={verReal ? entero.format(vendidoTotal) : soles(inversion)}>
          {verReal ? (estado === "durante" ? "Hasta hoy, todas las categorías" : "Todas las categorías") : "Solo las categorías con plan"}
        </TarjetaCifra>
      </div>

      <Tabla>
        <Encabezado columnas={columnas} plantilla={plantilla} />
        {filas.length === 0 ? (
          <Vacio tamano="chico" icono={<Tags />} accion={{ texto: "Ir a Categorías", href: "/productos/categorias" }}>
            No hay categorías activas.
          </Vacio>
        ) : (
          filas.map(({ c, linea, stock, calculo, vendido }) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAbierta(c)}
              className={`${fila(plantilla)} w-full text-left transition-colors hover:bg-sand/30`}
              aria-label={`${linea ? "Corregir" : "Armar"} el plan de ${c.nombre}`}
            >
              <span className={celda("izq", "font-medium text-tinta")}>{c.nombre}</span>
              <span className={celda("izq", "tabular-nums text-tinta/80")}>
                {linea ? (
                  `${entero.format(linea.flojo)} · ${entero.format(linea.normal)} · ${entero.format(linea.bueno)}`
                ) : (
                  <Chip tono="pizarra">Sin plan</Chip>
                )}
              </span>
              <span className={celda("der", "tabular-nums")}>
                <span className="text-taupe-profundo sm:hidden">Hay hoy: </span>
                {entero.format(stock)}
              </span>
              <span className={celda("der", "tabular-nums font-semibold text-tinta")}>
                <span className="font-normal text-taupe-profundo sm:hidden">Comprar: </span>
                {calculo ? entero.format(calculo.comprar) : "—"}
              </span>
              <span className={celda("der", "tabular-nums")}>
                <span className="text-taupe-profundo sm:hidden">Inversión: </span>
                {calculo ? soles(calculo.inversion) : "—"}
              </span>
              {verReal && (
                <span className={celda("izq", "text-sm text-tinta/75")}>
                  {linea ? fraseDeLoReal(vendido, linea) : `Se vendieron ${entero.format(vendido)}.`}
                </span>
              )}
            </button>
          ))
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
