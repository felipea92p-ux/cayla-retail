"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useAnalisis } from "@/components/analisis/contexto";
import { TRAZO_PERCHA } from "@/components/analisis/iconos";
import { ChipEstado, COLOR_ESTADO, nombreLargo, TilePrenda, type Estado } from "@/components/analisis/piezas";
import { Respuesta, TarjetaPrenda, Tarjetas } from "@/components/analisis/Tarjetas";
import { IconoCategoria } from "@/components/IconoCategoria";
import { Modal } from "@/components/ui/Modal";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { BotonVerMas } from "@/components/ui/VerMas";
import { Vacio } from "@/components/ui/Vacio";
import { queTiene } from "@/lib/analisis-modelo";
import {
  alcanceConFiltros,
  baseConFiltros,
  curvaDeTallas,
  DIAS_RINDE,
  diasANavidad,
  escalaRinde,
  estadoQuedan,
  fraseAlcance,
  masVendidas,
  notaRindeVacio,
  notaTiposSinRegistrar,
  ordenarTipos,
  RINDE_POCO,
  solesRinde,
  tallaQueSeAcaba,
  textoRitmo,
  tipRinde,
  tiposSinRegistrar,
  type AlcanceTipo,
  type CurvaTallas,
} from "@/lib/analisis-pedir";
import { plural } from "@/lib/analisis-reglas";

// Análisis, cara B (ADR-0357, act. 2026-11-21): «Qué pedir». Abre con la respuesta («5 tipos no te alcanzan hasta Navidad, en 34 días»,
// con el atajo al Plan de campaña) y sigue con una tarjeta por tipo que no llega: los días que le alcanzan (o «Ya no hay») y la talla que
// se acaba primero. Los que alcanzan y los que no se vendieron van en una línea; «Lo que más rinde», plegado. Tocar un tipo abre su hoja:
// sus cifras, las tallas que se llevan y lo que más se vende. La pestaña no decide cuánto pedir (ADR-0231): muestra dónde falta; la
// cantidad la elige quien pide, en Compras o en el Plan de campaña. Sigue a los filtros de la barra: con una talla puesta, dice si te
// alcanza ESA talla (`alcanceConFiltros`). Las cuentas viven en `lib/analisis-pedir.ts`.

/** Los días que alcanza, enteros: lo que se acaba en menos de un día dice 1; «Ya no hay» es solo el 0. null si no tiene ritmo. */
const diasEnteros = (dias: number | null): number | null => (dias === null ? null : dias <= 0 ? 0 : Math.max(1, Math.round(dias)));

/** El tono de un tipo: no le alcanza en una semana o menos → urgente; no llega a Navidad → atención; llega → bien; sin ventas → todavía no. */
const tonoTipo = (t: AlcanceTipo): Estado => (t.dias === null ? "nd" : !t.pide ? "bien" : (diasEnteros(t.dias) ?? 0) <= 7 ? "urg" : "ate");

/** La miniatura de un tipo: su ícono sobre una lente teñida del color de cómo va (no es una prenda: no lleva color de dato). */
function LenteTipo({ t }: { t: AlcanceTipo }) {
  return (
    <span className="an-lente" style={{ ["--c" as string]: COLOR_ESTADO[tonoTipo(t)] }} aria-hidden>
      <IconoCategoria prefijo={t.prefijo} familia={(t.familia ?? null) as Parameters<typeof IconoCategoria>[0]["familia"]} className="h-9 w-9" />
    </span>
  );
}

export function PestanaPedir() {
  const { datos, acceso, prendas, filtros, orden, diasDeVentas } = useAnalisis();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [rinde, setRinde] = useState(false);
  const hastaNavidad = diasANavidad(datos.hoy);
  const tipos = useMemo(
    () => ordenarTipos(alcanceConFiltros(prendas, datos.tallas, filtros, diasDeVentas, hastaNavidad, datos.sabePiso, datos.sinPrendaPorTipo), orden.pedir),
    [prendas, datos.tallas, filtros, diasDeVentas, hastaNavidad, datos.sabePiso, datos.sinPrendaPorTipo, orden.pedir],
  );
  // Las tallas que se comparan: las de lo que dejan ver los filtros.
  const tallasDeLaTienda = datos.tallas;
  const base = useMemo(() => baseConFiltros(prendas, tallasDeLaTienda, filtros).flatMap((p) => ("variantes" in p ? (p.variantes as typeof tallasDeLaTienda) : [p])), [prendas, tallasDeLaTienda, filtros]);
  const sinRegistro = useMemo(() => tiposSinRegistrar(datos.prendas, datos.sinPrendaPorTipo), [datos.prendas, datos.sinPrendaPorTipo]);

  const piden = tipos.filter((t) => t.pide);
  const alcanzan = tipos.filter((t) => !t.pide && t.dias !== null);
  const sinVentas = tipos.filter((t) => t.dias === null);
  const n = piden.length;
  const ayuda = [`${textoRitmo(diasDeVentas)}.`, sinRegistro.length > 0 ? notaTiposSinRegistrar(sinRegistro) : null].filter(Boolean).join(" ");
  const elegido = abierto ? (tipos.find((t) => t.categoria === abierto) ?? null) : null;
  const enlaces = (ts: AlcanceTipo[]) =>
    ts.map((t, k) => (
      <span key={t.categoria}>
        {k > 0 && (k === ts.length - 1 ? " y " : ", ")}
        <button type="button" className="btn-cayla btn-enlace" onClick={() => setAbierto(t.categoria)}>
          {t.categoria}
        </button>
      </span>
    ));

  if (tipos.length === 0)
    return (
      <section className="tarjeta entra" style={{ ["--i" as string]: 3 }}>
        <Vacio tamano="chico" icono={<Check />}>
          Con estos filtros no hay ninguno aquí.
        </Vacio>
      </section>
    );

  return (
    <>
      <Respuesta
        guia="analisis.pedir-respuesta"
        est={n > 0 ? "ate" : "bien"}
        {...(n > 0 ? { cuenta: n, cifra: plural(n, "tipo", "tipos") } : { cifra: "Ninguno" })}
        frase={n > 0 ? fraseAlcance(n, hastaNavidad) : `se acaba antes de Navidad, en ${hastaNavidad} ${plural(hastaNavidad, "día", "días")}`}
        ayuda={ayuda}
        acciones={
          acceso.planCompra ? (
            <BotonVer href="/compras/plan" chico>
              Plan de campaña
            </BotonVer>
          ) : undefined
        }
      />

      {n > 0 && (
        <Tarjetas guia="analisis.pedir-tarjetas">
          {piden.map((t, k) => {
            const dias = diasEnteros(t.dias);
            const numero = dias === 0 ? "Ya no hay" : String(dias);
            const unidad = dias === 0 ? "" : plural(dias ?? 0, "día te alcanza", "días te alcanzan");
            const detalle = tallaQueSeAcaba(curvaDeTallas(base, t.categoria)) ?? undefined;
            return (
              <TarjetaPrenda
                key={t.categoria}
                i={4 + k}
                miniatura={<LenteTipo t={t} />}
                nombre={t.categoria}
                que={`Vendiste ${t.vendidas} · tienes ${t.tiene}`}
                numero={numero}
                unidad={unidad}
                est={tonoTipo(t)}
                detalle={detalle}
                etiqueta={`${t.categoria}: ${numero} ${unidad}. ${detalle ?? ""} Enter abre sus tallas y lo que más se vende.`}
                onAbrir={() => setAbierto(t.categoria)}
              />
            );
          })}
        </Tarjetas>
      )}

      {(alcanzan.length > 0 || sinVentas.length > 0) && (
        <section className="tarjeta bloque entra flex flex-wrap gap-x-6 gap-y-2 text-sm text-tinta/70" style={{ ["--i" as string]: 10 }}>
          {alcanzan.length > 0 && (
            <span>
              <b className="font-semibold text-tinta">Te alcanzan:</b> {enlaces(alcanzan)}
            </span>
          )}
          {sinVentas.length > 0 && (
            <span>
              <b className="font-semibold text-tinta">Sin ventas en {diasDeVentas} {plural(diasDeVentas, "día", "días")}:</b> {enlaces(sinVentas)}
            </span>
          )}
        </section>
      )}

      <div className="entra flex flex-col gap-4" style={{ ["--i" as string]: 11 }}>
        <BotonVerMas abierto={rinde} onCambiar={setRinde} texto="Ver lo que más rinde" forma="enlace" />
        {rinde && <BloqueRinde />}
      </div>

      {elegido && <HojaTipo t={elegido} base={base} onCerrar={() => setAbierto(null)} />}
    </>
  );
}

/** La hoja de un tipo: cómo va, sus tres cifras, las tallas que se llevan y lo que más se vende (el mismo orden que la ficha de una prenda). */
function HojaTipo({ t, base, onCerrar }: { t: AlcanceTipo; base: Parameters<typeof curvaDeTallas>[0]; onCerrar: () => void }) {
  const { datos, prendas, acceso, abrirFicha, diasDeVentas } = useAnalisis();
  const hastaNavidad = diasANavidad(datos.hoy);
  const tops = masVendidas(prendas, t.categoria, 5);
  const dias = diasEnteros(t.dias);
  const veredicto =
    dias === null ? `No se vendió en ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}.` : dias === 0 ? "Ya no hay. Pide para Navidad." : t.pide ? `Te alcanza para ${dias} ${plural(dias, "día", "días")}: no llega a Navidad.` : "Te alcanza hasta Navidad.";
  return (
    <Modal titulo={t.categoria} subtitulo={`Navidad es en ${hastaNavidad} ${plural(hastaNavidad, "día", "días")}`} onClose={onCerrar} tamano="mediana" conCerrar>
      <div className="analisis analisis-hoja flex flex-col gap-5">
        <p className="m-0 text-[15px] font-semibold" style={{ color: COLOR_ESTADO[tonoTipo(t)] }}>
          {veredicto}
        </p>
        <div className="grid grid-cols-3 gap-2">
          <TarjetaCifra etiqueta="Vendiste" valor={t.vendidas} unidad={`en ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}`} />
          <TarjetaCifra etiqueta="Tienes" valor={t.tiene} unidad="hoy" />
          <TarjetaCifra etiqueta="Te alcanza" valor={dias ?? "—"} unidad={dias === null ? "sin ritmo" : plural(dias, "día", "días")} />
        </div>
        <BloqueCurva c={curvaDeTallas(base, t.categoria)} categoria={t.categoria} />
        {tops.length > 0 && (
          <div className="flex flex-col gap-1">
            <h4 className="pt-sub">Lo que más se vende</h4>
            {tops.map((p) => {
              const queda = estadoQuedan(p);
              return (
                <button key={p.varianteId} type="button" className="flex items-center gap-3 rounded-xl py-1.5 text-left" onClick={() => abrirFicha(p.varianteId)} aria-label={`${nombreLargo(p)}: ${p.vendidas30} vendidas, ${queda.texto.toLowerCase()}. Ver su ficha`}>
                  <TilePrenda prenda={p} tamano={36} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px] font-semibold">{p.nombre}</b>
                    <span className="texto-detalle">
                      vendiste {p.vendidas30} · {queTiene(p)}
                    </span>
                  </span>
                  <ChipEstado est={queda.est}>{queda.texto}</ChipEstado>
                </button>
              );
            })}
          </div>
        )}
        {acceso.planCompra && (
          <div className="pie-acciones">
            <BotonVer href="/compras/plan">Abrir el plan de campaña</BotonVer>
          </div>
        )}
      </div>
    </Modal>
  );
}

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
        <span className="b-nota">Por cada S/&nbsp;1 en ropa · {DIAS_RINDE} días</span>
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
            <span>Línea punteada = S/&nbsp;1</span>
          </div>
        </>
      )}
    </section>
  );
}
