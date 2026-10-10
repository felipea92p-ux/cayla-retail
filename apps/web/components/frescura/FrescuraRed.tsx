import { ChevronRight, Store } from "lucide-react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { Vacio } from "@/components/ui/Vacio";
import { CLASE_TRAMO_PISO, NOMBRE_TRAMO_PISO, TRAMOS_DEL_100, porcentajes, type FamiliaPiso } from "@/lib/frescura-piso";
import { trozosRicos } from "@/lib/frescura-pantalla";
import { cuadricula, enlaceATienda, razonDeLaTienda, resumenCayla } from "@/lib/frescura-red";
import type { DatosRed } from "@/lib/frescura";
import { NivelChip } from "./piezas";

// CAYLA Global ▸ Frescura del piso (ADR-0208, act. 2026-10-10 (b), decisión 4): la misma pregunta para la empresa entera. Arriba, CAYLA (la
// suma de las tiendas); debajo, una barra por tienda en la MISMA escala —comparar es comparar posiciones, no largos sueltos—; al final, la
// cuadrícula categoría × tienda. El nombre de cada tienda y cada celda llevan a esa tienda con la categoría ya elegida (Felipe, Formidable
// 2026-10-10 (c): «quitar y conectar»; la gerente ciega no pudo llegar a las prendas). Debajo de cada tienda, su registro al colgar y lo
// decidido este mes, que antes vivían en «Las N tiendas». Sin estado ni JavaScript propio: lo arma `frescura-red.ts` en el servidor.

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;
const colgadas = (n: number) => `${n} ${n === 1 ? "unidad colgada" : "unidades colgadas"}`;

/** La plantilla de la cuadrícula según cuántas tiendas hay: escrita entera, porque Tailwind solo genera las clases que ve escritas. */
const PLANTILLAS: Record<number, string> = {
  1: "sm:grid-cols-[minmax(160px,1.6fr)_minmax(0,1fr)]",
  2: "sm:grid-cols-[minmax(160px,1.6fr)_repeat(2,minmax(0,1fr))]",
  3: "sm:grid-cols-[minmax(160px,1.6fr)_repeat(3,minmax(0,1fr))]",
  4: "sm:grid-cols-[minmax(160px,1.6fr)_repeat(4,minmax(0,1fr))]",
};

function segmentos(f: FamiliaPiso) {
  return TRAMOS_DEL_100.map((t) => ({ clave: t, nombre: NOMBRE_TRAMO_PISO[t], valor: f.unidades[t], clase: CLASE_TRAMO_PISO[t] }));
}

function linea(f: FamiliaPiso): string {
  const pct = porcentajes(f.unidades);
  return TRAMOS_DEL_100.filter((t) => f.unidades[t] > 0)
    .map((t) => `${pct[t]} % ${NOMBRE_TRAMO_PISO[t].toLowerCase()}`)
    .join(" · ");
}

function Negritas({ texto }: { texto: string }) {
  return (
    <>
      {trozosRicos(texto).map((t, i) => (t.negrita ? <b key={i}>{t.texto}</b> : <span key={i}>{t.texto}</span>))}
    </>
  );
}

export function FrescuraRed({ red }: { red: DatosRed }) {
  const cabecera = (frase: string) => <EncabezadoPagina sede="CAYLA Global" titulo="Frescura del piso" subtitulo={<Negritas texto={frase} />} />;
  if (!red.esLider)
    return (
      <div className="space-y-6">
        {cabecera("¿Está fresco el piso de CAYLA?")}
        <section className="card-cayla px-4 py-5 sm:px-5">
          <Vacio tamano="chico" alinear="izquierda" icono={<Store strokeWidth={1.5} />}>
            Por ahora, la frescura de las tres tiendas juntas la lee el líder. Para ver una tienda, elígela en el selector de arriba.
          </Vacio>
        </section>
      </div>
    );
  const { principal, respuesta } = resumenCayla(red.tiendas);
  const filas = cuadricula(red.tiendas);
  const plantilla = PLANTILLAS[Math.min(4, Math.max(1, red.tiendas.length))];
  return (
    <div className="space-y-6">
      {cabecera(`${respuesta.pregunta} **${respuesta.respuesta}**`)}

      <section aria-labelledby="red-titulo" className="card-cayla px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="red-titulo" className="font-display text-[22px] leading-tight">
            {principal ? "CAYLA, las tiendas juntas" : "Las tiendas"}
          </h2>
          {principal && <span className="text-[13px] tabular-nums text-taupe">{colgadas(principal.total)}</span>}
        </div>
        {principal && (
          <>
            <BarraApilada segmentos={segmentos(principal)} alto={12} unidad="unidades colgadas" className="mt-3" />
            <p className="mt-2 text-[13px] tabular-nums text-taupe">
              {linea(principal)}
              {respuesta.antes && (
                <>
                  {" "}
                  · hace 4 semanas: {respuesta.antes.fresca} % fresca, {respuesta.antes.envejeciendo} % envejeciendo
                </>
              )}
            </p>
          </>
        )}
        <ul aria-label="Cada tienda" className="mt-4 divide-y divide-sand border-t border-sand">
          {red.tiendas.map((t) => (
            <li key={t.id} className="grid grid-cols-1 items-center gap-x-4 gap-y-1.5 py-3 sm:grid-cols-[minmax(140px,1fr)_minmax(200px,2fr)_minmax(0,2fr)]">
              <span className="text-[14.5px] font-semibold leading-tight">
                {/* Un <a> simple: abrir la ruta cambia la tienda del selector, nunca se pide por adelantado. */}
                <a href={enlaceATienda(t.id)} className="btn-cayla btn-enlace inline-flex min-h-6 items-center gap-0.5 text-[14.5px] font-semibold">
                  {t.nombre}
                  <ChevronRight aria-hidden strokeWidth={1.8} className="h-3.5 w-3.5" />
                </a>
                {t.principal && <span className="text-[12.5px] font-normal tabular-nums text-taupe"> · {unidades(t.principal.total)}</span>}
              </span>
              {t.fallo ? (
                <span className="text-[13px] text-taupe sm:col-span-2">{t.fallo}</span>
              ) : t.principal && t.principal.total > 0 ? (
                <>
                  <BarraApilada segmentos={segmentos(t.principal)} alto={8} unidad="unidades colgadas" />
                  <span className="text-[12.5px] leading-snug tabular-nums text-taupe">
                    {linea(t.principal)}
                    {razonDeLaTienda(t.puerta) && <span className="block text-ambar-profundo">{razonDeLaTienda(t.puerta)}</span>}
                  </span>
                </>
              ) : (
                <span className="text-[13px] text-taupe sm:col-span-2">Nada colgado todavía.</span>
              )}
              <RegistroDeTienda t={t} />
            </li>
          ))}
        </ul>
        <ul aria-label="Qué significa cada color" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-taupe">
          {TRAMOS_DEL_100.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <MuestraTramo clase={CLASE_TRAMO_PISO[t]} />
              {NOMBRE_TRAMO_PISO[t]}
            </li>
          ))}
        </ul>
      </section>

      {filas.length > 0 && (
        <Tabla>
          <div className="px-5 py-4">
            <h2 className="font-display text-[20px] leading-tight sm:text-[22px]">Qué envejece en cada tienda</h2>
            <p className="mt-1 text-[12.5px] text-taupe">De cada 100 unidades colgadas de la categoría, cuántas ya pasaron lo que tarda en venderse.</p>
          </div>
          <Encabezado plantilla={plantilla} columnas={[{ titulo: "Categoría" }, ...red.tiendas.map((t) => ({ titulo: t.nombre, alinear: "der" as const }))]} />
          {filas.map((f) => (
            <div key={f.categoriaId} className={fila(plantilla)}>
              <span className={celda("izq", "font-semibold")}>{f.nombre}</span>
              {f.celdas.map((c, i) => {
                const tienda = red.tiendas[i];
                return (
                  <span key={tienda.id} className={celda("der")}>
                    <span className="text-[12px] text-taupe sm:hidden">{tienda.nombre}: </span>
                    {c === null ? (
                      <span className="text-taupe">—</span>
                    ) : (
                      // La celda lleva a esa tienda con la categoría elegida.
                      <a href={enlaceATienda(tienda.id, f.categoriaId)} aria-label={`Ver ${f.nombre} en ${tienda.nombre}`} className="fila-cayla -m-1 inline-block rounded-md p-1 text-right">
                        {c.sinSaber === c.unidades ? (
                          // Nada que se sepa: «0 %» se leía como buena noticia (Formidable 2026-10-10 (c)).
                          <span className="text-taupe">Aún no se sabe · {c.unidades}</span>
                        ) : (
                          <>
                            <span className={c.deMas ? "font-semibold text-ambar-profundo" : ""}>{c.envejeciendo} %</span>
                            <span className="text-[12px] text-taupe"> de {c.unidades}</span>
                            {c.sinSaber > 0 && <span className="block text-[12px] text-taupe">{c.sinSaber === 1 ? "1 aún no se sabe" : `${c.sinSaber} aún no se saben`}</span>}
                          </>
                        )}
                      </a>
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </Tabla>
      )}

    </div>
  );
}

/** El registro al colgar de la tienda, mes a mes, y lo decidido este mes: una línea chica bajo su nombre (antes, en «Las N tiendas»). */
function RegistroDeTienda({ t }: { t: DatosRed["tiendas"][number] }) {
  if (t.registro.length === 0 && !t.decidido) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] leading-snug text-taupe sm:col-span-3">
      {t.registro.length > 0 && <span>Registro al colgar:</span>}
      {t.registro.map((r) => (
        <span key={r.mes} className="inline-flex items-center gap-1.5">
          <span>
            {r.mes}: <span className="text-tinta">{r.texto}</span>
          </span>
          <NivelChip nivel={r.nivel} />
        </span>
      ))}
      {t.decidido && (
        <span>
          Decidido este mes: <span className="text-tinta">{t.decidido}</span>
        </span>
      )}
    </span>
  );
}
