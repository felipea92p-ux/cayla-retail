"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalisis } from "@/components/analisis/contexto";
import { TRAZO_PERCHA } from "@/components/analisis/iconos";
import { ChipEstado, Cuenta, nombreLargo, TilePrenda } from "@/components/analisis/piezas";
import { queTiene } from "@/lib/analisis-modelo";
import {
  alcancePorTipo,
  cuentaNavidad,
  curvaDeTallas,
  DIAS_RINDE,
  diasANavidad,
  escalaRinde,
  estadoQuedan,
  finEjeAlcance,
  LARGO_RANKING,
  masVendidas,
  cuantasVendidas,
  fraseDelTipo,
  topsPosibles,
  TOP_DEFECTO,
  type Top,
  notaRindeVacio,
  RINDE_POCO,
  rielNavidad,
  solesRinde,
  tipRinde,
  textoAlcance,
  textoRitmo,
  ventaMaxima,
  type AlcanceTipo,
  type CurvaTallas,
  type RielNavidad,
} from "@/lib/analisis-pedir";
import { plural } from "@/lib/analisis-reglas";
import { IconoCategoria } from "@/components/IconoCategoria";

// Análisis v4 (ADR-0357): «Qué pedir», como la maqueta aprobada (2026-10-06) y su cambio del 2026-10-07 (B2): cuánto falta para
// Navidad → para cuánto te alcanza cada tipo al ritmo de los días de ventas, contra Navidad (la tabla, que filtra; antes, la
// mariposa «de cada 100») → las tallas que se llevan y lo que más se vende → lo que más rinde. La pestaña no decide cuánto pedir (ADR-0231): muestra dónde falta y dónde sobra; la cantidad la elige
// quien pide, en Compras o en el Plan de campaña. Las cuentas viven en `lib/analisis-pedir.ts`.
//
// La tabla y las tallas miran TODA la tienda (el buscador no las mueve, como en la maqueta); el ranking sigue al buscador y al
// tipo elegido. Tocar un tipo de la tabla filtra tallas y ranking; tocarlo otra vez, o «✕», lo quita.

export function PestanaPedir() {
  const { datos, acceso, prendas, q, categoria, setCategoria, abrirFicha, diasDeVentas } = useAnalisis();
  const cuenta = cuentaNavidad(datos.hoy);
  const riel = useMemo(() => rielNavidad(datos.hoy), [datos.hoy]);
  const hastaNavidad = diasANavidad(datos.hoy);
  const tipos = useMemo(
    () => alcancePorTipo(datos.prendas, diasDeVentas, hastaNavidad, datos.sabePiso),
    [datos.prendas, diasDeVentas, hastaNavidad, datos.sabePiso],
  );
  // Las tallas se comparan talla por talla (las filas de la base), no por modelo.
  const curva = useMemo(() => curvaDeTallas(datos.tallas, categoria), [datos.tallas, categoria]);
  // «Lo que más se vende»: los 5 primeros por defecto; la persona elige ver 10, 15 o 20 (Felipe 2026-10-10). Solo se ofrecen los
  // «Top» que tienen más modelos vendidos que el anterior; si el elegido ya no cabe (otro tipo), se marca el más grande que sí.
  const [top, setTop] = useState<Top>(TOP_DEFECTO);
  const vendidos = cuantasVendidas(prendas, categoria);
  const opcionesTop = topsPosibles(vendidos);
  const topMarcado = opcionesTop.includes(top) ? top : opcionesTop[opcionesTop.length - 1];
  const tops = masVendidas(prendas, categoria, top);
  const maxVenta = ventaMaxima(datos.prendas);
  const elegido = categoria ? (tipos.find((t) => t.categoria === categoria) ?? null) : null;
  const panel = useRef<HTMLElement>(null);
  const quitar = () => setCategoria(null);
  // Opción A (Felipe 2026-10-10): tocar un tipo cambia el panel de al lado en el acto. Si el panel quedó debajo (pantalla angosta,
  // una sola columna) y no se ve, se lleva a la vista: el efecto del toque nunca pasa fuera de la pantalla.
  const elegir = (c: string) => {
    const nueva = c === categoria ? null : c;
    setCategoria(nueva);
    const el = panel.current;
    if (!nueva || !el) return;
    window.requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight - 120 || r.bottom < 80) {
        el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
    });
  };

  return (
    <>
      <section className={`tarjeta campana entra ${acceso.planCompra ? "" : "sin-boton"}`} style={{ ["--i" as string]: 0 }}>
        <div className="cuenta-reg">
          <div>
            <b>{cuenta.valor === null ? "Hoy" : <Cuenta valor={cuenta.valor} />}</b>
            <span>{cuenta.texto}</span>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <Riel r={riel} />
        </div>
        {acceso.planCompra && (
          <Link href="/compras/plan" className="btn-cayla btn-secundario btn-s">
            Plan de campaña
          </Link>
        )}
      </section>

      <div className="pedir-ad">
        <section className="tarjeta bloque entra" style={{ ["--i" as string]: 1 }}>
          <div className="b-cab">
            <h3 className="b-tit">¿Para cuánto te alcanza?</h3>
            <span className="b-nota">
              {textoRitmo(diasDeVentas)} · toca un tipo para ver sus tallas y lo que más se vende <span aria-hidden="true">→</span>
            </span>
          </div>
          <TablaAlcance tipos={tipos} hastaNavidad={hastaNavidad} categoria={categoria} onElegir={elegir} />
        </section>

        {/* El panel del tipo elegido (o de toda la tienda): siempre a la vista junto a la lista mientras se recorre. */}
        <aside ref={panel} className="tarjeta bloque entra panel-tipo" style={{ ["--i" as string]: 2 }} aria-live="polite" aria-label={`Detalle de ${categoria ?? "todos los tipos"}`}>
          <div className="b-cab">
            <h3 className="b-tit">{categoria ?? "Todos los tipos"}</h3>
            {categoria && (
              <button type="button" className="chip info quitar" onClick={quitar} aria-label={`Quitar el filtro: ${categoria}`}>
                Ver todos los tipos ✕
              </button>
            )}
          </div>
          <p className="pt-frase">{fraseDelTipo(elegido, tipos, diasDeVentas)}</p>

          <BloqueCurva c={curva} categoria={categoria} />

          <div className="pt-cab">
            <h4 className="pt-sub">Lo que más se vende</h4>
            {opcionesTop.length > 1 && (
              <span className="filtro-a" role="group" aria-label="Cuántos modelos ver">
                {opcionesTop.map((t) => (
                  <button key={t} type="button" className="pildora" aria-pressed={topMarcado === t} onClick={() => setTop(t)}>
                    Top {t}
                  </button>
                ))}
              </span>
            )}
          </div>
          <div className="rank">
            {tops.length === 0 ? (
              <p className="b-nota">{categoria || q.trim() ? "Nada con este filtro." : `Sin ventas en ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}.`}</p>
            ) : (
              tops.map((p, k) => {
                const n = (p.vendidas30 / maxVenta) * LARGO_RANKING;
                const queda = estadoQuedan(p);
                return (
                  <div
                    key={p.varianteId}
                    className="rank-f"
                    role="button"
                    tabIndex={0}
                    data-ps={p.varianteId}
                    aria-label={`${nombreLargo(p)}: ${p.vendidas30} vendidas, ${queda.texto.toLowerCase()}. Ver su ficha`}
                    onClick={() => abrirFicha(p.varianteId)}
                  >
                    <TilePrenda prenda={p} tamano={32} />
                    <span className="nm">
                      <b>{p.nombre}</b>
                      <span>{queTiene(p)}</span>
                    </span>
                    <span className="tr">
                      <i className="cx" style={{ ["--d" as string]: k, ["--n" as string]: n }} />
                      <em style={{ ["--n" as string]: n }}>{p.vendidas30}</em>
                    </span>
                    <span className="q">
                      <ChipEstado est={queda.est}>{queda.texto}</ChipEstado>
                    </span>
                  </div>
                );
              })
            )}
          </div>
          {vendidos > tops.length && tops.length > 0 && (
            <p className="b-nota pt-de">
              Ves {tops.length} de {vendidos} modelos que se vendieron · Últimos {diasDeVentas} {plural(diasDeVentas, "día", "días")}
            </p>
          )}
        </aside>
      </div>

      <BloqueRinde />
    </>
  );
}

/** El riel de hoy a Navidad: lo ya pasado del mes en taupe, los meses del medio y los dos hitos (la maqueta). */
function Riel({ r }: { r: RielNavidad }) {
  return (
    <div className="riel" role="img" aria-label={r.etiqueta}>
      <span className="linea-r" />
      <span className="pasado cx" style={{ width: `${r.hoyPct}%` }} />
      {r.meses.map((m) => (
        <span key={m.clave} className="mes" style={{ left: `${m.pct}%` }}>
          {m.texto}
        </span>
      ))}
      <span className="hito hoy" style={{ left: `${r.hoyPct}%` }}>
        <span style={r.juntos ? { visibility: "hidden" } : undefined}>Hoy</span>
        <i />
      </span>
      <span className="hito" style={{ left: `${r.navidadPct}%` }}>
        <span>Navidad</span>
        <i />
      </span>
    </div>
  );
}

/**
 * «¿Para cuánto te alcanza?»: cada tipo, para cuánto te alcanza lo que tienes al ritmo de los días de ventas, con la línea de
 * Navidad: lo que no llega va en ámbar con su ▲ (pídelo). Cada tipo es un botón que cambia el panel de al lado (opción A, Felipe
 * 2026-10-10). La lista se desplaza por dentro y, mientras queden tipos abajo, lo dice («↓ 6 tipos más», que baja al tocarlo).
 */
function TablaAlcance({ tipos, hastaNavidad, categoria, onElegir }: { tipos: AlcanceTipo[]; hastaNavidad: number; categoria: string | null; onElegir: (c: string) => void }) {
  const lista = useRef<HTMLDivElement>(null);
  const [ocultos, setOcultos] = useState(0);
  // Cuántos tipos quedan bajo el borde de la lista (más de la mitad de su fila fuera de la vista).
  const medir = useCallback(() => {
    const el = lista.current;
    if (!el) return;
    const fondo = el.scrollTop + el.clientHeight;
    setOcultos([...el.querySelectorAll<HTMLElement>(".al-f")].filter((f) => f.offsetTop + f.offsetHeight / 2 > fondo).length);
  }, []);
  useEffect(() => {
    medir();
    const el = lista.current;
    if (!el) return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir, tipos.length]);

  if (tipos.length === 0) return <p className="b-nota">Todavía no hay ventas ni prendas que comparar.</p>;
  const fin = finEjeAlcance(hastaNavidad);
  const semanas = Math.round(hastaNavidad / 7);
  return (
    <div className="alcance" style={{ ["--nav" as string]: Math.min(1, hastaNavidad / fin) }}>
      <div className="al-cab" aria-hidden>
        <span />
        <span>Tipo</span>
        <span className="eje">
          <span className="nav-et">
            Navidad · {semanas} {plural(semanas, "semana", "semanas")}
          </span>
        </span>
        <span>Te alcanza</span>
      </div>
      <div ref={lista} className="al-lista" onScroll={medir}>
        {tipos.map((t, k) => (
          <button key={t.categoria} type="button" className={`al-f ${t.pide ? "pide" : ""}`} aria-pressed={categoria === t.categoria} onClick={() => onElegir(t.categoria)}>
            <span className="ico">
              <IconoCategoria prefijo={t.prefijo} familia={(t.familia ?? null) as Parameters<typeof IconoCategoria>[0]["familia"]} className="h-[18px] w-[18px]" />
            </span>
            <span className="n">
              <b>{t.categoria}</b>
              <small>
                vendiste {t.vendidas} · tienes {t.tiene}
              </small>
            </span>
            <span className="p">
              {t.dias !== null && <i className="cx" style={{ ["--d" as string]: k, ["--n" as string]: Math.min(1, t.dias / fin) }} />}
              <span className="nav" />
            </span>
            <span className="v">
              {t.pide ? "▲ " : ""}
              {textoAlcance(t.dias)}
              {categoria === t.categoria && <span aria-hidden="true"> →</span>}
            </span>
          </button>
        ))}
        {ocultos > 0 && (
          <button
            type="button"
            className="al-mas"
            onClick={() => lista.current?.scrollBy({ top: lista.current.clientHeight * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
          >
            ↓ {ocultos} {plural(ocultos, "tipo más", "tipos más")}
          </button>
        )}
      </div>
    </div>
  );
}

/** «Las tallas que se llevan»: por talla, se vende (tinta) contra tienes (claro); o el aviso de talla única. */
function BloqueCurva({ c, categoria }: { c: CurvaTallas; categoria: string | null }) {
  const { diasDeVentas } = useAnalisis();
  // Va dentro del panel del tipo (opción A): el título del panel ya dice el tipo.
  const titulo = <h4 className="pt-sub">Las tallas que se llevan</h4>;
  if (c.tipo !== "tallas") {
    const unica = c.tipo === "unica";
    return (
      <div className="pt-bloque">
        <div className="pt-cab">
          {titulo}
          {unica && <ChipEstado est="info">Talla única</ChipEstado>}
        </div>
        <div className="unica">
          <svg className="po" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {TRAZO_PERCHA}
          </svg>
          <b>{unica ? (categoria ? `${categoria}: se venden en talla única` : "Todo se vende en talla única") : "Todavía no hay tallas que comparar"}</b>
          <span>{unica ? "No hay tallas que comparar. Mira el color y el modelo en «Lo que más se vende»." : "Aparecen cuando haya ventas o prendas con talla."}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="pt-bloque">
      <div className="pt-cab">
        {titulo}
        {c.falta ? <ChipEstado est="ate">Falta {c.falta}</ChipEstado> : <ChipEstado est="bien">Parejo</ChipEstado>}
      </div>
      <div className={`cols-t ${c.columnas.length > 5 ? "muchas" : ""}`}>
        {c.columnas.map((t, k) => (
          <div key={t.talla} className="ct" data-tip={`Talla ${t.talla}: vendiste ${t.vend} en ${diasDeVentas} ${plural(diasDeVentas, "día", "días")} · tienes ${t.tiene}`}>
            <span className="flag">{t.pideMas ? "▲ pide más" : ""}</span>
            <span className="par-c">
              <i className="v cy" style={{ ["--d" as string]: k * 2, height: `${Math.round((t.v / c.max) * 115)}px` }}>
                <span>{t.vend}</span>
              </i>
              <i className="t cy" style={{ ["--d" as string]: k * 2 + 1, height: `${Math.round((t.t / c.max) * 115)}px` }}>
                <span>{t.tiene}</span>
              </i>
            </span>
            <span className="nom">{t.talla}</span>
          </div>
        ))}
      </div>
      <div className="leyenda" style={{ justifyContent: "center" }}>
        <span>
          <i style={{ background: "var(--color-tinta)" }} />
          Vendiste · en {diasDeVentas} {plural(diasDeVentas, "día", "días")}
        </span>
        <span>
          <i style={{ background: "var(--color-grafico-neutro)" }} />
          Tienes · hoy
        </span>
      </div>
      {c.nota && (
        <p className="b-nota" style={{ justifyContent: "center", margin: "10px 0 0" }}>
          {c.nota}
        </p>
      )}
    </div>
  );
}

/** «Lo que más rinde»: por tipo, cuánto se ganó por cada S/ 1 de ropa en 90 días; la línea punteada es S/ 1. */
function BloqueRinde() {
  const { datos } = useAnalisis();
  const filas = [...datos.rinde].sort((a, b) => b.porSol - a.porSol || a.categoria.localeCompare(b.categoria, "es"));
  const escala = escalaRinde(filas);
  return (
    <section className="tarjeta bloque entra" style={{ ["--i" as string]: 4 }}>
      <div className="b-cab">
        <h3 className="b-tit">Lo que más rinde</h3>
        <span className="b-nota">Por cada S/ 1 en ropa · {DIAS_RINDE} días</span>
      </div>
      {filas.length === 0 ? (
        <p className="b-nota">{notaRindeVacio(datos.fallas)}</p>
      ) : (
        <>
          <div className="rinde">
            {filas.map((r, k) => {
              const n = Math.min(1, Math.max(0, r.porSol / escala));
              return (
                <div key={r.categoria} className="r" role="img" tabIndex={0} aria-label={tipRinde(r)} data-tip={tipRinde(r)}>
                  <span>{r.categoria}</span>
                  <span className="pista2">
                    <span className="tallo cx" style={{ ["--d" as string]: k, ["--n" as string]: n }} />
                    <span className="ref" style={{ left: `${(1 / escala) * 100}%` }} />
                    <span
                      className="cab po"
                      style={{
                        ["--d" as string]: k,
                        ["--n" as string]: n,
                        ["--c" as string]: r.porSol < RINDE_POCO ? "var(--color-grafico-neutro)" : "var(--color-tinta)",
                      }}
                    />
                  </span>
                  <span className="v">{solesRinde(r.porSol)}</span>
                </div>
              );
            })}
          </div>
          <div className="leyenda">
            <span>
              <i style={{ background: "var(--color-tinta)", borderRadius: "50%" }} />
              Rinde
            </span>
            <span>
              <i style={{ background: "var(--color-grafico-neutro)", borderRadius: "50%" }} />
              Rinde poco: compra menos
            </span>
            <span>Línea punteada = S/ 1</span>
          </div>
        </>
      )}
    </section>
  );
}
