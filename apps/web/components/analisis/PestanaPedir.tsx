"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono, TRAZO_PERCHA } from "@/components/analisis/iconos";
import { ChipEstado, COLOR_ESTADO, ICONO_ESTADO, nombreLargo, TilePrenda, type Estado } from "@/components/analisis/piezas";
import { Respuesta, TarjetaPrenda, Tarjetas } from "@/components/analisis/Tarjetas";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { Vacio } from "@/components/ui/Vacio";
import type { PrendaAnalisis } from "@/lib/analisis-tipos";
import { queTiene } from "@/lib/analisis-modelo";
import { fechaCorta } from "@/lib/motor-demanda-reglas";
import {
  alcanceConFiltros,
  baseConFiltros,
  curvaDeTallas,
  DIAS_RINDE,
  diasANavidad,
  diasEnteros,
  escalaRinde,
  fechaEnQueSeAcaba,
  fraseAlcance,
  notaRindeVacio,
  notaTiposSinRegistrar,
  parteDeArriba,
  pieDePedir,
  PRIMEROS_QUE_PEDIR,
  queHayQuePedir,
  RINDE_POCO,
  solesRinde,
  textoRitmo,
  textoVendesPorSemana,
  textoVendiste,
  tipRinde,
  tiposSinRegistrar,
  type CurvaTallas,
} from "@/lib/analisis-pedir";
import { plural } from "@/lib/analisis-reglas";
import { estadoSinNada } from "@/lib/analisis-hoy";

// Análisis, cara B (ADR-0357, act. 2026-11-21 y 2026-11-24): «Qué pedir», por MODELO (Felipe 2026-11-21: «el que muestra en las tarjetas
// debería ser por modelo y no por tipo, para eso existe el filtro de tipo»). Abre con la respuesta («12 modelos · para la campaña: no te
// alcanzan hasta Navidad, en 34 días», con el atajo al Plan de campaña) y sigue en dos partes (Felipe 2026-11-24): «Ya se agotaron» (cuándo
// se agotó y cuántas se vendieron en cuántos días: lo que dice si una prueba funcionó) y «Se acaban antes de Navidad» (hasta cuándo alcanza,
// cuánto tienes y cuánto vendes por semana). Al pie, lo que viene en camino o la otra tienda que lo tiene. Sin botones ni «Faltan»: el detalle
// por talla y «Pedir a…» están en la ficha, al tocar la tarjeta. Con un solo tipo en el filtro,
// arriba va lo del tipo entero: para cuánto le alcanza (con lo vendido sin registrar, que no dice el modelo) y las tallas que se llevan.
// La pestaña no decide cuánto pedir (ADR-0231): muestra dónde falta; la cantidad la elige quien pide, en Compras o en el Plan de campaña.
// Con una talla o un color en los filtros, cuenta solo esas tallas de cada modelo. Las cuentas viven en `lib/analisis-pedir.ts`.

/** El tono de lo que no llega: en una semana o menos, urgente; si no, atención. */
const tonoDias = (d: number | null): Estado => ((d ?? 0) <= 7 ? "urg" : "ate");

export function PestanaPedir() {
  const { datos, acceso, prendas, filtros, orden, diasDeVentas, abrirFicha, sedeDe } = useAnalisis();
  const [rinde, setRinde] = useState(false);
  const hastaNavidad = diasANavidad(datos.hoy);
  const { agotados, seAcaban } = useMemo(
    () => queHayQuePedir(prendas, filtros, diasDeVentas, datos.hoy, orden.pedir),
    [prendas, filtros, diasDeVentas, datos.hoy, orden.pedir],
  );
  const sinRegistro = useMemo(() => tiposSinRegistrar(datos.prendas, datos.sinPrendaPorTipo), [datos.prendas, datos.sinPrendaPorTipo]);
  const ciudadDe = (id: string) => sedeDe(id)?.ciudad;
  const n = agotados.length + seAcaban.length;
  // Un solo tipo en el filtro: arriba, lo del tipo entero.
  const unTipo = filtros.tipo.length === 1 ? (filtros.tipo[0] ?? null) : null;
  const ayuda = [
    `${textoRitmo(diasDeVentas)}.`,
    "Lo vendido sin registrar no dice el modelo: cuenta en su tipo (elige un tipo en los filtros para verlo).",
    sinRegistro.length > 0 ? notaTiposSinRegistrar(sinRegistro) : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Lo agotado: cuándo se agotó y cuántas se vendieron en cuántos días.
  const tarjetasAgotados = agotados.map((a, k) => {
    const m = a.modelo;
    const lineas = textoVendiste(a);
    const pie = pieDePedir(m, datos.hoy, ciudadDe);
    const cuando = a.agoto ? fechaCorta(a.agoto) : null;
    return (
      <TarjetaPrenda
        key={m.varianteId}
        i={5 + k}
        miniatura={<TilePrenda prenda={m} tamano={72} />}
        nombre={m.nombre}
        que={queTiene(m)}
        antes={cuando ? "Se agotó el" : undefined}
        numero={cuando ?? "Ya no hay"}
        lineas={lineas}
        est="urg"
        detalle={pie ?? undefined}
        etiqueta={`${nombreLargo(m)}: ${cuando ? `se agotó el ${cuando}` : "ya no hay"}. ${lineas.join(" ")}.${pie ? ` ${pie}.` : ""} Enter abre su ficha.`}
        onAbrir={() => abrirFicha(m.varianteId)}
      />
    );
  });
  // Lo que todavía tiene algo y no llega a Navidad: hasta cuándo alcanza, cuánto tienes y cuánto vendes por semana.
  const tarjetasSeAcaban = seAcaban.map(({ modelo: m, dias, tiene, porDia }, k) => {
    const d = diasEnteros(dias) ?? 1;
    const hasta = fechaEnQueSeAcaba(datos.hoy, d);
    const lineas = [`Tienes ${tiene}`, textoVendesPorSemana(porDia)];
    const pie = pieDePedir(m, datos.hoy, ciudadDe);
    return (
      <TarjetaPrenda
        key={m.varianteId}
        i={5 + k}
        miniatura={<TilePrenda prenda={m} tamano={72} />}
        nombre={m.nombre}
        que={queTiene(m)}
        antes="Hasta el"
        numero={hasta}
        lineas={lineas}
        est={tonoDias(d)}
        detalle={pie ?? undefined}
        etiqueta={`${nombreLargo(m)}: te alcanza hasta el ${hasta}. ${lineas.join(". ")}.${pie ? ` ${pie}.` : ""} Enter abre su ficha.`}
        onAbrir={() => abrirFicha(m.varianteId)}
      />
    );
  });
  const parteAgotados =
    tarjetasAgotados.length > 0 ? <ParteQuePedir key="agotados" titulo="Ya se agotaron" guia="analisis.pedir-agotados" tarjetas={tarjetasAgotados} /> : null;
  const parteSeAcaban =
    tarjetasSeAcaban.length > 0 ? (
      <ParteQuePedir key="seAcaban" titulo="Se acaban antes de Navidad" guia="analisis.pedir-tarjetas" tarjetas={tarjetasSeAcaban} />
    ) : null;

  if (prendas.length === 0)
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
        // Sin nada que pedir, no dice «va bien» si los datos no alcanzan: «Para saber», como su tarjeta en «Hoy».
        est={n > 0 ? "ate" : estadoSinNada(datos.puedeHablar)}
        {...(n > 0 ? { cuenta: n, cifra: plural(n, "modelo", "modelos") } : { cifra: "Ninguno" })}
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

      {unTipo && <BloqueTipo categoria={unTipo} />}

      {/* Las dos partes; arriba, la que responde el orden elegido (Felipe 2026-11-24): «no hay stock» → lo agotado, «quedan pocos» →
          lo que se acaba antes de Navidad, con lo que se acaba en 2 semanas primero. Cada una muestra sus 10 primeras y «Ver N más». */}
      {(parteDeArriba(orden.pedir) === "agotados" ? [parteAgotados, parteSeAcaban] : [parteSeAcaban, parteAgotados])}

      <div className="entra flex flex-col gap-4" style={{ ["--i" as string]: 11 }}>
        <BotonVerMas abierto={rinde} onCambiar={setRinde} texto="Ver lo que más rinde" forma="enlace" />
        {rinde && <BloqueRinde />}
      </div>
    </>
  );
}

/**
 * Una parte de «Qué pedir»: su título con cuántos son, las primeras 10 tarjetas y, si hay más, «Ver N más» con el resto (Felipe 2026-11-24:
 * «por defecto el top 10», y que se pueda ver más). El resto baja en su lugar con la pieza única de «Ver más» (ADR-0358).
 */
function ParteQuePedir({ titulo, guia, tarjetas }: { titulo: string; guia: string; tarjetas: ReactNode[] }) {
  const [todas, setTodas] = useState(false);
  const id = useId();
  const resto = tarjetas.slice(PRIMEROS_QUE_PEDIR);
  return (
    <section className="flex flex-col gap-3" aria-label={titulo}>
      <div className="entra" style={{ ["--i" as string]: 4 }}>
        <TituloGrupo cuenta={tarjetas.length}>{titulo}</TituloGrupo>
      </div>
      <Tarjetas guia={guia}>{tarjetas.slice(0, PRIMEROS_QUE_PEDIR)}</Tarjetas>
      {resto.length > 0 && (
        <>
          <FilasDeMas abierto={todas} id={id}>
            <div className="pt-1">
              <Tarjetas>{resto}</Tarjetas>
            </div>
          </FilasDeMas>
          <BotonVerMas abierto={todas} onCambiar={setTodas} texto={`Ver ${resto.length} más`} forma="enlace" controla={id} className="self-start" />
        </>
      )}
    </section>
  );
}

/**
 * Con un solo tipo en el filtro: para cuánto le alcanza al tipo entero (con lo vendido sin registrar, que la venta anota por tipo y no por
 * modelo, si no hay otro filtro) y las tallas que se llevan. Es lo que antes decía la hoja de cada tipo.
 */
function BloqueTipo({ categoria }: { categoria: string }) {
  const { datos, prendas, filtros, diasDeVentas } = useAnalisis();
  const hastaNavidad = diasANavidad(datos.hoy);
  const tipo = useMemo(
    () => alcanceConFiltros(prendas, datos.tallas, filtros, diasDeVentas, hastaNavidad, datos.sabePiso, datos.sinPrendaPorTipo).find((t) => t.categoria === categoria) ?? null,
    [prendas, datos.tallas, filtros, diasDeVentas, hastaNavidad, datos.sabePiso, datos.sinPrendaPorTipo, categoria],
  );
  const base = useMemo(
    () => baseConFiltros(prendas, datos.tallas, filtros).flatMap((p) => ("variantes" in p ? (p.variantes as PrendaAnalisis[]) : [p])),
    [prendas, datos.tallas, filtros],
  );
  if (!tipo) return null;
  const d = diasEnteros(tipo.dias);
  const est: Estado = d === null ? "nd" : !tipo.pide ? "bien" : tonoDias(d);
  const veredicto =
    d === null
      ? `${categoria}: no se vendió en ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}.`
      : d === 0
        ? `${categoria}: ya no hay. Pide para Navidad.`
        : tipo.pide
          ? `${categoria}: te alcanza para ${d} ${plural(d, "día", "días")}; no llega a Navidad.`
          : `${categoria}: te alcanza hasta Navidad.`;
  return (
    <section className="tarjeta bloque entra flex flex-col gap-4" style={{ ["--i" as string]: 4 }}>
      <div className="flex flex-col gap-1">
        <p className="an-veredicto" style={{ ["--c" as string]: COLOR_ESTADO[est] }}>
          <Icono nombre={ICONO_ESTADO[est]} />
          <span>{veredicto}</span>
        </p>
        <p className="texto-detalle m-0">
          Vendiste {tipo.vendidas}
          {tipo.sinPrenda > 0 ? ` (${tipo.sinPrenda} sin su prenda)` : ""} en {diasDeVentas} {plural(diasDeVentas, "día", "días")} · tienes {tipo.tiene}
        </p>
      </div>
      <BloqueCurva c={curvaDeTallas(base, categoria)} categoria={categoria} />
    </section>
  );
}

function BloqueCurva({ c, categoria }: { c: CurvaTallas; categoria: string | null }) {
  const { diasDeVentas } = useAnalisis();
  // Va dentro del panel del tipo (opción A): el título del panel ya dice el tipo.
  const titulo = <TituloGrupo nivel={4}>Las tallas que se llevan</TituloGrupo>;
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
