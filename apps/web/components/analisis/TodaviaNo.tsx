"use client";

import Link from "next/link";
import { useAnalisis } from "@/components/analisis/contexto";
import { Anillo, ChipEstado, pct, Racha, TilePrenda, NombreCorto } from "@/components/analisis/piezas";
import type { PreparacionAnalisis } from "@/lib/analisis-tipos";
import { esTallaUnica, plural } from "@/lib/analisis-reglas";
import { DIAS_SOSTENIDOS, diaAntes, fechaCorta } from "@/lib/motor-demanda-reglas";

// Análisis v4 (ADR-0357): cuando la tienda todavía no cumple las tres condiciones del motor (ADR-0346), Análisis se calla y
// dice qué falta, con un botón para cada cosa. Es la misma vara que CAYLA Global y Tareas: una sola regla para todo el ERP.

const META = 90;

/** Las cifras de los últimos 30 días de una tienda: vendidas, con su prenda y sin ella. */
function ventas30(p: PreparacionAnalisis | undefined) {
  if (!p) return { unidades: 0, identificadas: 0, sinPrenda: 0 };
  const desde = diaAntes(p.hoy, 29);
  const dias = p.dias.filter((d) => d.dia >= desde);
  const unidades = dias.reduce((s, d) => s + d.unidades, 0);
  const identificadas = dias.reduce((s, d) => s + d.identificadas, 0);
  return { unidades, identificadas, sinPrenda: unidades - identificadas };
}

const cumple = (p: PreparacionAnalisis | undefined, clave: "venta_identificada" | "piso_cuadrado" | "almacen_contado") =>
  p?.condiciones.find((c) => c.clave === clave)?.cumple === true;

/** Lo que más falta, en una línea: «Falta: 14 días cobrando con la prenda». */
function faltaPrincipal(p: PreparacionAnalisis | undefined): string {
  if (!p) return "Falta: saber si esta tienda ya puede recibir recomendaciones";
  if (!cumple(p, "venta_identificada")) return `Falta: ${DIAS_SOSTENIDOS} días cobrando con la prenda`;
  if (!cumple(p, "piso_cuadrado")) return "Falta: cuadrar el piso";
  return "Falta: contar el almacén";
}

/** Los tres anillos de las condiciones, con el botón de lo que falta (si la cuenta ve esa pantalla). */
export function AnillosCondiciones({ p }: { p: PreparacionAnalisis | undefined }) {
  const { acceso } = useAnalisis();
  const v = ventas30(p);
  const ident = p?.identificada14 != null ? Math.floor(p.identificada14 * 100) : pct(v.identificadas, v.unidades);
  const piso = cumple(p, "piso_cuadrado");
  const almacen = cumple(p, "almacen_contado");
  return (
    <div className="anillos">
      <Anillo p={ident} meta={META} color={ident >= META ? "var(--color-verde)" : "var(--color-ambar)"} centro={v.unidades || p?.identificada14 != null ? `${ident}%` : "—"} et="Ventas con su prenda" sub={`meta: ${META} de cada 100`}>
        {acceso.regularizar && v.sinPrenda > 0 && (
          <Link href="/inventario/por-regularizar" className="btn-cayla btn-primario btn-s">
            Registrar {v.sinPrenda}
          </Link>
        )}
      </Anillo>
      <Anillo p={piso ? 100 : 0} color="var(--color-verde)" centro={piso ? "✓" : "—"} et="Piso cuadrado" sub={piso ? "hecho" : "falta hacerlo"}>
        {acceso.cuadrar && !piso && (
          <Link href="/inventario/cuadrar" className="btn-cayla btn-secundario btn-s">
            Cuadrar
          </Link>
        )}
      </Anillo>
      <Anillo p={almacen ? 100 : 0} color="var(--color-verde)" centro={almacen ? "✓" : "—"} et="Almacén contado" sub={almacen ? "hecho" : "conteo de arranque"}>
        {acceso.conteo && !almacen && (
          <Link href="/inventario/conteo" className="btn-cayla btn-secundario btn-s">
            Contar
          </Link>
        )}
      </Anillo>
    </div>
  );
}

/** «Hoy» cuando todavía no se puede recomendar: qué falta, cómo va día a día, las tres tiendas y lo que sí se sabe. */
export function HoyTodaviaNo() {
  const { datos, prendas, abrirFicha, verConDatosDeHoy } = useAnalisis();
  const mia = datos.preparacion.find((p) => p.ubicacionId === datos.sede.id);
  const v = ventas30(mia);
  const ident = mia?.identificada14 != null ? Math.floor(mia.identificada14 * 100) : pct(v.identificadas, v.unidades);
  const ultimos = (mia?.dias ?? []).filter((d) => d.unidades > 0).slice(-6);
  const racha = Math.min(mia?.racha.dias ?? 0, DIAS_SOSTENIDOS);
  const top = [...prendas].filter((p) => p.vendidas30 > 0).sort((a, b) => b.vendidas30 - a.vendidas30).slice(0, 5);
  const maxTop = Math.max(1, ...top.map((t) => t.vendidas30));
  // Modelos de la tienda: los que solo tienen talla única o estándar, y los que tienen varias tallas.
  const modelos = new Map<string, boolean>();
  for (const p of prendas) if (p.piso + p.almacen > 0) modelos.set(p.productoId, (modelos.get(p.productoId) ?? false) || !esTallaUnica(p.talla));
  const conTallas = [...modelos.values()].filter(Boolean).length;
  const unica = modelos.size - conTallas;

  return (
    <>
      <section className="tarjeta todavia entra" style={{ ["--i" as string]: 0 }}>
        <div>
          <ChipEstado est="nd" />
          <h2>Todavía no puedo recomendarte</h2>
          <p className="uno">
            Veo <b>{ident} de cada 100</b> ventas con su prenda. Necesito {META}.
          </p>
          <AnillosCondiciones p={mia} />
          <button type="button" className="btn-cayla btn-secundario btn-s ver-hoy" onClick={() => verConDatosDeHoy(true)}>
            Ver con los datos de hoy
          </button>
        </div>
        <div>
          <h3 className="sec" style={{ margin: "0 0 12px" }}>
            Ventas con su prenda, día a día
          </h3>
          {ultimos.length === 0 ? (
            <p className="b-nota">Todavía no hay ventas en el ERP.</p>
          ) : (
            <div className="dias">
              {ultimos.map((d, k) => {
                const q = pct(d.identificadas, d.unidades);
                return (
                  <div key={d.dia} className="dia" data-tip={`${fechaCorta(d.dia)}: ${d.identificadas} de ${d.unidades} con su prenda`}>
                    <b>{q}%</b>
                    <span className="barra">
                      <span className="m90" />
                      <i className={`cy ${q >= META ? "ok" : ""}`} style={{ ["--d" as string]: k, ["--h" as string]: `${Math.max(q, 3)}%` }} />
                    </span>
                    {fechaCorta(d.dia)}
                  </div>
                );
              })}
            </div>
          )}
          <div className="leyenda" style={{ marginTop: 10 }}>
            <span>
              <i style={{ borderTop: "1.5px dashed var(--color-verde)", height: 0, borderRadius: 0, width: 16 }} />
              Meta {META}
            </span>
          </div>
          <h3 className="sec" style={{ margin: "18px 0 8px" }}>
            Días seguidos cumpliendo
          </h3>
          <Racha n={racha} />
          <p className="b-nota" style={{ margin: "6px 0 0" }}>
            <b style={{ color: "var(--color-tinta)" }}>
              {racha} de {DIAS_SOSTENIDOS}
            </b>{" "}
            · misma regla que CAYLA Global
          </p>
        </div>
      </section>

      <div className="sedes">
        {datos.sedes.map((s, k) => {
          const p = datos.preparacion.find((x) => x.ubicacionId === s.id);
          const r = ventas30(p);
          const q = p?.identificada14 != null ? Math.floor(p.identificada14 * 100) : pct(r.identificadas, r.unidades);
          const unidades = datos.resumenSedes.find((x) => x.sedeId === s.id)?.unidades ?? 0;
          return (
            <article key={s.id} className="tarjeta sede-c entra fija" style={{ ["--i" as string]: 1 + k, alignItems: "center", textAlign: "center" }}>
              <h3 style={{ justifyContent: "center" }}>{s.ciudad}</h3>
              <Anillo
                p={q}
                meta={META}
                color={q >= META ? "var(--color-verde)" : "var(--color-ambar)"}
                centro={r.unidades ? `${q}%` : "—"}
                et={r.unidades ? `${r.identificadas} de ${r.unidades} con prenda` : "Sin ventas"}
                sub={`${unidades.toLocaleString("es-PE")} ${plural(unidades, "prenda", "prendas")} en el sistema`}
              />
            </article>
          );
        })}
      </div>

      <h2 className="sec entra" style={{ ["--i" as string]: 4 }}>
        Lo que sí sé hoy
      </h2>
      <div className="dos" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
        <div className="tarjeta sabe entra" style={{ ["--i" as string]: 5 }}>
          <h4>El conteo coincidió</h4>
          {datos.conteo ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Anillo
                p={pct(datos.conteo.coinciden, datos.conteo.contadas)}
                color="var(--color-verde)"
                centro={`${pct(datos.conteo.coinciden, datos.conteo.contadas)}%`}
                et={`${datos.conteo.coinciden} de ${datos.conteo.contadas} prendas`}
                sub="lo del sistema es confiable"
              />
            </div>
          ) : (
            <p className="b-nota">Todavía no hay un conteo cerrado.</p>
          )}
        </div>
        <div className="tarjeta sabe entra" style={{ ["--i" as string]: 6 }}>
          <h4>Lo más vendido con su prenda</h4>
          {top.length === 0 ? (
            <p className="b-nota">Sin ventas con su prenda en 30 días.</p>
          ) : (
            top.map((t, k) => (
              <button key={t.varianteId} type="button" className="top-f" onClick={() => abrirFicha(t.varianteId)}>
                <TilePrenda prenda={t} tamano={20} />
                <span className="nm">
                  <NombreCorto prenda={t} />
                </span>
                <span className="tr">
                  <i className="cx" style={{ ["--d" as string]: k, width: `${(t.vendidas30 / maxTop) * 70}%` }} />
                  <em style={{ left: `${(t.vendidas30 / maxTop) * 70 + 5}%` }}>{t.vendidas30}</em>
                </span>
              </button>
            ))
          )}
          <div className="nota">Solo cuenta {ident} de cada 100 ventas</div>
        </div>
        <div className="tarjeta sabe entra" style={{ ["--i" as string]: 7 }}>
          <h4>
            Te pidieron y no había <ChipEstado est="info">{datos.noHabia.length}</ChipEstado>
          </h4>
          {datos.noHabia.length === 0 ? (
            <p className="b-nota">Nadie pidió algo que no hubiera.</p>
          ) : (
            datos.noHabia.slice(0, 5).map((n, k) => (
              <div key={k} className="nh-f">
                <span>{n.que}</span>
                <span>{fechaCorta(n.dia)}</span>
              </div>
            ))
          )}
        </div>
        <div className="tarjeta sabe entra" style={{ ["--i" as string]: 8 }}>
          <h4>Modelos de {datos.sede.ciudad}</h4>
          {modelos.size === 0 ? (
            <p className="b-nota">Sin prendas en el sistema.</p>
          ) : (
            <>
              <div className="modelos-barra" data-tip={`${unica} de talla única o estándar · ${conTallas} con varias tallas`}>
                <i className="cx" style={{ flex: unica, background: "var(--color-grafico-neutro)" }} />
                <i className="cx" style={{ flex: conTallas, background: "var(--color-tinta)", ["--d" as string]: 1 }} />
              </div>
              <div className="leyenda">
                <span>
                  <i style={{ background: "var(--color-grafico-neutro)" }} />
                  {unica} talla única
                </span>
                <span>
                  <i style={{ background: "var(--color-tinta)" }} />
                  {conTallas} con tallas
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/** Lo que sigue faltando después de lo principal, en palabras de tienda: «contar el almacén». */
const TEXTO_FALTA: Record<"venta_identificada" | "piso_cuadrado" | "almacen_contado", string> = {
  venta_identificada: `${DIAS_SOSTENIDOS} días cobrando con la prenda`,
  piso_cuadrado: "cuadrar el piso",
  almacen_contado: "contar el almacén",
};

/** Las otras pestañas, mientras no se puede recomendar: lo que falta primero, con su botón, y lo que sigue. */
export function VistaTodaviaNo() {
  const { datos, acceso, irA, verConDatosDeHoy } = useAnalisis();
  const mia = datos.preparacion.find((p) => p.ubicacionId === datos.sede.id);
  const v = ventas30(mia);
  const ident = mia?.identificada14 != null ? Math.floor(mia.identificada14 * 100) : pct(v.identificadas, v.unidades);
  const racha = Math.min(mia?.racha.dias ?? 0, DIAS_SOSTENIDOS);
  const faltan = (mia?.condiciones ?? []).filter((c) => !c.cumple).map((c) => c.clave);
  const primera = faltan[0] ?? null;
  const despues = faltan.slice(1).map((c) => TEXTO_FALTA[c]);
  // El botón de lo que falta primero, si la cuenta ve esa pantalla.
  const boton =
    primera === "venta_identificada" && acceso.regularizar && v.sinPrenda > 0
      ? { href: "/inventario/por-regularizar", texto: `Registrar ${v.sinPrenda} sin prenda` }
      : primera === "piso_cuadrado" && acceso.cuadrar
        ? { href: "/inventario/cuadrar", texto: "Cuadrar el piso" }
        : primera === "almacen_contado" && acceso.conteo
          ? { href: "/inventario/conteo", texto: "Contar el almacén" }
          : null;
  return (
    <section className="tarjeta vacio-vista entra" style={{ ["--i" as string]: 0 }}>
      <Anillo p={ident} meta={META} color={ident >= META ? "var(--color-verde)" : "var(--color-ambar)"} centro={v.unidades ? `${ident}%` : "—"} et="Ventas con su prenda" sub={`meta: ${META}`} />
      <div>
        <ChipEstado est="nd" />
        <h2>{faltaPrincipal(mia)}</h2>
        {primera === "venta_identificada" || primera === null ? (
          <>
            <p>
              Llevas{" "}
              <b>
                {racha} de {DIAS_SOSTENIDOS}
              </b>
              .
            </p>
            <Racha n={racha} />
          </>
        ) : (
          <p>
            Las ventas con su prenda ya cumplen: <b>{racha} de {DIAS_SOSTENIDOS}</b> días.
          </p>
        )}
        {despues.length > 0 && <p>Después: {despues.join(" y ")}.</p>}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {boton && (
            <Link href={boton.href} className="btn-cayla btn-primario btn-s">
              {boton.texto}
            </Link>
          )}
          <button type="button" className={`btn-cayla ${boton ? "btn-secundario" : "btn-primario"} btn-s`} onClick={() => verConDatosDeHoy(true)}>
            Ver con los datos de hoy
          </button>
          <button type="button" className="btn-cayla btn-sutil btn-s" onClick={() => irA("hoy")}>
            Ver qué falta
          </button>
        </div>
      </div>
    </section>
  );
}
