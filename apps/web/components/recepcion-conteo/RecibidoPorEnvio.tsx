"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonEnlace } from "@/components/ui/campos";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { CapsulaColor } from "@/components/ui/MuestraColor";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Modal } from "@/components/ui/Modal";
import { PaginacionLocal } from "@/components/ui/PaginacionLocal";
import { Encabezado, Tabla, celda, fila } from "@/components/ui/Tabla";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { FilasDeMas } from "@/components/ui/VerMas";
import type { CostoRecepcion } from "@/components/RecepcionesRecientes";
import { fechaCorta, notaSinEnvio, soles, type RecepcionReciente } from "@/lib/compras-reglas";
import { paginar } from "@/lib/paginacion";
import {
  agruparPorEnvio,
  colorDeMarca,
  deQuienLlego,
  esNotaDelAlta,
  marcasDelEnvio,
  marcasEnLaFila,
  nombreSinEnvio,
  prendasDistintas,
  sigueAbierto,
  textoTermino,
  type EnvioRecibido,
  type MarcaDelEnvio,
  type PrendaRecibida,
} from "@/lib/recibido-por-envio-reglas";
import type { MatrizModelo } from "@/lib/recepcion-matriz-reglas";

// «Terminados» por ENVÍO (Felipe 2026-10-28): una fila por envío, como «Por terminar» (un fardo con dos proveedores ya no sale partido en dos
// filas); una llegada sin envío queda como fila propia. Tocar la fila abre el envío con cada prenda recibida; tocar una prenda despliega los
// colores y tallas que se contaron, y ahí va el costo de lo que entró (antes era una columna de la lista).
// «Las marcas al frente» (Felipe 2026-11-10, propuesta B de docs/maquetas/recibidos-marca-2026-11): la fila nombra las marcas que llegaron
// (el proveedor va debajo: un mismo proveedor trae muchas) y una barrita reparte el envío por marca; la hoja abre con «De qué marcas llegó» y
// agrupa las prendas por marca. Lo que llegó sin marca se ve en ámbar: es un dato por completar en Catálogo.
const PLANTILLA = "sm:grid-cols-[6rem_8.5rem_minmax(0,1fr)_10rem_9rem]";
const PLANTILLA_DETALLE = "sm:grid-cols-[1.5rem_1fr_5rem]";
const PLANTILLA_DETALLE_COSTO = "sm:grid-cols-[1.5rem_1fr_10rem_5rem]";

const unidades = (n: number) => `${n} ${n === 1 ? "unidad" : "unidades"}`;
const prendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;
const SIN_MARCA = "Sin marca";
const nombreMarca = (m: MarcaDelEnvio) => m.marca ?? SIN_MARCA;

/** Los tramos de la barra: uno por marca, del color que le toca. */
const tramos = (marcas: readonly MarcaDelEnvio[]) =>
  marcas.map((m) => ({ clave: nombreMarca(m), nombre: nombreMarca(m), valor: m.unidades, clase: colorDeMarca(marcas, m.marca) }));

// Un envío que se sigue recibiendo deja aquí lo que ya entró al stock y, a la vez, sale arriba en «Envíos por recibir» (Felipe 2026-11-12:
// ENV-000021 salía en las dos y parecía repetido). Su fila no dice «terminó»: lleva el chip «Sigue abierto», y su hoja lleva a seguir recibiéndolo.
const TITULO_SIGUE_ABIERTO = "Lo de aquí ya entró al stock. El envío se sigue recibiendo: también está arriba, en «Envíos por recibir».";

export function RecibidoPorEnvio({
  recepciones,
  vacio,
  costos,
  porPagina,
  enviosAbiertos = [],
}: {
  recepciones: RecepcionReciente[];
  vacio: string;
  costos?: Record<string, CostoRecepcion>;
  porPagina: number;
  /** Los envíos (`despachoId`) que todavía se están recibiendo. */
  enviosAbiertos?: readonly string[];
}) {
  const [abierto, setAbierto] = useState<EnvioRecibido | null>(null);
  const abiertos = new Set(enviosAbiertos);
  const [pagina, setPagina] = useState(1);
  const envios = agruparPorEnvio(recepciones);
  const actual = paginar(envios, pagina, porPagina);

  if (envios.length === 0) return <p className="card-cayla p-5 text-sm text-tinta/65">{vacio}</p>;
  return (
    <>
      <Tabla>
        <Encabezado plantilla={PLANTILLA} columnas={[{ titulo: "Llegó" }, { titulo: "Envío" }, { titulo: "Marcas" }, { titulo: "Recibió" }, { titulo: "Unidades", alinear: "der" }]} />
        {actual.filas.map((e) => {
          const marcas = marcasDelEnvio(e);
          const { visibles, mas, sinMarca } = marcasEnLaFila(marcas);
          const termino = textoTermino(e, abiertos);
          return (
            <button key={e.clave} type="button" data-guia="recibir.reciente" onClick={() => setAbierto(e)} className={`${fila(PLANTILLA)} w-full text-left`}>
              <span className={celda("izq", "whitespace-normal text-sm tabular-nums text-tinta/65")}>
                {fechaCorta(e.llegoEn ?? e.fecha)}
                {termino && <span className="block text-sm text-tinta/55">{termino}</span>}
              </span>
              <span className={celda("izq", "overflow-visible text-sm font-semibold tabular-nums text-tinta")}>
                {e.numero ?? <span className="font-normal text-taupe">{nombreSinEnvio(e)}</span>}
                {sigueAbierto(e, abiertos) && (
                  <span className="mt-1 block">
                    <Chip tono="ambar" title={TITULO_SIGUE_ABIERTO}>
                      Sigue abierto
                    </Chip>
                  </span>
                )}
              </span>
              <span className={celda("izq", "whitespace-normal")}>
                <span className="flex flex-wrap gap-1.5">
                  {visibles.map((m) => (
                    <Chip key={m.marca} versalitas={false}>
                      <MuestraTramo clase={colorDeMarca(marcas, m.marca)} />
                      {m.marca}
                    </Chip>
                  ))}
                  {mas > 0 && (
                    <Chip versalitas={false} tono="apagado" tachado={false}>
                      +{mas} más
                    </Chip>
                  )}
                  {sinMarca && (
                    <Chip versalitas={false} tono="ambar" title={`${unidades(sinMarca.unidades)} sin marca: complétala en Catálogo`}>
                      {SIN_MARCA}
                    </Chip>
                  )}
                </span>
                <span className="mt-1 block truncate text-sm text-tinta/65">{deQuienLlego(e.proveedores)}</span>
              </span>
              <span className={celda("izq", "whitespace-normal text-sm text-tinta/65")}>
                {e.ubicacion}
                {e.recibidoPor && <span className="block">{e.recibidoPor}</span>}
              </span>
              <span className={celda("der", "text-sm text-tinta")}>
                {unidades(e.unidades)}
                <span className="block text-sm text-tinta/55">{prendas(prendasDistintas(e))}</span>
                <BarraApilada segmentos={tramos(marcas)} alto={4} decorativa className="mt-2" />
              </span>
            </button>
          );
        })}
        {actual.totalPaginas > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm text-taupe">
            <span>
              Mostrando {actual.desde}–{actual.hasta} de {envios.length}
            </span>
            <PaginacionLocal pagina={actual.pagina} totalPaginas={actual.totalPaginas} onPagina={setPagina} />
          </div>
        )}
      </Tabla>

      {abierto && <EnvioAbierto envio={abierto} costos={costos} sigueAbierto={sigueAbierto(abierto, abiertos)} onClose={() => setAbierto(null)} />}
    </>
  );
}

function EnvioAbierto({ envio, costos, sigueAbierto, onClose }: { envio: EnvioRecibido; costos?: Record<string, CostoRecepcion>; sigueAbierto: boolean; onClose: () => void }) {
  const termino = textoTermino(envio, new Set(sigueAbierto ? [envio.clave] : []));
  const [desplegadas, setDesplegadas] = useState<ReadonlySet<string>>(new Set());
  const marcas = marcasDelEnvio(envio);
  const conMarca = marcas.filter((m) => m.marca !== null).length;
  const sinMarca = marcas.find((m) => m.marca === null);
  // Con una sola marca (y con marca), su nombre va arriba junto a «de …» y no se repite como título de grupo (Felipe 2026-11-10, hoja «A · Pulida»).
  const unaMarca = marcas.length === 1 && marcas[0].marca !== null ? marcas[0] : null;
  const variosProveedores = envio.proveedores.length > 1;
  // La columna «Costo» solo para quien ve el dinero de Compras: sin `costos`, la hoja no habla de plata.
  const conCosto = !!costos;
  const plantilla = conCosto ? PLANTILLA_DETALLE_COSTO : PLANTILLA_DETALLE;
  // Cuántas prendas trajo cada llegada (lote): con más de una, su costo es un promedio y se dice.
  const prendasPorLote = new Map<string, number>();
  for (const m of marcas) for (const p of m.prendas) prendasPorLote.set(p.loteId, (prendasPorLote.get(p.loteId) ?? 0) + 1);
  const guias = [...new Set(envio.lotes.map((l) => l.numeroGuia).filter((g): g is string => !!g))];
  const notas = [...new Set(envio.lotes.map((l) => notaSinEnvio(l.nota)).filter((n): n is string => !!n && !esNotaDelAlta(n)))];
  const facturas = envio.lotes.filter((l) => l.conFactura && l.compraId);
  const idGrupo = (m: MarcaDelEnvio) => `marca-${envio.clave}-${nombreMarca(m)}`.replace(/[^\w-]/g, "_");
  const alternar = (clave: string) =>
    setDesplegadas((prev) => {
      const n = new Set(prev);
      if (!n.delete(clave)) n.add(clave);
      return n;
    });
  return (
    <Modal
      conCerrar
      titulo={envio.numero ?? nombreSinEnvio(envio)}
      subtitulo={
        <>
          {unaMarca && (
            <Chip versalitas={false} className="mr-1.5 align-[1px]">
              <MuestraTramo clase={colorDeMarca(marcas, unaMarca.marca)} />
              {unaMarca.marca}
            </Chip>
          )}
          {deQuienLlego(envio.proveedores)}
          {envio.proveedores.length > 2 && ` · ${envio.proveedores.join(", ")}`}
        </>
      }
      tamano="ancha"
      onClose={onClose}
    >
      <div data-guia="recibir.detalle" className="mt-1 space-y-4">
        {sigueAbierto && (
          <Aviso
            tono="atencion"
            chico
            titulo="Este envío sigue abierto"
            accion={
              <BotonEnlace href={`/recibir/envio/${envio.clave}`} peso="fantasma">
                Seguir recibiendo
              </BotonEnlace>
            }
          >
            Lo que ves aquí ya entró al stock. Lo que falta contar sigue en «Envíos por recibir».
          </Aviso>
        )}
        {/* Cuatro datos cortos en vez de una línea larga: lo que se busca de un vistazo (cuándo llegó, con qué guía, dónde y quién recibió). */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-sand px-4 py-3 sm:grid-cols-4">
          <Dato titulo="Llegó">
            {fechaCorta(envio.llegoEn ?? envio.fecha)}
            {termino && <span className="block text-sm text-tinta/65">{termino}</span>}
          </Dato>
          <Dato titulo="Guía">{guias.length > 0 ? guias.join(", ") : <span className="text-tinta/55">Sin guía</span>}</Dato>
          <Dato titulo="Sede">{envio.ubicacion}</Dato>
          <Dato titulo="Recibió">{envio.recibidoPor ?? <span className="text-tinta/55">—</span>}</Dato>
        </dl>

        {marcas.length > 1 && (
          <section aria-label="De qué marcas llegó" className="rounded-2xl border border-sand px-5 py-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <TituloGrupo>De qué marcas llegó</TituloGrupo>
              <span className="text-sm font-semibold tabular-nums text-tinta">{unidades(envio.unidades)}</span>
            </div>
            <BarraApilada segmentos={tramos(marcas)} sinEntrada etiqueta={`${unidades(envio.unidades)} por marca: ${marcas.map((m) => `${nombreMarca(m)} ${m.unidades}`).join(", ")}`} />
            <ul className="mt-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {marcas.map((m) => (
                <li key={nombreMarca(m)}>
                  <button
                    type="button"
                    onClick={() => document.getElementById(idGrupo(m))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="flex min-h-8 w-full items-center gap-2 rounded-lg text-left text-sm hover:bg-tinta/5"
                  >
                    <MuestraTramo clase={colorDeMarca(marcas, m.marca)} />
                    <span className={m.marca === null ? "text-ambar" : "text-tinta"}>{nombreMarca(m)}</span>
                    <span className="ml-auto tabular-nums text-tinta/65">{m.unidades}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Tabla>
          <Encabezado
            plantilla={plantilla}
            columnas={[{ titulo: "" }, { titulo: "Prenda" }, ...(conCosto ? [{ titulo: "Costo", alinear: "der" as const }] : []), { titulo: "Cantidad", alinear: "der" as const }]}
          />
          {marcas.flatMap((m) => {
            // Si la marca llegó de dos proveedores, cada prenda dice de quién; si no, lo dice el título del grupo.
            const deVarios = m.proveedores.length > 1;
            return [
              unaMarca ? null : (
                <div key={`g-${nombreMarca(m)}`} id={idGrupo(m)} className="flex scroll-mt-4 items-center gap-3 px-5 pb-1 pt-4">
                  <TituloGrupo nota={variosProveedores && !deVarios ? deQuienLlego(m.proveedores) : undefined} className="min-w-0 flex-1">
                    <MuestraTramo clase={colorDeMarca(marcas, m.marca)} />
                    <span className={m.marca === null ? "text-ambar" : undefined}>{nombreMarca(m)}</span>
                  </TituloGrupo>
                  <span className="shrink-0 text-sm tabular-nums text-tinta/65">{unidades(m.unidades)}</span>
                </div>
              ),
              ...m.prendas.flatMap((p) => {
                const abierta = desplegadas.has(p.clave);
                const panel = `prenda-${p.clave}`;
                const costo = costos?.[p.loteId];
                return [
                  <button
                    key={p.clave}
                    type="button"
                    data-guia="recibir.desplegar"
                    onClick={() => alternar(p.clave)}
                    aria-expanded={abierta}
                    aria-controls={panel}
                    className={`${fila(plantilla)} w-full text-left ${abierta ? "bg-tinta/[0.03]" : ""}`}
                  >
                    <span className={celda("izq", "text-taupe")}>
                      <ChevronRight aria-hidden className={`h-4 w-4 transition-transform duration-300 ease-cayla ${abierta ? "rotate-90" : ""}`} />
                    </span>
                    <span className={celda("izq", "whitespace-normal text-[15px] text-tinta")}>
                      {p.modelo}
                      {p.sku && <span className="text-tinta/55"> · {p.sku}</span>}
                      {deVarios && <span className="block text-sm text-tinta/65">de {p.proveedor}</span>}
                    </span>
                    {conCosto && <span className={celda("der", "text-sm tabular-nums text-tinta/65")}>{textoCosto(costo, prendasPorLote.get(p.loteId) ?? 1)}</span>}
                    <span className={celda("der", "text-[15px] font-semibold tabular-nums text-tinta")}>{p.unidades}</span>
                  </button>,
                  <FilasDeMas key={`${p.clave}-d`} id={panel} abierto={abierta} className="!border-t-0">
                    <ColoresYTallas prenda={p} />
                  </FilasDeMas>,
                ];
              }),
            ];
          })}
        </Tabla>

        {sinMarca && (
          <Aviso tono="atencion" chico titulo={`${sinMarca.prendas.length === 1 ? "1 prenda llegó" : `${sinMarca.prendas.length} prendas llegaron`} sin marca`}>
            {sinMarca.prendas.map((p) => p.modelo).join(", ")}. Se la pone quien edita el catálogo, en Catálogo ▸ Productos.
          </Aviso>
        )}

        {notas.map((n) => (
          <p key={n} className="text-sm text-tinta/65">
            <span className="label-cayla text-[11px]">Nota · </span>
            {n}
          </p>
        ))}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-tinta/10 pt-3">
          <p className="text-sm text-tinta/55">
            {unidades(envio.unidades)} · {prendas(prendasDistintas(envio))} · {conMarca} {conMarca === 1 ? "marca" : "marcas"}
          </p>
          {facturas.map((l) => (
            // Cierra este modal antes de navegar: la ruta de factura abre SU propio modal interceptado, y sin esto quedaban los dos apilados.
            <EnlaceVer key={l.loteId} href={`/compras/factura/${l.compraId}`} alNavegar={onClose}>
              Ver factura completa
            </EnlaceVer>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** Un dato del envío con su título arriba, como el `Dato` de los resúmenes de FlujoGuiado (importarlo arrastraría sus botones a la huella de la guía). */
function Dato({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-tinta/70">{titulo}</dt>
      <dd className="mt-0.5 text-tinta">{children}</dd>
    </div>
  );
}

/** El costo en la fila de una prenda: «S/ 21.33 c/u», «Sin costo» o nada si la base no lo dio. La base da el costo PROMEDIO de la llegada
 *  de cada proveedor (`recepciones_sin_comprobante`), no el de cada prenda: si esa llegada trajo varias prendas, la fila dice «prom.» para no
 *  hacerlo pasar por el costo de esa prenda. */
function textoCosto(costo: CostoRecepcion | undefined, prendasDelLote: number) {
  if (!costo) return null;
  if (costo.sinCosto) return <span className="text-ambar">Sin costo</span>;
  if (costo.costo == null) return null;
  return prendasDelLote > 1 ? (
    <span title="Costo promedio de lo que trajo este proveedor en el envío">{soles(costo.costo)} c/u prom.</span>
  ) : (
    `${soles(costo.costo)} c/u`
  );
}

/** Lo que se contó de una prenda en este envío: colores en filas (con su muestra), tallas en columnas y el total de cada talla. A lo ancho
 *  de la hoja: su «Total» cae bajo la columna «Cantidad». */
function ColoresYTallas({ prenda }: { prenda: PrendaRecibida }) {
  const m: MatrizModelo = prenda.matriz;
  return (
    <div className="space-y-3 bg-tinta/[0.03] px-5 pb-4 pt-1 sm:pl-[3.25rem]">
      <div className="overflow-x-auto">
        {/* `!bg-transparent`: la hoja le pone su lámina a toda tabla (vidrio/hoja.css), y esta ya va dentro de la tabla de prendas, que la
            tiene: con la suya quedaba una caja de otro tono (Felipe 2026-11-10). */}
        <table /* unificar-fijo: matriz color × talla de lo recibido, como las de la ficha (las matrices de tallas quedan aparte) */ className="w-full min-w-[16rem] !bg-transparent text-sm tabular-nums">
          <thead>
            <tr className="border-b border-sand text-taupe">
              <th scope="col" className="py-2 pr-3 text-left font-normal">Color</th>
              {m.tallas.map((t) => (
                <th key={t} scope="col" className="px-3 py-2 text-center font-normal">{t}</th>
              ))}
              <th scope="col" className="w-20 py-2 pl-3 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-sand/60">
            {m.colores.map((c) => (
              <tr key={c.color}>
                <th scope="row" className="py-2 pr-3 text-left font-normal text-tinta">
                  <span className="inline-flex items-center gap-2.5">
                    <CapsulaColor fondo={c.fondo} compacta />
                    {c.color}
                  </span>
                </th>
                {m.tallas.map((t) => (
                  <td key={t} className={`px-3 py-2 text-center ${c.porTalla[t] ? "text-tinta" : "text-tinta/30"}`}>{c.porTalla[t] ?? "—"}</td>
                ))}
                <td className="py-2 pl-3 text-right font-semibold text-tinta">{c.total}</td>
              </tr>
            ))}
          </tbody>
          {m.colores.length > 1 && (
            <tfoot>
              <tr className="border-t border-tinta/15 text-tinta/65">
                <th scope="row" className="py-2 pr-3 text-left font-medium">Por talla</th>
                {m.tallas.map((t) => (
                  <td key={t} className="px-3 py-2 text-center font-medium">{m.porTalla[t]}</td>
                ))}
                <td className="py-2 pl-3 text-right font-medium">{m.total}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
