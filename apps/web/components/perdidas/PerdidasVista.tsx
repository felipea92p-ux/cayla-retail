import Link from "next/link";
import type { ReactNode } from "react";
// Rutas relativas (no `@/`): la vista se dibuja también en `lib/perdidas-vista.test.ts`, con los datos reales de la base.
import { TarjetaCifra } from "../ui/TarjetaCifra";
import { CapsulaColor } from "../ui/MuestraColor";
import { Encabezado, Tabla, TABLA, celda, fila, type Columna } from "../ui/Tabla";
import { compararTallas } from "../../lib/tallas";
import {
  AYUDA_RAZON,
  etiquetaPrenda,
  etiquetaZona,
  fraseRepeticion,
  hrefDocumento,
  hrefPerdidas,
  hrefRepeticion,
  listaCortada,
  solesPerdidas,
  textoRazon,
  textoRespaldo,
  unidadesTexto,
  type HechoPerdida,
  type PeriodoPerdidas,
  type RazonPerdida,
  type Repeticion,
  type ResumenPerdidas,
} from "../../lib/perdidas-reglas";

// La pestaña «Pérdidas» de Movimientos (ADR-0328, actividad 14; Felipe, 2026-10-04). Responde «¿cuánto perdimos?» con
// la MISMA cuenta que Finanzas (Mermas del Estado de resultados) y el resumen de Inventario: la base la decide
// (`fn_perdida_razon`), esta pantalla solo la dibuja. Orden de toda pantalla (ADR-0169): cifras → lo que decide (más
// faltan, por qué, se repite) → la lista → nota en hueso.
//
// Lo que apareció va APARTE, nunca restado de lo perdido: «−9 · +4» no es «−5» (ADR-0327). Unidades y totales en soles
// para todos; el costo por prenda, solo el líder (la base ni siquiera lo manda a los demás). Filtrada a UNA prenda, quien no
// es líder ve solo unidades: sus soles serían su costo, y la base tampoco los manda (`soles` null).

export function PerdidasVista({
  resumen,
  repeticiones,
  sede,
  periodo,
  periodoTexto,
  filtro,
  modulos,
  selectorPeriodo,
}: {
  /** null = la base no respondió: se dice, no se dibuja un 0. */
  resumen: ResumenPerdidas | null;
  /** Lo que «se repite» en los últimos 30 días (la misma regla del aviso del Inicio). null = no se pudo leer (sin filtro) o
   *  no se mide (con una prenda o una zona elegida): la tarjeta dice cuál de las dos. */
  repeticiones: Repeticion[] | null;
  sede: string;
  periodo: PeriodoPerdidas;
  periodoTexto: string;
  /** La pestaña filtrada a una prenda o a una zona (desde el aviso o desde una fila). */
  filtro: { varianteId: string | null; sububicacionId: string | null };
  /** Los módulos de la cuenta entre los de los respaldos (`MODULOS_DE_RESPALDO`): sin el módulo, el respaldo va sin enlace. */
  modulos: readonly string[];
  /** Los períodos (enlaces de la URL): los arma la página, que es la dueña de la URL. */
  selectorPeriodo?: ReactNode;
}) {
  const filtrada = Boolean(filtro.varianteId || filtro.sububicacionId);
  const queFiltra = resumen && filtrada ? textoFiltro(resumen, filtro) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selectorPeriodo}
        {filtrada && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-tinta/75">
            <span>
              Solo <b className="font-medium text-tinta">{queFiltra ?? "lo elegido"}</b>
            </span>
            <Link href={hrefPerdidas({ periodo })} className="btn-cayla btn-enlace text-sm">
              Ver toda la sede
            </Link>
          </p>
        )}
      </div>

      {!resumen ? (
        <p className="nota-cayla text-sm">
          Las pérdidas de {sede} no se pudieron leer ahora. Vuelve a abrir la pestaña en un momento; la lista de movimientos sigue disponible.
        </p>
      ) : (
        <>
          <Cifras resumen={resumen} repeticiones={filtrada ? null : repeticiones} filtrada={filtrada} sede={sede} periodoTexto={periodoTexto} />
          {resumen.perdido.hechos === 0 && resumen.aparecio.hechos === 0 ? (
            <Vacio sede={sede} periodoTexto={periodoTexto} filtrada={filtrada} periodo={periodo} />
          ) : (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <MasFaltan resumen={resumen} />
                <PorRazon resumen={resumen} />
              </div>
              <PorCategoriaYTalla resumen={resumen} />
              {!filtrada && repeticiones && repeticiones.length > 0 && <SeRepite repeticiones={repeticiones} />}
              <ListaHechos
                titulo="Lo que se perdió"
                bajada="De lo más reciente a lo más antiguo. Toca una prenda para ver solo sus pérdidas."
                hechos={resumen.hechos.filter((h) => h.lado === "perdida")}
                veCosto={resumen.veCosto}
                periodo={periodo}
                modulos={modulos}
                vacio="Nada salió sin venderse en este período."
              />
              <ListaHechos
                titulo="Lo que apareció · por explicar"
                bajada="Prendas que el sistema no tenía y aparecieron. No se restan de lo perdido: cada una tiene su historia."
                hechos={resumen.hechos.filter((h) => h.lado === "aparecio")}
                veCosto={resumen.veCosto}
                periodo={periodo}
                modulos={modulos}
                vacio="No apareció nada en este período."
              />
              {listaCortada(resumen) && (
                <p className="nota-cayla text-sm">
                  La lista muestra los {resumen.hechos.length.toLocaleString("es-PE")} hechos más recientes de {resumen.hechosTotal.toLocaleString("es-PE")}. Las
                  cifras de arriba sí cuentan todos; elige un período más corto para ver la lista entera.
                </p>
              )}
            </>
          )}
        </>
      )}

      <p className="nota-cayla">
        <b>Una sola cuenta:</b> perder es todo lo que salió sin venderse —faltantes al contar o quitados a mano, dañadas que se
        botaron o donaron, la venta anulada cuya prenda no volvió y lo que faltó en un traslado (en la sede que lo envió)—. Es la
        misma cifra de «Mermas» en Finanzas. Lo liquidado es venta; el stock inicial, el primer conteo de una sede y lo que se
        mueve entre piso y almacén nunca son pérdida. Lo que apareció va aparte.
      </p>
    </div>
  );
}

function textoFiltro(r: ResumenPerdidas, filtro: { varianteId: string | null; sububicacionId: string | null }): string | null {
  if (filtro.varianteId) {
    const h = r.hechos.find((x) => x.varianteId === filtro.varianteId);
    return h ? etiquetaPrenda(h) : "esta prenda";
  }
  const h = r.hechos.find((x) => x.sububicacionId === filtro.sububicacionId);
  return h ? (etiquetaZona(h) ?? "esta zona") : "esta zona";
}

// Tres tarjetas: lo perdido (con su valor), lo que apareció (aparte) y lo que se repite. La primera es la respuesta.
function Cifras({
  resumen,
  repeticiones,
  filtrada,
  sede,
  periodoTexto,
}: {
  resumen: ResumenPerdidas;
  repeticiones: Repeticion[] | null;
  filtrada: boolean;
  sede: string;
  periodoTexto: string;
}) {
  const p = resumen.perdido;
  const a = resumen.aparecio;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TarjetaCifra
        etiqueta={`Se perdió en ${sede} · ${periodoTexto}`}
        valor={p.unidades === 0 ? "0" : `−${p.unidades.toLocaleString("es-PE")}`}
        unidad={p.unidades === 1 ? "prenda" : "prendas"}
        tono={p.unidades > 0 ? "text-rojo" : undefined}
      >
        {p.unidades === 0 ? (
          "Nada salió sin venderse."
        ) : (
          <>
            <span className="block">
              {p.soles === null ? "El valor en soles de una sola prenda lo ve el líder." : `${solesPerdidas(p.soles)} al costo de cada día`}
            </span>
            {p.soles !== null && p.sinCosto > 0 && (
              <span className="block">
                {unidadesTexto(p.sinCosto)} sin costo cargado: en soles se queda corto.
              </span>
            )}
          </>
        )}
      </TarjetaCifra>
      <TarjetaCifra
        etiqueta="Apareció · por explicar"
        valor={a.unidades === 0 ? "0" : `+${a.unidades.toLocaleString("es-PE")}`}
        unidad={a.unidades === 1 ? "prenda" : "prendas"}
      >
        {a.unidades === 0 ? "No apareció nada." : a.soles === null ? "No se resta de lo perdido" : `${solesPerdidas(a.soles)} · no se resta de lo perdido`}
      </TarjetaCifra>
      <TarjetaCifra
        etiqueta="Se repite · últimos 30 días"
        valor={repeticiones === null ? "—" : repeticiones.length.toLocaleString("es-PE")}
        punto={repeticiones && repeticiones.length > 0 ? "ambar" : "neutro"}
        href={repeticiones && repeticiones.length > 0 ? "#se-repite" : undefined}
      >
        {filtrada
          ? "Con una prenda o una zona elegida no se mide: mira toda la sede."
          : repeticiones === null
            ? "No se pudo leer lo que se repite. Vuelve a abrir la pestaña en un momento."
            : repeticiones.length === 0
            ? "Ninguna prenda ni zona perdió dos veces, y no hubo restas grandes sin nota."
            : fraseRepeticion(repeticiones[0])}
      </TarjetaCifra>
    </div>
  );
}

// «Más faltan»: categoría · talla · color, las 5 con más prendas (Felipe: la señal para el Taller es el atributo, no el
// modelo, porque los modelos van cambiando).
function MasFaltan({ resumen }: { resumen: ResumenPerdidas }) {
  return (
    <section aria-labelledby="mas-faltan" className="card-cayla p-5">
      <h2 id="mas-faltan" className="font-display text-xl text-tinta">
        Más faltan
      </h2>
      <p className="mt-1 text-sm text-taupe">Categoría · talla · color con más prendas perdidas en el período.</p>
      {resumen.masFaltan.length === 0 ? (
        <p className="mt-4 text-sm text-tinta/75">Nada se perdió en el período.</p>
      ) : (
        <ol className="mt-4 divide-y divide-sand">
          {resumen.masFaltan.map((m, i) => (
            <li key={`${m.categoria}-${m.talla}-${m.color}`} className="flex items-center gap-3 py-2.5">
              <span className="w-5 shrink-0 text-right text-sm tabular-nums text-taupe">{i + 1}</span>
              <CapsulaColor fondo={m.colorHex} compacta />
              <span className="min-w-0 flex-1 truncate text-sm text-tinta">
                {m.categoria} · {m.talla} · {m.color}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums text-tinta">
                {unidadesTexto(m.unidades)}
                <span className="block text-xs text-taupe">{m.veces === 1 ? "en 1 día" : `en ${m.veces} días`}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PorRazon({ resumen }: { resumen: ResumenPerdidas }) {
  const perdidas = resumen.porRazon.filter((r) => r.lado === "perdida");
  return (
    <section aria-labelledby="por-razon" className="card-cayla p-5">
      <h2 id="por-razon" className="font-display text-xl text-tinta">
        Por qué se perdió
      </h2>
      <p className="mt-1 text-sm text-taupe">Cada prenda perdida, una sola vez, por su razón.</p>
      {perdidas.length === 0 ? (
        <p className="mt-4 text-sm text-tinta/75">Nada se perdió en el período.</p>
      ) : (
        <ul className="mt-4 divide-y divide-sand">
          {perdidas.map((r) => (
            <li key={r.razon} className="flex items-baseline gap-3 py-2.5" title={AYUDA_RAZON[r.razon as RazonPerdida]}>
              <span className="min-w-0 flex-1 text-sm text-tinta">
                {textoRazon(r.razon, "perdida")}
                {AYUDA_RAZON[r.razon as RazonPerdida] && <span className="block text-xs text-taupe">{AYUDA_RAZON[r.razon as RazonPerdida]}</span>}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums text-tinta">
                {unidadesTexto(r.unidades)}
                {r.soles !== null && <span className="block text-xs text-taupe">{solesPerdidas(r.soles)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PorCategoriaYTalla({ resumen }: { resumen: ResumenPerdidas }) {
  if (resumen.porCategoria.length === 0) return null;
  // Las tallas en el orden de la curva (S · M · L, 28 · 30 · 32), no por cantidad: así se ve en qué parte de la curva se pierde.
  const tallas = [...resumen.porTalla].sort((x, y) => compararTallas(x.talla, y.talla));
  const fila2 = (etiqueta: ReactNode, unidades: number, soles: number | null, clave: string) => (
    <li key={clave} className="flex items-baseline gap-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-tinta">{etiqueta}</span>
      <span className="shrink-0 text-sm tabular-nums text-tinta">{unidadesTexto(unidades)}</span>
      {soles !== null && <span className="w-24 shrink-0 text-right text-xs tabular-nums text-taupe">{solesPerdidas(soles)}</span>}
    </li>
  );
  return (
    <section aria-label="Lo perdido por categoría y por talla" className="card-cayla grid gap-6 p-5 lg:grid-cols-2">
      <div>
        <h2 className="font-display text-xl text-tinta">Por categoría</h2>
        <ul className="mt-3 divide-y divide-sand">{resumen.porCategoria.map((c) => fila2(c.categoria, c.unidades, c.soles, c.categoria))}</ul>
      </div>
      <div>
        <h2 className="font-display text-xl text-tinta">Por talla</h2>
        <ul className="mt-3 divide-y divide-sand">{tallas.map((t) => fila2(t.talla, t.unidades, t.soles, t.talla))}</ul>
      </div>
    </section>
  );
}

// Lo mismo que avisa el Inicio del líder, con un enlace por hallazgo a la pestaña filtrada.
function SeRepite({ repeticiones }: { repeticiones: Repeticion[] }) {
  return (
    <section id="se-repite" aria-labelledby="se-repite-titulo" className="card-cayla scroll-mt-24 p-5">
      <h2 id="se-repite-titulo" className="font-display text-xl text-tinta">
        Se repite
      </h2>
      <p className="mt-1 text-sm text-taupe">
        En los últimos 30 días: la misma prenda o la misma zona perdió en dos días distintos, o se quitaron muchas sin nota.
      </p>
      <ul className="mt-4 divide-y divide-sand">
        {repeticiones.map((r) => (
          <li key={r.clave} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <span className="min-w-0 text-sm text-tinta">{fraseRepeticion(r)}</span>
            <Link href={hrefRepeticion(r)} className="btn-cayla btn-enlace shrink-0 text-sm">
              {r.tipo === "zona" ? "Ver esa zona" : "Ver esa prenda"}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ListaHechos({
  titulo,
  bajada,
  hechos,
  veCosto,
  periodo,
  modulos,
  vacio,
}: {
  titulo: string;
  bajada: string;
  hechos: HechoPerdida[];
  veCosto: boolean;
  periodo: PeriodoPerdidas;
  modulos: readonly string[];
  vacio: string;
}) {
  // Una plantilla para el encabezado y las filas (Tabla): si cambia una columna, cambian las dos. El costo por prenda solo
  // existe para el líder: su columna no se dibuja vacía para los demás, no está.
  const plantilla = veCosto
    ? "sm:grid-cols-[4.5rem_minmax(0,1.7fr)_minmax(0,1.2fr)_6rem_4.5rem_5.5rem_minmax(0,1fr)]"
    : "sm:grid-cols-[4.5rem_minmax(0,1.7fr)_minmax(0,1.2fr)_6rem_4.5rem_minmax(0,1fr)]";
  const columnas: Columna[] = [
    { titulo: "Día" },
    { titulo: "Prenda" },
    { titulo: "Por qué" },
    { titulo: "Dónde" },
    { titulo: "Prendas", alinear: "der" },
    ...(veCosto ? [{ titulo: "Costo c/u", alinear: "der" as const, ayuda: "Al costo que tenía la prenda ese día (solo lo ve el líder)" }] : []),
    { titulo: "Respaldo" },
  ];
  return (
    <section aria-label={titulo}>
      <h2 className="font-display text-xl text-tinta">{titulo}</h2>
      <p className="mt-1 text-sm text-taupe">{bajada}</p>
      <Tabla className="mt-3">
        {hechos.length === 0 ? (
          <p className={TABLA.vacio}>{vacio}</p>
        ) : (
          <>
            <Encabezado columnas={columnas} plantilla={plantilla} />
            {hechos.map((h) => {
              const doc = hrefDocumento(h, modulos);
              const respaldo = textoRespaldo(h);
              return (
                <div key={`${h.fuente}-${h.id}`} role="row" className={fila(plantilla)}>
                  <span className={celda("izq", "text-sm tabular-nums text-taupe")}>{diaCorto(h.dia)}</span>
                  <span className={celda("izq", "text-sm")}>
                    <Link href={hrefPerdidas({ periodo, varianteId: h.varianteId })} className="text-tinta underline decoration-tinta/25 underline-offset-2 hover:text-rojo">
                      {etiquetaPrenda(h)}
                    </Link>
                    {h.codigo && <span className="ml-1.5 text-xs text-taupe">{h.codigo}</span>}
                  </span>
                  <span className={celda("izq", "text-sm text-tinta")}>{textoRazon(h.razon, h.lado)}</span>
                  <span className={celda("izq", "text-sm text-tinta/75")}>{etiquetaZona(h) ?? (h.razon === "traslado" ? "En el camino" : "—")}</span>
                  {/* En tinta: toda la lista es de pérdidas (o de apariciones) y el rojo de la pantalla ya lo lleva la cifra de arriba. */}
                  <span className={celda("der", "text-sm text-tinta")}>
                    {h.lado === "perdida" ? "−" : "+"}
                    {h.unidades.toLocaleString("es-PE")}
                  </span>
                  {veCosto && (
                    <span className={celda("der", "text-sm text-tinta/75")}>{h.costoUnitario === null ? "—" : h.costoUnitario === 0 ? "Sin costo" : solesPerdidas(h.costoUnitario)}</span>
                  )}
                  <span className={celda("izq", "text-sm text-tinta/75")}>
                    {doc ? (
                      <Link href={doc} className="underline decoration-tinta/25 underline-offset-2 hover:text-rojo">
                        {respaldo}
                      </Link>
                    ) : (
                      respaldo
                    )}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </Tabla>
    </section>
  );
}

function Vacio({ sede, periodoTexto, filtrada, periodo }: { sede: string; periodoTexto: string; filtrada: boolean; periodo: PeriodoPerdidas }) {
  return (
    <div className="card-cayla flex flex-col items-center gap-2.5 px-5 py-9 text-center">
      <h2 className="font-display text-[22px] leading-tight text-tinta">Nada que explicar en {periodoTexto}</h2>
      <p className="max-w-[52ch] text-sm leading-relaxed text-taupe">
        {filtrada
          ? `Lo elegido no perdió ni apareció en ${sede} en ese período.`
          : `En ${sede} nada salió sin venderse y nada apareció en ese período.`}
      </p>
      <div className="mt-1.5 flex flex-wrap justify-center gap-2">
        {periodo !== "90" && (
          <Link href={hrefPerdidas({ periodo: "90" })} className="btn-cayla btn-secundario">
            Ver los últimos 90 días
          </Link>
        )}
        {filtrada && (
          <Link href={hrefPerdidas({ periodo })} className="btn-cayla btn-secundario">
            Ver toda la sede
          </Link>
        )}
      </div>
    </div>
  );
}

/** «12/10»: el día del hecho, corto (la lista es de un período que ya se dice arriba). */
function diaCorto(dia: string): string {
  const [, m, d] = dia.split("-");
  return d && m ? `${d}/${m}` : dia;
}
