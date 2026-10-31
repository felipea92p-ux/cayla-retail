"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Clock3 } from "lucide-react";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonLimpiar, FiltroPuesto } from "@/components/ui/FiltrosPuestos";
import { Vacio } from "@/components/ui/Vacio";
import { CabeceraDinero } from "@/components/finanzas/CabeceraDinero";
import { PorPagarCarriles } from "@/components/finanzas/PorPagarCarriles";
import { PorPagarTodas } from "@/components/finanzas/PorPagarTodas";
import { Superficie } from "@/components/finanzas/kit";
import { soles } from "@/lib/compras-reglas";
import { fechaCorta, solesRedondo, type UbicacionGastos, type Ver } from "@/lib/gastos-reglas";
import { colorDeGrupo } from "@/lib/dinero-telar-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";
import { sedeDeLaCabecera } from "@/lib/gastos-telar-reglas";
import { debesPulso } from "@/lib/dinero-pulso-reglas";
import { TEXTO_NATURALEZA, TONO_NATURALEZA, diasHasta, puedePagar, resumenTramos, textoUnidad, textoVence, totalPorPagar, type ClaveTramo, type FilaPorPagar, type NaturalezaDeuda } from "@/lib/por-pagar-consolidado-reglas";
import { atencionDeDeudas, carrilesDeDeudas, filtrarDeudas, filtrosPuestosDeuda, leerFiltrosDeuda, ORDEN_DEUDA_INICIAL, ordenarDeudas, proveedoresMayores, repartoPorTipo, type FiltrosDeuda } from "@/lib/que-debes-reglas";

// Finanzas ▸ Cuentas y dinero ▸ Qué debes (ADR-0195 F4; El telar, Felipe 2026-10-23; rediseño «Panorama ajustado», Felipe 2026-10-31,
// maqueta docs/maquetas/finanzas-que-debes-rediseno-2026-10/): una franja corta con las cifras de cada tramo (filtran), y debajo cuatro
// tarjetas que fluyen en dos columnas sin estirarse —lo que vence primero, lo que vence en 30 días en carriles por sede, lo que pide
// atención y a quién se le debe más—, de modo que una tarjeta con poco contenido mide solo lo que necesita y la de abajo sube. La lista corta
// muestra 8; «Todo lo que CAYLA debe» (la ventana) tiene la búsqueda, los filtros, el orden y las páginas de 30 o 40. Solo lee: cada factura se
// paga con el pago que ya existe en su libro (Compras o Producción), abierto con `?pagar=<id>`; ninguna regla de pago vive en Finanzas.
// Los filtros de tramo viven en la URL (?tramo=, y ?tipo=, ?q= de enlaces anteriores) y filtran aquí mismo, sin volver a la base.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const plural = (n: number) => `${n} ${n === 1 ? "factura" : "facturas"}`;
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Cuántas facturas muestra la lista corta; el resto vive en la ventana. */
const FILAS_CORTAS = 8;
/** Cuántas cosas lista «Pide tu atención» antes de mandar a la ventana. */
const AVISOS_VISIBLES = 6;
/** El color de cada tipo de deuda en «En qué se va» (clases de token: ADR-0169). */
const COLOR_TIPO: Record<NaturalezaDeuda, string> = { mercaderia: "bg-pizarra", gasto: "bg-ambar", activo: "bg-verde", insumo: "bg-taupe" };
const COLOR_TRAMO: Record<ClaveTramo, string> = { vencidas: "bg-rojo-profundo", semana: "bg-ambar", proxima: "bg-pizarra", despues: "bg-verde" };
/** El puntito de color de cada tramo, junto a su nombre (el vocabulario de `TarjetaCifra`). */
/** El color de la línea bajo cada cifra de la franja (tokens). */
const COLOR_VAR_TRAMO: Record<ClaveTramo, string> = { vencidas: "var(--color-rojo-profundo)", semana: "var(--color-ambar)", proxima: "var(--color-pizarra)", despues: "var(--color-verde)" };
const PUNTO_TRAMO: Record<ClaveTramo, "rojo" | "ambar" | "neutro" | "verde"> = { vencidas: "rojo", semana: "ambar", proxima: "neutro", despues: "verde" };

export function PorPagarConsolidado({
  filas,
  ver,
  unidades,
  esLider,
  pagaCompras,
  hoy,
  falla,
  sedes,
}: {
  filas: FilaPorPagar[];
  ver: Ver;
  unidades: UbicacionGastos[];
  esLider: boolean;
  /** ¿Esta cuenta registra pagos de Compras? (el líder, o el módulo Por pagar; `fn_puede_pagar_compras`). */
  pagaCompras: boolean;
  hoy: string;
  falla: string | null;
  /** Los hilos de sede de la barra (`getSedesDelTelar`): el color de cada punto y el orillo. */
  sedes: SedeTelar[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const deLaUrl = leerFiltrosDeuda(params);
  const [todas, setTodas] = useState<{ q: string; tramo: ClaveTramo | null } | null>(null);
  const f: FiltrosDeuda = deLaUrl;
  const verTodas = !ver.ubicacionId && !ver.soloEmpresa;
  const nombre = ver.soloEmpresa ? "la empresa" : ver.ubicacionId ? (unidades.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda") : null;
  const tramos = resumenTramos(filas, hoy);
  const vistas = useMemo(() => filtrarDeudas(filas, f, hoy), [filas, f.tramo, f.tipo, f.q, hoy]); // eslint-disable-line react-hooks/exhaustive-deps
  const cortas = ordenarDeudas(vistas, ORDEN_DEUDA_INICIAL).slice(0, FILAS_CORTAS);
  const total = totalPorPagar(vistas);
  // Qué parte del total es de cada sede (las sedes en su orden, «De la empresa» al final): el color es el mismo del filtro «Ver sede».
  const porSede = [...unidades.map((u) => ({ clave: u.id, nombre: u.nombre.replace(/^Tienda\s+/i, "") })), { clave: "", nombre: "De la empresa" }]
    .map((u) => ({ ...u, monto: filas.filter((x) => (x.ubicacionId ?? "") === u.clave).reduce((a, x) => a + x.saldo, 0), color: colorDeGrupo(u.clave || null, sedes) }))
    .filter((u) => u.monto > 0);
  const cuenta = { esLider, pagaCompras };
  const puestos = filtrosPuestosDeuda(f);
  const debes = debesPulso(filas, hoy);
  const avisos = atencionDeDeudas(filas, hoy);
  const mayores = proveedoresMayores(filas, hoy, 5);
  // «En qué se va» reparte lo que pasa los demás filtros, sin el de tipo: si no, al tocar un tipo los otros desaparecerían y no habría cómo cambiar.
  const porTipo = repartoPorTipo(filtrarDeudas(filas, { ...f, tipo: null }, hoy));
  const carriles = carrilesDeDeudas(vistas, hoy, unidades.map((u) => u.id));
  const porId = new Map(filas.map((x) => [x.id, x]));
  const hrefPagar = (id: string) => {
    const p = new URLSearchParams(params.toString());
    p.set("pagar", id);
    return `${ruta}?${p}`;
  };

  // Un filtro cambia la URL sin volver al servidor (la lista ya está aquí): «atrás» y compartir el enlace lo conservan.
  function poner(cambio: Partial<FiltrosDeuda>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambio)) {
      if (v) p.set(k, String(v));
      else p.delete(k);
    }
    p.delete("pagar");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${ruta}?${qs}` : ruta);
  }
  const quitar = (clave: keyof FiltrosDeuda | "todo") => poner(clave === "todo" ? { tramo: null, tipo: null, q: "" } : { [clave]: null });
  const nombreCarril = (clave: string | null) => (clave ? (unidades.find((u) => u.id === clave)?.nombre ?? "Tienda").replace(/^Tienda\s+/i, "") : "De la empresa");
  const tituloDe = (id: string) => {
    const x = porId.get(id);
    return x ? `${x.proveedor} · ${soles(x.saldo)} · ${textoVence(x, hoy)}${x.ubicacionId ? ` · ${textoUnidad(x)}` : ""}` : "";
  };

  return (
    <div className="space-y-6">
      <CabeceraDinero
        pestana="porpagar"
        esLider={esLider}
        conteos={{ porpagar: filas.length }}
        sede={sedeDeLaCabecera(ver, unidades)}
        orillo={null}
        sedes={sedes}
        hoy={hoy}
      />

      {falla ? (
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla}</p>
      ) : (
        <>
          <section className="qd-franja" data-guia="fin-por-pagar.cifras">
            <div className="qd-cifras">
              <TarjetaCifra compacta className="anim-entra qd-total [&_.font-display]:!text-[34px]" style={{ ["--i" as string]: 0 } as CSSProperties} etiqueta={nombre && !verTodas ? `Debe ${nombre.replace(/^la\s+/i, "")}` : "Debes en total"} valor={<><span className="mr-1 text-base text-taupe">S/</span>{solesRedondo(totalPorPagar(filas).saldo).replace(/^S\/\s*/, "")}</>}>
                {plural(filas.length)}
              </TarjetaCifra>
              {tramos.map((t, i) => (
                <TarjetaCifra
                  key={t.clave}
                  compacta
                  etiqueta={t.etiqueta}
                  punto={PUNTO_TRAMO[t.clave]}
                  tono={t.clave === "vencidas" && t.monto > 0 ? "text-rojo" : undefined}
                  valor={solesRedondo(t.monto)}
                  onClick={() => poner({ tramo: f.tramo === t.clave ? null : t.clave })}
                  activa={f.tramo === t.clave}
                  className="anim-entra"
                  style={{ ["--i" as string]: i + 1, ["--c" as string]: COLOR_VAR_TRAMO[t.clave] } as CSSProperties}
                >
                  {plural(t.n)}
                </TarjetaCifra>
              ))}
            </div>
            {total.saldo > 0 && (
              <div className="qd-franja-pie">
                <div className="qd-partido">
                  <BarraApilada
                    segmentos={porSede.map((x) => ({ clave: x.clave, nombre: x.nombre, valor: x.monto, color: x.color }))}
                    unidad="soles"
                    formato={solesRedondo}
                    alto={8}
                    decorativa
                  />
                  <ul className="qd-leyenda" aria-label="Cuánto del total es de cada sede">
                    {porSede.map((x) => (
                      <li key={x.clave}>
                        <MuestraTramo color={x.color} />
                        {x.nombre} <b>{solesRedondo(x.monto)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <p>{debes.frase}</p>
              </div>
            )}
          </section>

          {filas.length === 0 ? (
            <div {...entra(5)}>
              <Superficie>
                <Vacio icono={<Check />} titulo={`Todo pagado: ${nombre ? `${mayuscula(nombre)} no debe nada` : "CAYLA no debe nada"}`}>
                  Ninguna factura de mercadería, gasto, activo ni insumo del Taller tiene saldo. Lo pagado y lo anulado no aparecen aquí.
                </Vacio>
              </Superficie>
            </div>
          ) : (
            <div className="qd-mas">
              <Superficie className="qd-lista anim-sube" guia="fin-por-pagar.lista">
                <div className="qd-cab">
                  <TituloSeccion dato={`${plural(total.n)} · ${solesRedondo(total.saldo)}${verTodas ? "" : ` de ${nombre}`}`}>{f.tramo ? tramos.find((t) => t.clave === f.tramo)!.etiqueta : "Lo que vence primero"}</TituloSeccion>
                </div>
                {puestos.length > 0 && (
                  <div className="din-puestos" aria-label="Filtros puestos">
                    {puestos.map((p) => (
                      <FiltroPuesto key={p.clave} onQuitar={() => quitar(p.clave)} etiqueta={`Quitar el filtro ${p.texto}`}>
                        {p.texto}
                      </FiltroPuesto>
                    ))}
                    {puestos.length > 1 && <BotonLimpiar onClick={() => quitar("todo")}>Limpiar todo</BotonLimpiar>}
                  </div>
                )}
                {cortas.length === 0 ? (
                  <Vacio tamano="chico" icono={<Check />}>
                    Nada coincide con estos filtros. Quita uno para ver más.
                  </Vacio>
                ) : (
                  <ul className="qd-facs">
                    {cortas.map((x) => {
                      const vencida = diasHasta(x.vence, hoy) < 0;
                      return (
                        <li key={`${x.origen}-${x.id}`} className="qd-fac">
                          <div className="qd-fac-vence">
                            <b>{fechaCorta(x.vence)}</b>
                            <small className={vencida ? "text-rojo-profundo" : ""}>{textoVence(x, hoy)}</small>
                          </div>
                          <div className="qd-fac-prov">
                            <b>{x.proveedor}</b>
                            <small>{x.concepto ? `${x.documento} · ${x.concepto}` : x.documento}</small>
                          </div>
                          <div className="qd-fac-chips">
                            <Chip versalitas={false} tono={TONO_NATURALEZA[x.naturaleza]}>
                              {TEXTO_NATURALEZA[x.naturaleza]}
                            </Chip>
                            {verTodas && (
                              <span className="din-sede-chip" style={{ ["--c" as string]: colorDeGrupo(x.ubicacionId, sedes) } as CSSProperties}>
                                <i aria-hidden="true" />
                                {textoUnidad(x)}
                              </span>
                            )}
                          </div>
                          <div className="qd-fac-saldo">
                            <span className={vencida ? "text-rojo-profundo" : ""}>{soles(x.saldo)}</span>
                            {puedePagar(x, cuenta) && (
                              <Link href={hrefPagar(x.id)} scroll={false} className="btn-cayla btn-secundario btn-chico" aria-label={`Pagar ${x.proveedor} ${x.documento}`} data-guia="fin-por-pagar.pagar">
                                Pagar
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="qd-pie">
                  <span>
                    {vistas.length > cortas.length ? `Mostrando ${cortas.length} de ${vistas.length}. ` : ""}
                    {ver.ubicacionId ? "Cada factura cuenta entera para la tienda que la pidió. " : ""}Lo pagado y lo anulado no aparecen.
                  </span>
                  <button type="button" className="btn-cayla btn-enlace qd-enlace-rojo" onClick={() => setTodas({ q: f.q, tramo: f.tramo })} aria-haspopup="dialog" data-guia="fin-por-pagar.todas">
                    {vistas.length > cortas.length ? `Ver las ${vistas.length} con filtros y búsqueda` : "Buscar y filtrar"}
                  </button>
                </div>
              </Superficie>

              {carriles.length > 0 && (
                <Superficie className="anim-sube" guia="fin-por-pagar.burbujas">
                  <div className="qd-cab">
                    <TituloSeccion dato="Una fila por sede; cada punto es una factura. Tócalo para pagarla.">Lo que vence en 30 días</TituloSeccion>
                  </div>
                  <PorPagarCarriles
                    carriles={carriles}
                    hoy={hoy}
                    nombreDe={nombreCarril}
                    colorDe={(c) => colorDeGrupo(c, sedes)}
                    tituloDe={tituloDe}
                    puedePagarId={(id) => {
                      const x = porId.get(id);
                      return !!x && puedePagar(x, cuenta);
                    }}
                    irAPagar={(id) => router.push(hrefPagar(id), { scroll: false })}
                  />
                  {porTipo.length > 0 && (
                    <div className="qd-tipo" data-guia="fin-por-pagar.tipo">
                      <div className="qd-tipo-cab">
                        <b>En qué se va</b>
                        <small>por tipo de deuda · toca uno para filtrar</small>
                      </div>
                      <BarraApilada
                        segmentos={porTipo.map((p) => ({ clave: p.tipo, nombre: TEXTO_NATURALEZA[p.tipo], valor: p.monto, clase: COLOR_TIPO[p.tipo] }))}
                        unidad="soles"
                        formato={solesRedondo}
                        alto={12}
                        decorativa
                      />
                      <ul className="qd-tipo-ley">
                        {porTipo.map((p) => (
                          <li key={p.tipo}>
                            <button type="button" aria-pressed={f.tipo === p.tipo} onClick={() => poner({ tipo: f.tipo === p.tipo ? null : p.tipo })}>
                              <MuestraTramo clase={COLOR_TIPO[p.tipo]} />
                              <b>{TEXTO_NATURALEZA[p.tipo]}</b>
                              <span className="qd-tipo-monto">{solesRedondo(p.monto)}</span>
                              <small>
                                {p.n} · {p.porcentaje} %
                              </small>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Superficie>
              )}

              <Superficie className="anim-sube" guia="fin-por-pagar.atencion">
                <div className="qd-cab">
                  <TituloSeccion dato={avisos.length > 0 ? <Chip tono={avisos.some((a) => a.tono === "rojo") ? "rojo" : "ambar"}>{avisos.length === 1 ? "1 cosa" : `${avisos.length} cosas`}</Chip> : undefined}>Pide tu atención</TituloSeccion>
                </div>
                {avisos.length === 0 ? (
                  <Vacio tamano="chico" icono={<Check />}>
                    Nada vencido ni por vencer en los próximos 3 días.
                  </Vacio>
                ) : (
                  <ul className="qd-aten">
                    {avisos.slice(0, AVISOS_VISIBLES).map((a) => {
                      const x = porId.get(a.id);
                                      return (
                        <li key={a.id} data-tono={a.tono}>
                          <span className="qd-aten-ic" aria-hidden="true">
                            {a.tono === "rojo" ? <b>!</b> : <Clock3 className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0">
                            <b>
                              {a.proveedor} · {soles(a.saldo)}
                            </b>
                            <span>
                              {a.documento} · {textoVence({ vence: a.vence }, hoy)}
                            </span>
                          </div>
                          {x && puedePagar(x, cuenta) && (
                            <Link href={hrefPagar(a.id)} scroll={false} className="btn-cayla btn-enlace qd-enlace-rojo" aria-label={`Pagar ${a.proveedor} ${a.documento}`}>
                              Pagar
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {avisos.length > AVISOS_VISIBLES && (
                  <div className="qd-pie">
                    <span>y {avisos.length - AVISOS_VISIBLES} más</span>
                    <button type="button" className="btn-cayla btn-enlace qd-enlace-rojo" onClick={() => setTodas({ q: "", tramo: "vencidas" })} aria-haspopup="dialog">
                      Ver las vencidas
                    </button>
                  </div>
                )}
              </Superficie>

              <Superficie className="anim-sube" guia="fin-por-pagar.proveedores">
                <div className="qd-cab">
                  <TituloSeccion dato="los 5 mayores">A quién le debes más</TituloSeccion>
                </div>
                <ul className="qd-prov">
                  {mayores.map((p) => (
                    <li key={p.proveedorId}>
                      <button type="button" onClick={() => setTodas({ q: p.proveedor, tramo: null })} aria-haspopup="dialog">
                        <b>{p.proveedor}</b>
                        <span className="qd-prov-saldo">{solesRedondo(p.saldo)}</span>
                        <small>
                          {plural(p.n)}
                          {p.vencido > 0 ? ` · ${solesRedondo(p.vencido)} vencido` : ""}
                        </small>
                        <BarraApilada
                          segmentos={[
                            { clave: "vencido", nombre: "Vencido", valor: p.vencido, clase: "bg-rojo-profundo" },
                            { clave: "resto", nombre: "Por vencer", valor: p.saldo - p.vencido, clase: "bg-pizarra" },
                          ].filter((s) => s.valor > 0)}
                          total={mayores[0].saldo}
                          unidad="soles"
                          alto={8}
                          decorativa
                          className="qd-prov-barra"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
                {pagaCompras && (
                  <div className="qd-pie">
                    <Link href="/compras/por-pagar" className="btn-cayla btn-enlace" data-guia="fin-por-pagar.varias">
                      Pagar varias de un proveedor
                    </Link>
                  </div>
                )}
              </Superficie>
            </div>
          )}

          <p className="nota-cayla anim-entra" style={{ ["--i" as string]: 6 } as CSSProperties}>
            La planilla no está en esta lista porque la paga Dynamic.{" "}
            {esLider || pagaCompras
              ? "«Pagar» abre el mismo pago de Compras (o de Producción, para la tela del Taller): el pago queda en su factura."
              : "Los pagos los registra quien tiene Por pagar en Compras; aquí se ve cuándo vence cada uno."}
          </p>
        </>
      )}

      {todas && (
        <PorPagarTodas
          filas={filas}
          unidades={unidades}
          sedes={sedes}
          esLider={esLider}
          pagaCompras={pagaCompras}
          hoy={hoy}
          qInicial={todas.q}
          tramoInicial={todas.tramo}
          hrefPagar={hrefPagar}
          onCerrar={() => setTodas(null)}
        />
      )}
    </div>
  );
}
