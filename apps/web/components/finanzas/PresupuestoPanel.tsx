"use client";

import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Chip } from "@/components/ui/Chip";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { PieTabla, SelectFin, Superficie } from "@/components/finanzas/kit";
import { mesDe, mesesRecientes, solesRedondo } from "@/lib/gastos-reglas";
import { mesTitulo } from "@/lib/resultados-reglas";
import {
  anchoBarra,
  bajadaAvance,
  bloquesPpto,
  chipPpto,
  csvPresupuesto,
  explicarProyeccion,
  fraseSinTope,
  leerVerPpto,
  nombreCortoPpto,
  tituloAvance,
  unidadesParaVer,
  type FilaPpto,
} from "@/lib/presupuesto-reglas";

// Finanzas ▸ Reportes ▸ Presupuesto (ADR-0195, capa «para decidir»), dibujado como el spike aprobado
// (docs/maquetas/finanzas-2026-09/, `vista-reportes.js` → `vistaPresupuesto`): cabecera «¿Vamos según lo planeado?» con
// «Ver» → pestañas → UNA tarjeta con el mes y el cuadro (un bloque por unidad: las ventas contra la meta del día y cada rubro
// contra su tope) → la nota. La pantalla no calcula plata: todo viene de `fn_presupuesto_vs_real`.

const entra = (i: number, clase = "") => ({
  className: `anim-entra ${clase}`.trim(),
  style: { ["--i" as string]: i } as CSSProperties,
});

export function PresupuestoPanel({
  filas,
  esLider,
  sedeActual,
  tiendaNombre,
  verParam,
  mes,
  hoy,
  fallas,
}: {
  filas: FilaPpto[];
  esLider: boolean;
  sedeActual: string | null;
  tiendaNombre: string | null;
  verParam: string | undefined;
  mes: string;
  hoy: string;
  fallas: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();

  const ver = leerVerPpto(verParam, filas, esLider, sedeActual);
  const bloques = useMemo(() => bloquesPpto(filas, ver), [filas, ver]);
  const unidades = useMemo(() => unidadesParaVer(filas), [filas]);
  const conTope = bloques.some((b) => b.filas.some((f) => f.tipo === "tope"));
  const libres = bloques.map((b) => ({ b, frase: fraseSinTope(b.sinTope) })).filter((x) => x.frase && (ver !== "todas" || x.b.unidad !== "consolidado"));

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  const descargar = () => {
    const url = URL.createObjectURL(new Blob([csvPresupuesto(bloques)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `presupuesto-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Los meses: los 12 últimos y el que viene (el presupuesto se pone antes de que el mes empiece).
  const meses = useMemo(() => {
    const [a, m] = mesDe(hoy).split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(a, m, 1));
    const siguiente = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return [siguiente, ...mesesRecientes(hoy, 12)];
  }, [hoy]);

  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana="presupuesto"
        titulo="¿Vamos según lo planeado?"
        bajada="Lo que pusiste como meta y como tope en Configuración, contra lo que va pasando. La proyección supone que el resto del mes sigue al mismo ritmo."
        acciones={
          <>
            {esLider ? (
              <label className="fin-ver">
                <span className="label-cayla text-[11px] text-taupe">Ver</span>
                <SelectFin
                  etiqueta="Qué mirar"
                  valor={ver}
                  onValor={(v) => ir({ ver: v })}
                  opciones={[{ valor: "todas", texto: "Todas las tiendas" }, ...unidades.map((u) => ({ valor: u.clave, texto: u.nombre }))]}
                />
              </label>
            ) : (
              <Chip versalitas={false}>{tiendaNombre ?? bloques[0]?.nombre ?? "Tu tienda"}</Chip>
            )}
            <button type="button" className="btn-cayla btn-secundario" onClick={descargar} disabled={!bloques.length}>
              Descargar Excel
            </button>
          </>
        }
      />

      {fallas.map((f) => (
        <p key={f} className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">
          {f}
        </p>
      ))}

      <div {...entra(1)}>
        <Superficie>
          <div className="fin-herramientas justify-between">
            <div className="fin-herramientas-titulo min-w-0 flex-1 basis-[420px]">
              <b>{tituloAvance(mes, filas)}</b>
              <p>{bajadaAvance(filas[0]?.momento)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <SelectFin
                etiqueta="Mes"
                className="fin-mes-chico"
                valor={mes}
                onValor={(v) => ir({ mes: v })}
                opciones={meses.map((m) => ({ valor: m, texto: `${mesTitulo(m)}${m === mesDe(hoy) ? " · a la fecha" : ""}` }))}
              />
              {esLider && (
                <Link href={`/configuracion?tab=presupuesto&mes=${mes}`} className="btn-cayla btn-secundario btn-chico">
                  Cambiar metas y topes
                </Link>
              )}
            </div>
          </div>

          {bloques.length ? (
            <div className="fin-tabla-wrap">
              <table className="fin-tabla fin-ppto">
                <thead>
                  <tr>
                    <th scope="col">Rubro</th>
                    <th scope="col" className="fin-num">
                      Meta o tope
                    </th>
                    <th scope="col" className="fin-num">
                      A la fecha
                    </th>
                    <th scope="col" className="fin-num">
                      Al cierre
                    </th>
                    <th scope="col" className="fin-ppto-avance">
                      Avance
                    </th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                {bloques.map((b) => (
                  <tbody key={b.clave}>
                    <tr className="fin-grupo">
                      <td colSpan={6} className="fin-ancha">
                        {b.unidad === "consolidado" ? "CAYLA · suma de todo" : b.nombre}
                      </td>
                    </tr>
                    {b.filas.map((f) => (
                      <FilaCuadro key={f.linea} f={f} />
                    ))}
                    {b.filas.length === 0 && (
                      <tr>
                        <td colSpan={6} className="fin-ancha fin-tenue">
                          Sin topes este mes.
                        </td>
                      </tr>
                    )}
                  </tbody>
                ))}
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-sm text-taupe">No hay nada que mostrar para este mes.</p>
          )}

          {(libres.length > 0 || (!conTope && bloques.length > 0)) && (
            <PieTabla>
              <ul className="fin-avisos">
                {!conTope && (
                  <li>
                    <Chip tono="pizarra">Ojo</Chip>
                    <span>
                      {mesTitulo(mes)} todavía no tiene topes de gasto.{" "}
                      {esLider ? (
                        <Link href={`/configuracion?tab=presupuesto&mes=${mes}`} className="btn-enlace">
                          Ponerlos en Configuración
                        </Link>
                      ) : (
                        "Los pone el líder en Configuración."
                      )}
                    </span>
                  </li>
                )}
                {libres.map(({ b, frase }) => (
                  <li key={b.clave}>
                    <span>
                      <b className="font-semibold text-tinta">{b.unidad === "consolidado" ? "CAYLA" : nombreCortoPpto(b.nombre)}:</b> {frase}
                    </span>
                  </li>
                ))}
              </ul>
            </PieTabla>
          )}
        </Superficie>
      </div>

      <div {...entra(2, "nota-cayla")}>
        El presupuesto no frena nada: nadie queda bloqueado por pasarse. Sirve para ver <b>a tiempo</b> en qué se va la plata, antes de que
        el mes cierre.
      </div>
    </div>
  );
}

function FilaCuadro({ f }: { f: FilaPpto }) {
  const chip = chipPpto(f);
  const ancho = anchoBarra(f);
  return (
    <tr>
      <td className="fin-ancha" data-l="Rubro">
        {f.tipo === "meta" ? (
          <>
            <b>Ventas</b> <span className="fin-tenue">(suma de las metas del día, sin IGV)</span>
          </>
        ) : (
          <>
            {f.lineaNombre} <span className="fin-tenue">(tope)</span>
          </>
        )}
      </td>
      <td className="fin-num" data-l={f.tipo === "meta" ? "Meta" : "Tope"}>
        {f.presupuesto === null ? <span className="fin-tenue">—</span> : solesRedondo(f.presupuesto)}
      </td>
      <td className="fin-num" data-l="A la fecha">
        {f.momento === "por_venir" ? <span className="fin-tenue">—</span> : solesRedondo(f.aLaFecha)}
      </td>
      <td className="fin-num" data-l="Al cierre" title={explicarProyeccion(f)}>
        {f.proyeccion === null ? <span className="fin-tenue">—</span> : solesRedondo(f.proyeccion)}
      </td>
      <td data-l="Avance">
        <div
          className="fin-umbral-barra fin-fina"
          data-tono={f.sePasa ? "rojo" : undefined}
          role="img"
          aria-label={f.presupuesto ? `${Math.round(ancho)} % ${f.tipo === "meta" ? "de la meta" : "del tope"} al cierre` : "sin meta"}
        >
          <i style={{ width: `${ancho}%` }} />
        </div>
      </td>
      <td data-l="Estado">
        <Chip tono={chip.tono}>{chip.texto}</Chip>
      </td>
    </tr>
  );
}
