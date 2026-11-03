"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, LayoutGrid, Palette, Ruler, Store, Tag } from "lucide-react";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { SegmentoEnlaces } from "@/components/ui/SegmentoEnlaces";
import { SelectorMes } from "@/components/ui/SelectorMes";
import { BuscadorRanking } from "@/components/reportes-ventas/BuscadorRanking";
import type { OpcionesRanking } from "@/lib/reportes-ranking";
import { paramDeMes, type Mes } from "@/lib/facturacion-reglas";
import { hayFiltros, hrefRanking, type FiltrosRanking, type PeriodoRanking, type RangoRanking } from "@/lib/reportes-ranking-reglas";

// Los filtros del Ranking de prendas (maqueta docs/maquetas/reportes-ventas-2026-11/): buscar un modelo, las fechas, la tienda, la categoría, la
// marca, la talla y el color; cómo verlo (por modelo o por color y talla) y qué ordena (prendas o soles). Todo vive en la URL: la pantalla es de
// servidor, el enlace se puede compartir y «atrás» vuelve al filtro anterior. Cada filtro puesto se ve como un chip que se quita con un toque, y
// «Limpiar todo» los quita juntos (el período y la forma de ver no son filtros: no se limpian). Cambiar cualquier cosa vuelve a la primera página.
const RANGOS: { valor: RangoRanking; texto: string }[] = [
  { valor: "7", texto: "Últimos 7 días" },
  { valor: "30", texto: "Últimos 30 días" },
  { valor: "90", texto: "Últimos 90 días" },
  { valor: "mes", texto: "Un mes" },
  { valor: "fechas", texto: "A tu medida" },
];

/** El último día incluido del período (el `hasta` de la base no se cuenta). */
const ultimoDia = (hastaExcl: string): string => new Date(Date.parse(`${hastaExcl}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function FiltrosRanking({
  f,
  periodo,
  hoy,
  opciones,
  tiendas,
}: {
  f: FiltrosRanking;
  periodo: PeriodoRanking;
  hoy: string;
  opciones: OpcionesRanking;
  /** Las tiendas que se pueden elegir; `null` si la cuenta ve una sola (la suya). */
  tiendas: { id: string; nombre: string }[] | null;
}) {
  const router = useRouter();
  const ir = (cambios: Partial<FiltrosRanking>) => router.push(hrefRanking(f, { pagina: 0, ...cambios }));
  const mesElegido: Mes = { anio: Number(periodo.desde.slice(0, 4)), mes: Number(periodo.desde.slice(5, 7)) };
  const actual: Mes = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };

  const nombreDe = <T extends { id: string }>(lista: T[], id: string | null, campo: keyof T): string | null => (id ? String((lista.find((x) => x.id === id) as T | undefined)?.[campo] ?? "") || null : null);
  const puestos: { clave: string; texto: string; quitar: Partial<FiltrosRanking> }[] = [];
  if (f.tienda) puestos.push({ clave: "tienda", texto: tiendas?.find((t) => t.id === f.tienda)?.nombre ?? "Una tienda", quitar: { tienda: null } });
  if (f.categoria) puestos.push({ clave: "categoria", texto: nombreDe(opciones.categorias, f.categoria, "nombre") ?? "Una categoría", quitar: { categoria: null } });
  if (f.marca) puestos.push({ clave: "marca", texto: nombreDe(opciones.marcas, f.marca, "nombre") ?? "Una marca", quitar: { marca: null } });
  if (f.talla) puestos.push({ clave: "talla", texto: `Talla ${nombreDe(opciones.tallas, f.talla, "valor") ?? ""}`.trim(), quitar: { talla: null } });
  if (f.color) puestos.push({ clave: "color", texto: opciones.colores.find((c) => c.codigo === f.color)?.nombre ?? f.color, quitar: { color: null } });
  if (f.q) puestos.push({ clave: "q", texto: `«${f.q}»`, quitar: { q: "" } });

  const combo = (icono: typeof Tag, etiqueta: string, todas: string, valor: string | null, lista: { valor: string; texto: string }[], campo: keyof FiltrosRanking) =>
    lista.length === 0 ? null : (
      <DesplegablePildora icono={icono} etiqueta={etiqueta} valor={valor ?? TODOS} onValor={(v) => ir({ [campo]: v === TODOS ? null : v } as Partial<FiltrosRanking>)} opciones={[{ valor: TODOS, texto: todas }, ...lista]} />
    );

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <BuscadorRanking valor={f.q} />
        <DesplegablePildora
          icono={CalendarDays}
          etiqueta="Fechas"
          valor={f.rango}
          valorPorDefecto="30"
          onValor={(v) => {
            const rango = v as RangoRanking;
            // Al pasar a «a tu medida» el campo arranca con lo que se estaba mirando; a «un mes», en el mes de hoy.
            ir(rango === "fechas" ? { rango, desde: periodo.desde, hasta: ultimoDia(periodo.hasta) } : rango === "mes" ? { rango, mes: paramDeMes(mesElegido) } : { rango });
          }}
          opciones={RANGOS}
        />
        {f.rango === "mes" && <SelectorMes valor={mesElegido} actual={actual} onCambiar={(m) => ir({ rango: "mes", mes: paramDeMes(m) })} />}
        {f.rango === "fechas" && (
          <>
            <CampoFecha etiqueta="Desde" valor={f.desde ?? periodo.desde} onValor={(v) => FECHA.test(v) && ir({ rango: "fechas", desde: v, hasta: f.hasta ?? ultimoDia(periodo.hasta) })} />
            <CampoFecha etiqueta="Hasta" valor={f.hasta ?? ultimoDia(periodo.hasta)} onValor={(v) => FECHA.test(v) && ir({ rango: "fechas", hasta: v, desde: f.desde ?? periodo.desde })} />
          </>
        )}
        {tiendas && tiendas.length > 1 && combo(Store, "Tienda", "Todas las tiendas", f.tienda, tiendas.map((t) => ({ valor: t.id, texto: t.nombre })), "tienda")}
        <span className="flex-1" />
        <SegmentoEnlaces
          etiquetaAccesible="Cómo ver el ranking"
          activo={f.nivel}
          opciones={[
            { valor: "modelo", etiqueta: "Por modelo", href: hrefRanking(f, { nivel: "modelo", pagina: 0 }) },
            { valor: "variante", etiqueta: "Por color y talla", href: hrefRanking(f, { nivel: "variante", pagina: 0 }) },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {combo(LayoutGrid, "Categoría", "Todas las categorías", f.categoria, opciones.categorias.map((c) => ({ valor: c.id, texto: c.nombre })), "categoria")}
        {combo(Tag, "Marca", "Todas las marcas", f.marca, opciones.marcas.map((m) => ({ valor: m.id, texto: m.nombre })), "marca")}
        {combo(Ruler, "Talla", "Todas las tallas", f.talla, opciones.tallas.map((t) => ({ valor: t.id, texto: t.valor })), "talla")}
        {combo(Palette, "Color", "Todos los colores", f.color, opciones.colores.map((c) => ({ valor: c.codigo, texto: c.nombre })), "color")}
        <span className="flex-1" />
        <SegmentoEnlaces
          etiquetaAccesible="Qué ordena el ranking"
          activo={f.orden}
          opciones={[
            { valor: "unidades", etiqueta: "Prendas", href: hrefRanking(f, { orden: "unidades", pagina: 0 }) },
            { valor: "soles", etiqueta: "Soles", href: hrefRanking(f, { orden: "soles", pagina: 0 }) },
          ]}
        />
      </div>

      {puestos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {puestos.map((p) => (
            <FiltroPuesto key={p.clave} etiqueta={`Quitar el filtro ${p.texto}`} onQuitar={() => ir(p.quitar)}>
              {p.texto}
            </FiltroPuesto>
          ))}
          {hayFiltros(f) && <BotonLimpiar href={hrefRanking(f, { tienda: null, categoria: null, marca: null, talla: null, color: null, q: "", pagina: 0 })}>Limpiar todo</BotonLimpiar>}
        </div>
      )}
    </div>
  );
}
