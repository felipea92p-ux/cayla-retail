"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { CabeceraReportes } from "@/components/finanzas/CabeceraReportes";
import { Herramientas, ListaDatos, PieTabla, SelectFin, Superficie } from "@/components/finanzas/kit";
import { fechaCorta, mesDe, mesesRecientes, rangoMes } from "@/lib/gastos-reglas";
import {
  avisosER,
  claveUnidad,
  columnasER,
  conceptosER,
  csvEstado,
  deltaTexto,
  fuentesDe,
  leerLineaDiario,
  leerVerER,
  mesNombre,
  mesTitulo,
  montoNatural,
  nombreCorto,
  origenDeCifra,
  porcentaje,
  solesER,
  type ConceptoER,
  type FilaER,
  type LineaDiario,
} from "@/lib/resultados-reglas";

// Finanzas ▸ Reportes ▸ Estado de resultados (ADR-0195 F5), dibujado como el spike aprobado (docs/maquetas/finanzas-2026-09/,
// `vista-reportes.js` → `vistaResultados`): cabecera «¿Ganamos?» con «Ver» → pestañas → UNA tarjeta con el mes, «Comparar» y
// el cuadro (conceptos en filas, unidades en columnas, CAYLA al final) → dos notas. Cada cifra se puede tocar: abre las
// líneas del diario de las que sale. La pantalla no calcula plata: todo viene de `fn_estado_resultados`.

const entra = (i: number, clase = "") => ({
  className: `anim-entra ${clase}`.trim(),
  style: { ["--i" as string]: i } as CSSProperties,
});

type Origen = { concepto: ConceptoER; columna: FilaER };

export function EstadoResultadosPanel({
  filas,
  anteriores,
  esLider,
  sedeActual,
  verParam,
  mes,
  mesPrevio,
  hoy,
  comparar,
  fallas,
}: {
  filas: FilaER[];
  anteriores: FilaER[] | null;
  esLider: boolean;
  sedeActual: string | null;
  verParam: string | undefined;
  mes: string;
  mesPrevio: string;
  hoy: string;
  comparar: boolean;
  fallas: string[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [origen, setOrigen] = useState<Origen | null>(null);

  const ver = leerVerER(verParam, filas, esLider, sedeActual);
  const columnas = useMemo(() => columnasER(filas, ver), [filas, ver]);
  const conceptos = useMemo(() => conceptosER(columnas), [columnas]);
  const previas = useMemo(() => new Map((anteriores ?? []).map((f) => [claveUnidad(f), f])), [anteriores]);
  const enCurso = mes === mesDe(hoy);
  const avisos = avisosER(columnas, enCurso);
  const unidades = filas.filter((f) => f.unidad !== "consolidado");
  const ventasDe = (f: FilaER) => f.ventas;

  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    router.push(`${ruta}?${p.toString()}`, { scroll: false });
  };

  const descargar = () => {
    const url = URL.createObjectURL(
      new Blob([csvEstado(conceptos, columnas, mes)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `estado-de-resultados-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <CabeceraReportes
        pestana="resultados"
        titulo="¿Ganamos?"
        bajada="Salen solos del diario que arma el sistema con cada venta, compra, gasto y movimiento de caja (ADR-0198). Nadie escribe un asiento."
        acciones={
          <>
            {esLider ? (
              <label className="fin-ver">
                <span className="label-cayla text-[11px] text-taupe">Ver</span>
                <SelectFin value={ver} onChange={(e) => ir({ ver: e.target.value })} aria-label="Qué mirar">
                  <option value="todas">Todas las tiendas</option>
                  {unidades
                    .filter((u) => u.ubicacionId)
                    .map((u) => (
                      <option key={u.ubicacionId} value={u.ubicacionId ?? ""}>
                        {u.nombre}
                      </option>
                    ))}
                  {unidades.some((u) => u.unidad === "empresa") && <option value="empresa">De la empresa</option>}
                </SelectFin>
              </label>
            ) : (
              <Chip versalitas={false}>{columnas[0]?.nombre ?? "Tu tienda"}</Chip>
            )}
            <button type="button" className="btn-cayla btn-secundario" onClick={descargar} disabled={!columnas.length}>
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
          <Herramientas>
            <SelectFin value={mes} onChange={(e) => ir({ mes: e.target.value })} aria-label="Mes">
              {mesesRecientes(hoy, 12).map((m) => (
                <option key={m} value={m}>
                  {mesTitulo(m)}
                  {m === mesDe(hoy) ? " · a la fecha" : ""}
                </option>
              ))}
            </SelectFin>
            <label className="btn-cayla btn-sutil gap-2">
              <input type="checkbox" checked={comparar} onChange={(e) => ir({ comparar: e.target.checked ? "1" : null })} />
              Comparar con {mesNombre(mesPrevio)}
            </label>
            <span className="ml-auto text-[12.5px] text-taupe">Toca una cifra para ver de qué filas sale.</span>
          </Herramientas>

          {columnas.length ? (
            <div className="fin-tabla-wrap">
              <table className="fin-eerr">
                <thead>
                  <tr>
                    <th scope="col">Concepto</th>
                    <th scope="col" style={{ textAlign: "left" }}>
                      Cuenta
                    </th>
                    {columnas.map((c) => (
                      <th key={claveUnidad(c)} scope="col" className={c.unidad === "consolidado" ? "fin-eerr-cons" : undefined}>
                        {nombreCorto(c)}
                        <span className="fin-delta">{subtituloColumna(c, enCurso)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conceptos.map((k) => {
                    const fila = (
                      <tr key={k.clave} className={k.tipo === "sub" ? "fin-eerr-sub" : k.tipo === "total" ? "fin-eerr-total" : undefined}>
                        <td>{k.nombre}</td>
                        <td className="fin-eerr-cta">{k.cuenta}</td>
                        {columnas.map((c) => (
                          <Celda
                            key={claveUnidad(c)}
                            concepto={k}
                            columna={c}
                            previa={comparar ? (previas.get(claveUnidad(c)) ?? null) : null}
                            mesPrevio={mesPrevio}
                            onAbrir={() => setOrigen({ concepto: k, columna: c })}
                          />
                        ))}
                      </tr>
                    );
                    if (k.tipo === "linea") return fila;
                    return [
                      fila,
                      <tr key={`${k.clave}-pct`} className="fin-eerr-pct">
                        <td />
                        <td />
                        {columnas.map((c) => {
                          const p = porcentaje(k.valor(c), ventasDe(c));
                          return (
                            <td key={claveUnidad(c)} className={c.unidad === "consolidado" ? "fin-eerr-cons" : undefined}>
                              {p ? `${p} de la venta` : ""}
                            </td>
                          );
                        })}
                      </tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-8 text-sm text-taupe">No hay números que mostrar para este mes.</p>
          )}

          {avisos.length > 0 && (
            <PieTabla>
              <ul className="fin-avisos">
                {avisos.map((a) => (
                  <li key={a.texto}>
                    <Chip tono={a.tono}>{a.tono === "rojo" ? "No cuadra" : a.tono === "ambar" ? "Ojo" : "Nota"}</Chip>
                    <span>{a.texto}</span>
                  </li>
                ))}
              </ul>
            </PieTabla>
          )}
        </Superficie>
      </div>

      {esLider ? (
        <div {...entra(2, "fin-dos-col")}>
          <div className="nota-cayla">
            <b>El Taller no le vende a las tiendas</b> (D-31): lo que cuesta la tela, los avíos y la maquila de cada prenda entra en el
            «costo de lo vendido» de la tienda que la vende. Su columna muestra lo que el Taller gasta para producir (su planilla, su local,
            sus máquinas): Producción ▸ Eficiencia dice cuánto de eso le toca a cada prenda.
          </div>
          <div className="nota-cayla">
            <b>«De la empresa»</b> son los gastos que no son de ninguna tienda (contador, publicidad, software, sueldo de oficina, D-32).
            Aparecen solo ahí y en CAYLA. No se reparten entre tiendas: repartirlos sería inventar un número.
          </div>
        </div>
      ) : (
        <div {...entra(2, "nota-cayla")}>
          Estos son los números de <b>tu tienda</b>. Los gastos que no son de ninguna tienda (contador, publicidad, oficina) y los del
          Taller no se reparten entre las tiendas: los ve el líder, en CAYLA.
        </div>
      )}

      {origen && <OrigenCifra origen={origen} mes={mes} onCerrar={() => setOrigen(null)} />}
    </div>
  );
}

function subtituloColumna(c: FilaER, enCurso: boolean): string {
  if (c.unidad === "consolidado") return "suma de todo";
  if (c.unidad === "empresa") return "sin tienda";
  if (c.unidad === "taller") return "no vende";
  return enCurso ? "a la fecha" : "";
}

function Celda({
  concepto: k,
  columna: c,
  previa,
  mesPrevio,
  onAbrir,
}: {
  concepto: ConceptoER;
  columna: FilaER;
  previa: FilaER | null;
  mesPrevio: string;
  onAbrir: () => void;
}) {
  const v = k.valor(c);
  const cons = c.unidad === "consolidado" ? "fin-eerr-cons" : "";
  // Como el spike: una línea en cero, o el margen de quien no vende, es «—» (no «S/ 0»).
  if ((k.tipo === "linea" || (k.tipo === "sub" && c.ventas === 0)) && Math.round(v) === 0) {
    return <td className={`${cons} fin-eerr-vacia`}>—</td>;
  }
  const delta = previa && (k.tipo !== "linea" || k.clave === "ventas") ? deltaTexto(v, k.valor(previa), mesPrevio) : null;
  const neg = k.tipo !== "linea" && v < 0 ? "fin-eerr-neg" : "";
  const contenido = (
    <>
      {solesER(v)}
      {delta && <span className="fin-delta">{delta}</span>}
    </>
  );
  return (
    <td className={`${cons} ${neg}`}>
      {k.tipo === "linea" ? (
        <button type="button" className="fin-eerr-celda" onClick={onAbrir} aria-label={`De dónde sale: ${k.nombre}, ${nombreCorto(c)}`}>
          {contenido}
        </button>
      ) : (
        contenido
      )}
    </td>
  );
}

/** «De dónde sale»: las líneas del diario detrás de una cifra, agrupadas por la operación que las generó. */
function OrigenCifra({ origen: { concepto: k, columna: c }, mes, onCerrar }: { origen: Origen; mes: string; onCerrar: () => void }) {
  const [lineas, setLineas] = useState<LineaDiario[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const { desde, hasta } = rangoMes(mes);
    createClient()
      .rpc(
        "fn_asientos" as never,
        {
          p_desde: desde,
          p_hasta: hasta,
          p_ubicacion_id: c.ubicacionId,
        } as never,
      )
      .then(({ data, error: e }) => {
        if (!vivo) return;
        if (e) setError(e.message);
        else setLineas(((data ?? []) as Record<string, unknown>[]).map(leerLineaDiario));
      });
    return () => {
      vivo = false;
    };
  }, [mes, c.ubicacionId]);

  const o = lineas ? origenDeCifra(lineas, k.cuentas, claveUnidad(c)) : null;
  const fuentes = fuentesDe(k.clave);
  return (
    <Modal
      variante="hoja"
      titulo={
        <>
          <span className="label-cayla mb-1 block font-sans text-[11px] font-semibold text-taupe">De dónde sale</span>
          {k.nombre} · {c.unidad === "consolidado" ? "CAYLA" : c.nombre}
        </>
      }
      subtitulo={`${mesTitulo(mes)} · ${solesER(Math.abs(k.valor(c)))}`}
      onClose={onCerrar}
      ancho="max-w-[560px]"
    >
      <p className="text-[13px] leading-relaxed text-taupe">
        <b className="font-semibold text-tinta">Sale de</b> {fuentes.join("; ")}.
      </p>
      {o && o.porRegla.length > 0 && (
        <ListaDatos
          filas={o.porRegla.map((g) => ({
            dato: `${g.texto} · ${g.n} ${g.n === 1 ? "línea" : "líneas"}`,
            valor: solesER(g.monto),
          }))}
        />
      )}
      {error && <p className="mt-3 text-sm text-rojo-profundo">No se pudieron leer las líneas: {error}</p>}
      {!o && !error && (
        <ul className="fin-lista mt-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <span className="h-3 w-40 rounded bg-hueso" />
              <span className="h-3 w-16 rounded bg-hueso" />
            </li>
          ))}
        </ul>
      )}
      {o && o.mayores.length > 0 && (
        <>
          <p className="label-cayla mb-1 mt-4 text-[11px] text-taupe">Las más grandes</p>
          <ListaDatos
            filas={o.mayores.map((l) => ({
              dato: `${fechaCorta(l.fecha)} · ${l.glosa}`,
              valor: solesER(montoNatural(l)),
            }))}
          />
        </>
      )}
      <p className="mt-3 text-[12.5px] text-taupe">
        Cada cifra es la suma de líneas del diario, y cada línea sabe de qué fila salió. Nada se tipea aquí.
      </p>
      <div className="fin-botones">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </Modal>
  );
}
