"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, CircleCheck, CircleMinus, HandCoins, RefreshCw, TrendingDown, TriangleAlert, Truck, Users } from "lucide-react";
import type { Proveedor, ResumenProveedores } from "@/lib/proveedores";
import type { Hallazgo } from "@/lib/proveedor-analisis-reglas";
import { soles } from "@/lib/compras-reglas";
import { contarPorRitmo, paraHoy, totalesDelRanking, type FilaRanking, type FiltroRanking } from "@/lib/proveedores-ranking-reglas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";

// La columna derecha del ranking: «Qué hacer» (forma «B», elegida por Felipe el 2026-10-26 mirando la maqueta
// docs/maquetas/proveedores-lado-2026-10/). Antes eran tarjetas con párrafos («hay demasiado texto… no me dan ganas ni de leer»): ahora es una
// lista de tareas, cada una con un verbo, un número y una flecha, y tocarla HACE algo: lleva a pagar o a recibir, filtra la tabla por ritmo o
// abre al proveedor. Lo urgente va arriba y en rojo. Lo que no pide hacer nada (cuánto se vendió, el costo por confirmar, los que no reciben
// compras) queda en una línea gris al pie. Las cuentas siguen en `proveedores-ranking-reglas.ts` y `proveedor-analisis-reglas.ts`.

/** La caja de cada tarjeta de la columna derecha: «Qué hacer» y «Comparar» (lo pegado al bajar lo pone `ConLado`). */
export const CLASE_LADO = "card-cayla space-y-5 p-4";

type Tono = "urgente" | "bien" | "normal";

type Tarea = {
  clave: string;
  tono: Tono;
  icono: ReactNode;
  /** El verbo en negrita y lo que sigue. */
  verbo: string;
  resto: string;
  cifra: string;
  ayuda: string;
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never } | { href?: never; onClick?: never });

const ICONO = "h-4 w-4";
const TONO_ICONO: Record<Tono, string> = { urgente: "text-rojo-profundo", bien: "text-verde", normal: "text-tinta/70" };

function FilaTarea({ t, i }: { t: Tarea; i: number }) {
  const cuerpo = (
    <>
      <span aria-hidden className={`grid place-items-center ${TONO_ICONO[t.tono]}`}>
        {t.icono}
      </span>
      <span className="min-w-0 text-[14.5px] leading-snug text-tinta">
        <b className="font-semibold">{t.verbo}</b> {t.resto}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${t.tono === "urgente" ? "text-rojo-profundo" : "text-tinta"}`}>{t.cifra}</span>
      {t.href || t.onClick ? (
        <ChevronRight aria-hidden className="h-4 w-4 text-taupe transition-transform duration-300 ease-cayla group-hover:translate-x-[3px]" />
      ) : (
        <span aria-hidden />
      )}
    </>
  );
  const clase =
    "group anim-entra grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto_1rem] items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition-colors duration-200 hover:bg-hueso/70";
  const estilo = { ["--i" as string]: i };
  if (t.href)
    return (
      <Link href={t.href} className={clase} style={estilo} title={t.ayuda}>
        {cuerpo}
      </Link>
    );
  if (t.onClick)
    return (
      <button type="button" onClick={t.onClick} className={clase} style={estilo} title={t.ayuda}>
        {cuerpo}
      </button>
    );
  return (
    <div className={clase.replace(" hover:bg-hueso/70", "")} style={estilo} title={t.ayuda}>
      {cuerpo}
    </div>
  );
}

export function ProveedoresLoQueNoSeVe({
  proveedores,
  resumen,
  filas,
  hallazgos,
  onAbrir,
  onFiltrar,
  soloHoy = false,
}: {
  /** Los proveedores de mercadería activos (lo de hoy se cuenta sobre ellos, tengan compras o no). */
  proveedores: readonly Proveedor[];
  resumen: ResumenProveedores | null;
  /** Todas las filas del ranking, sin filtrar: los totales y la cuenta por ritmo son de todos. */
  filas: readonly FilaRanking[];
  hallazgos: readonly Hallazgo[];
  onAbrir: (id: string) => void;
  /** Deja la tabla con un ritmo: el mismo filtro «Ritmo» de la barra. */
  onFiltrar: (f: FiltroRanking) => void;
  /**
   * Mientras se compara, solo lo de hoy, debajo de «Comparar» (Formidable 2026-10-26: al marcar uno se perdían lo vencido y las entregas
   * atrasadas, que no se ven en otro lado). Sin nada urgente, no dibuja nada.
   */
  soloHoy?: boolean;
}) {
  const hoy = paraHoy(proveedores);
  const totales = totalesDelRanking(filas);
  const vendidas = filas.reduce((a, f) => a + f.unidadesVendidas, 0);
  const vendidoPct = totales.prendas > 0 ? Math.round((vendidas / totales.prendas) * 100) : 0;
  const ritmo = contarPorRitmo(filas);
  const sin90 = resumen?.sinCompras90d ?? 0;
  const nombres = (xs: readonly Proveedor[]) => xs.slice(0, 3).map((p) => p.nombre).join(", ") + (xs.length > 3 ? ` y ${xs.length - 3} más` : "");

  // Lo de hoy: pide actuar ya.
  const urgentes: Tarea[] = [];
  if (hoy.vencidos.length > 0)
    urgentes.push({ clave: "vencido", tono: "urgente", icono: <TriangleAlert className={ICONO} />, verbo: "Paga", resto: "lo vencido", cifra: soles(hoy.vencido), href: "/compras/por-pagar", ayuda: `Vencido con ${nombres(hoy.vencidos)}. Págalo antes de pedirles más.` });
  if (hoy.atrasados.length > 0)
    urgentes.push({ clave: "atrasadas", tono: "urgente", icono: <Truck className={ICONO} />, verbo: "Reclama", resto: hoy.atrasadas === 1 ? "la entrega atrasada" : "las entregas atrasadas", cifra: String(hoy.atrasadas), href: "/compras/recibir", ayuda: `De ${nombres(hoy.atrasados)}.` });
  if (hoy.aFavor.length > 0)
    urgentes.push({ clave: "favor", tono: "bien", icono: <HandCoins className={ICONO} />, verbo: "Descuenta", resto: "lo que te deben", cifra: soles(hoy.favor), href: "/compras/por-pagar", ayuda: `Notas de crédito de ${nombres(hoy.aFavor)}: se descuentan al pagarles.` });
  if (soloHoy && urgentes.length === 0) return null;

  // Antes de volver a comprar: lo que pide una decisión, no hoy.
  const decisiones: Tarea[] = [];
  if (ritmo.lento > 0)
    decisiones.push({ clave: "frena", tono: "normal", icono: <CircleMinus className={`${ICONO} text-ambar`} />, verbo: "Frena", resto: "compras", cifra: String(ritmo.lento), onClick: () => onFiltrar("lento"), ayuda: "Vender lo que les queda tardaría 16 semanas o más. Toca para verlos en la tabla." });
  if (ritmo.rapido > 0)
    decisiones.push({ clave: "repon", tono: "normal", icono: <RefreshCw className={`${ICONO} text-verde`} />, verbo: "Repón", resto: "a los que se agotan", cifra: String(ritmo.rapido), onClick: () => onFiltrar("rapido"), ayuda: "Lo que les queda se acaba en 6 semanas o menos. Toca para verlos en la tabla." });
  // Los avisos de dinero que la tabla no dice (solo salen con costo real): margen bajo y depender de uno solo. Abren al proveedor.
  for (const h of hallazgos) {
    if (!h.proveedorId) continue;
    const nombre = proveedores.find((p) => p.id === h.proveedorId)?.nombre ?? "";
    if (h.id.startsWith("margen-"))
      decisiones.push({ clave: h.id, tono: "normal", icono: <TrendingDown className={ICONO} />, verbo: "Pide mejor costo", resto: `a ${nombre}`, cifra: "", onClick: () => onAbrir(h.proveedorId!), ayuda: h.titulo });
    else if (h.id === "dependencia")
      decisiones.push({ clave: h.id, tono: "normal", icono: <Users className={ICONO} />, verbo: "Ten otro proveedor", resto: `además de ${nombre}`, cifra: "", onClick: () => onAbrir(h.proveedorId!), ayuda: h.titulo });
  }

  const tareas = soloHoy
    ? urgentes
    : [
        ...(urgentes.length > 0 ? urgentes : [{ clave: "al-dia", tono: "bien" as const, icono: <CircleCheck className={ICONO} />, verbo: "Al día:", resto: "nada vencido ni atrasado", cifra: "", ayuda: "Ningún comprobante vencido ni entrega atrasada." }]),
        ...decisiones,
      ];

  // Lo que no pide hacer nada: una línea gris, al pie.
  const pie = [
    totales.prendas > 0 ? `${vendidoPct} % vendido de ${totales.prendas.toLocaleString("es-PE")} prendas` : null,
    totales.cargaPct >= 1 ? `costos por confirmar: el ${Math.round(totales.cargaPct)} % vino en la carga inicial` : null,
    sin90 > 0 ? `${sin90} sin compra en 90 días` : null,
  ].filter(Boolean);

  return (
    <aside data-guia={soloHoy ? undefined : "proveedores.lado"} aria-label={soloHoy ? "Para hoy" : undefined} className="card-cayla p-3">
      <div className="px-2.5 pb-1 pt-1">
        <TituloSeccion>{soloHoy ? "Para hoy" : "Qué hacer"}</TituloSeccion>
      </div>
      <div className="divide-y divide-sand/70" data-guia={soloHoy ? undefined : "proveedores.para-hoy"}>
        {tareas.map((t, i) => (
          <FilaTarea key={t.clave} t={t} i={i} />
        ))}
      </div>
      {!soloHoy && pie.length > 0 && <p className="mx-2.5 mt-2 border-t border-sand pt-2.5 text-xs leading-relaxed text-taupe">{pie.join(" · ")}</p>}
    </aside>
  );
}
