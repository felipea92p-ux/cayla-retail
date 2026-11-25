"use client";

import "@/app/estilos/por-pantalla/analisis-pestanas.css";
import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { COLOR_ESTADO, ICONO_ESTADO, TilePrenda } from "@/components/analisis/piezas";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { grupoDe, sedeQueMasVende } from "@/lib/analisis-reglas";
import { hrefExistencias, hrefMovimientos } from "@/lib/analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  cifrasDe,
  fraseDelModelo,
  lineaOtrasTiendas,
  sedeParaPedir,
  subtituloFicha,
  tablaDelModelo,
  veredictoDe,
} from "@/lib/analisis-ficha";
import { diasEnAlmacen, nuncaSalio } from "@/lib/analisis-piso";
import { type CasillaDosPisos, fichaDePedir, textoCasillaDosPisos, type TablaFichaPedir } from "@/lib/analisis-ficha-pedir";
import { Chip } from "@/components/ui/Chip";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { BotonEnlace } from "@/components/ui/campos";
import { Vacio } from "@/components/ui/Vacio";

// Análisis (ADR-0357): la ficha de una prenda. Desde la cara B (act. 2026-11-21), en tres bloques: qué pasa en una frase con su color
// y sus tres cifras (`TarjetaCifra`); cuánto se vendió cada semana (`BarrasTiempo`); y la talla y el color del modelo en mi tienda,
// con los botones abajo («Movimientos» a la izquierda). Solo dice cómo está: no hay «Liquidar» (Felipe 2026-11-21: «así el usuario
// decide qué hacer»). Medidas: `docs/milimetro/analisis-b.md`, §6. La maqueta la dibuja como hoja lateral; en el ERP todo modal es
// `<Modal>` (ADR-0136), con la entrada y la cascada del sistema. Lo que dice cada parte lo decide `lib/analisis-ficha.ts`; aquí solo
// se dibuja.
//
// Lo que está en «Qué pedir» (lo agotado y lo que se acaba antes de Navidad) cuenta lo mismo que su tarjeta (act. 2026-11-24, punto 8,
// `lib/analisis-ficha-pedir.ts`): la fecha arriba, las cifras de la tarjeta, una tabla limpia y «Pedir a …» en vez de «Comprar».
//
// No tiene campos: no lleva guía de foco (ADR-0284).

export function FichaPrenda({ varianteId, onCerrar }: { varianteId: string; onCerrar: () => void }) {
  const { datos } = useAnalisis();
  const prenda = datos.prendas.find((p) => p.varianteId === varianteId);
  if (!prenda) {
    return (
      <Modal titulo="Esta prenda ya no está en tu tienda" onClose={onCerrar} variante="hoja" tamano="mediana" conCerrar>
        {null}
      </Modal>
    );
  }
  return <Ficha prenda={prenda} onCerrar={onCerrar} />;
}

function Ficha({ prenda: p, onCerrar }: { prenda: ModeloAnalisis; onCerrar: () => void }) {
  const { datos, acceso, liquidarDesde, pedir } = useAnalisis();
  // Refs con estado: la hoja es un portal que Radix monta un render después; el tooltip se engancha cuando ya existe.
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<HTMLDivElement | null>(null);
  useTipDeLaFicha(raiz, tip);

  // El grupo con «Liquidar desde» en vivo: la ficha dice lo mismo que el carril de donde se abrió.
  const grupo = grupoDe(p, liquidarDesde);
  // Guardada y nunca colgada (solo si la base ya lo sabe: 20261007120000): no «va bien», nadie la vio.
  const sinSalir = datos.sabePiso && nuncaSalio(p);
  const vende = grupo === "enviar" ? sedeQueMasVende(p.otras) : null;
  // Lo de «Qué pedir» trae su propia frase, sus cifras, su tabla y su «Pedir a …» (null si el modelo no está en «Qué pedir»).
  const dePedir = fichaDePedir(p, { hoy: datos.hoy, diasDeVentas: datos.diasDeVentas, sedes: datos.sedes, miSede: datos.sede, acceso });
  const veredicto = dePedir?.veredicto ?? veredictoDe(p, grupo, sinSalir, vende ? datos.sedes.find((s) => s.id === vende.sedeId)?.ciudad : undefined);
  const cifras = dePedir?.cifras ?? cifrasDe(p, grupo, datos.sedes, sinSalir ? { dias: diasEnAlmacen(p, datos.hoy) } : null);
  const semanas = barrasSemanas(p.semanas, datos.hoy);
  const vendioAlgo = semanas.some((b) => b.vendidas > 0);
  const frase = fraseDelModelo(p, datos.diasDeVentas);
  const tabla = tablaDelModelo(p);
  const otras = lineaOtrasTiendas(p, datos.sedes, datos.sede.id);
  // Un botón cuyo destino la cuenta no ve no se dibuja (cada función devuelve null).
  // En «Qué pedir» no hay «Comprar» (Felipe 2026-11-24: solo llevaba a Mis compras); su botón es «Pedir a …».
  const principal = dePedir ? null : accionPrincipal(p, grupo, datos.sedes, acceso, sinSalir);
  const pedirA = dePedir ? dePedir.pedirA : sedeParaPedir(p, grupo, datos.sedes, acceso);
  const existencias = hrefExistencias(p, acceso);
  const movimientos = hrefMovimientos(p, acceso);
  const conAcciones = Boolean(principal || pedirA || existencias || movimientos);

  return (
    <Modal titulo={p.nombre} subtitulo={dePedir ? (dePedir.precio ?? undefined) : subtituloFicha(p)} onClose={onCerrar} variante="hoja" tamano="mediana" conCerrar>
      <div ref={setRaiz} className="analisis analisis-hoja">
        <div className="anim">
          {/* Bloque 1: qué pasa, en una frase con su color, y sus tres cifras. */}
          <div data-guia="analisis.ficha">
            <div className="h-cab">
              <TilePrenda prenda={p} tamano={72} />
              <p className="an-veredicto" style={{ ["--c" as string]: COLOR_ESTADO[veredicto.est] }}>
                <Icono nombre={ICONO_ESTADO[veredicto.est]} />
                <span>{veredicto.texto}</span>
              </p>
            </div>
            <div className="an-ficha-cifras">
              {cifras.map((c) => (
                <TarjetaCifra key={c.etiqueta} etiqueta={c.etiqueta} valor={c.valor}>
                  {c.detalle}
                </TarjetaCifra>
              ))}
            </div>
          </div>

          {/* Bloque 2: cuánto se vendió cada semana; la última, la que termina hoy, en tinta. */}
          <div className="h-sec" data-guia="analisis.ficha-semanas">
            <TituloGrupo nota={`en ${datos.sede.ciudad}`}>Vendidas cada semana</TituloGrupo>
            {vendioAlgo ? (
              <BarrasTiempo
                barras={semanas.map((b) => ({ clave: b.inicio, valor: b.vendidas, etiqueta: b.etiqueta, tip: b.tip }))}
                destacada={semanas[semanas.length - 1]?.inicio ?? null}
                cifras="todas"
                alto={96}
                etiqueta={`Vendidas cada semana en ${datos.sede.ciudad}, últimas ${semanas.length}`}
              />
            ) : (
              <Vacio tamano="chico" icono={<Receipt />}>Ninguna en las últimas {semanas.length} semanas.</Vacio>
            )}
          </div>

          {/* El modelo en tu tienda (opción B, Felipe 2026-10-10): una frase, una tabla con palabras y totales —los colores que más se
              venden arriba— y las otras tiendas en una línea. */}
          {/* Bloque 3: la talla y el color del modelo en tu tienda (con «Qué pedir», su tabla limpia). */}
          {dePedir ? (
            <TablaDePedir tabla={dePedir.tabla} />
          ) : (
            <>
              <div className="h-sec" data-guia="analisis.ficha-tallas">
                <TituloGrupo nota={datos.diasDeVentas === 1 ? "en tu primer día de ventas" : `en tus ${datos.diasDeVentas} días de ventas`}>Talla y color</TituloGrupo>
                <p className="m-frase">{frase}</p>
                {tabla && (
                  <>
                    <div className="m-tabla">
                      <table>
                        <thead>
                          <tr>
                            <th className="col-color" scope="col">
                              Color
                            </th>
                            {tabla.tallas.map((t) => (
                              <th key={t} scope="col">
                                {t}
                              </th>
                            ))}
                            <th scope="col">Vendiste</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tabla.filas.map((f) => (
                            <tr key={f.color}>
                              <th className="color" scope="row">
                                <span className="pt" data-color-dato style={{ ["--prenda" as string]: f.punto ?? "var(--color-grafico-neutro)" }} />
                                {f.color || "Sin color"}
                                {f.sinStock && <span className="m-sin-stock">Sin stock</span>}
                              </th>
                              {f.celdas.map((c) => (
                                <td key={c.talla} className={c.estado} tabIndex={0} data-tip={c.tip} aria-label={c.tip}>
                                  <b>
                                    {c.estado === "pedir" && (
                                      <span className="m-alerta" aria-hidden="true">
                                        !
                                      </span>
                                    )}
                                    {c.fuerte}
                                  </b>
                                  {c.suave && <span>{c.suave}</span>}
                                </td>
                              ))}
                              <td className="total">{f.vendio}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th className="color" scope="row">
                              Vendiste
                            </th>
                            {tabla.vendioPorTalla.map((n, k) => (
                              <td key={tabla.tallas[k]} className="total">
                                {n}
                              </td>
                            ))}
                            <td className="total">{tabla.vendio}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="m-leyenda">
                      <span className="pedir">vendido y sin stock</span>
                      <span className="queda">te queda</span>
                      <span className="nada">no hay</span>
                    </div>
                  </>
                )}
                {otras && <p className="m-otras">{otras}</p>}
              </div>
            </>
          )}

          {conAcciones && (
            <div className="h-acciones pie-acciones" data-guia="analisis.ficha-acciones">
              {movimientos && (
                <Link href={movimientos} className="btn-cayla btn-enlace mr-auto">
                  Movimientos
                </Link>
              )}
              {pedirA && !dePedir && (
                <button type="button" className="btn-cayla btn-secundario" onClick={() => pedir([p], pedirA.id)}>
                  Pedir a {pedirA.ciudad}
                </button>
              )}
              {existencias && <BotonVer href={existencias}>Ver en Existencias</BotonVer>}
              {pedirA && dePedir && (
                // En «Qué pedir» es la acción de la hoja: negra, a la derecha (la maqueta que eligió Felipe el 2026-11-24).
                <button type="button" className="btn-cayla btn-primario" onClick={() => pedir([p], pedirA.id)}>
                  Pedir a {pedirA.ciudad}
                </button>
              )}
              {principal && (
                // La acción de la hoja sigue negra y lleva la flecha a la derecha, como «Seguir» de Nuevo producto: no guarda aquí, lleva
                // a la pantalla donde se hace (prueba ciega de /formidable, 2026-11-21).
                <BotonEnlace href={principal.href} peso="primario">
                  {principal.texto}
                  <ArrowRight aria-hidden className="-my-1 h-4 w-4 shrink-0" />
                </BotonEnlace>
              )}
            </div>
          )}
        </div>
      </div>
      {/* El tooltip va en la hoja y FUERA de `.analisis`: su `container-type` contiene los `position: fixed` y lo correría. */}
      <div ref={setTip} className="an-tip" aria-hidden data-sin-cascada />
    </Modal>
  );
}

/**
 * El tooltip de la ficha, igual al de la pantalla (`.an-tip`, `data-tip`). La hoja vive en un portal, fuera de la pantalla, y el
 * tooltip de la pantalla no la alcanza. Sale al pasar el mouse y al enfocar (con el teclado o al tocar lo que se enfoca, nunca
 * solo con el mouse: ADR-0350, ley 6); se esconde al salir y al desplazar la hoja.
 */
function useTipDeLaFicha(raiz: HTMLElement | null, tip: HTMLElement | null) {
  useEffect(() => {
    if (!raiz || !tip) return;
    const conTip = (el: EventTarget | null) => (el instanceof Element ? el.closest<HTMLElement>("[data-tip]") : null);
    const ver = (el: HTMLElement) => {
      tip.textContent = el.dataset.tip ?? "";
      tip.classList.add("ver");
      const b = el.getBoundingClientRect();
      const x = Math.max(8, Math.min(b.left + b.width / 2 - tip.offsetWidth / 2, window.innerWidth - tip.offsetWidth - 8));
      const arriba = b.top - tip.offsetHeight - 8;
      tip.style.left = `${x}px`;
      tip.style.top = `${arriba < 8 ? b.bottom + 8 : arriba}px`;
    };
    const ocultar = () => tip.classList.remove("ver");
    const sobre = (e: Event) => {
      const el = conTip(e.target);
      if (el && raiz.contains(el)) ver(el);
    };
    const fuera = (e: Event) => {
      if (conTip(e.target)) ocultar();
    };
    raiz.addEventListener("mouseover", sobre);
    raiz.addEventListener("mouseout", fuera);
    raiz.addEventListener("focusin", sobre);
    raiz.addEventListener("focusout", ocultar);
    document.addEventListener("scroll", ocultar, { capture: true, passive: true });
    return () => {
      raiz.removeEventListener("mouseover", sobre);
      raiz.removeEventListener("mouseout", fuera);
      raiz.removeEventListener("focusin", sobre);
      raiz.removeEventListener("focusout", ocultar);
      document.removeEventListener("scroll", ocultar, { capture: true });
    };
  }, [raiz, tip]);
}

/**
 * Una casilla de dos pisos: arriba cuántas te quedan, abajo cuántas vendiste («—» si ninguna). El 0 de arriba va en rojo solo donde se vendió y
 * ya no hay; donde no se vendió ni queda, es un 0 tenue (no falta nada).
 */
function CasillaDos({ color, talla, c, total = false }: { color: string; talla: string | null; c: CasillaDosPisos; total?: boolean }) {
  const tip = textoCasillaDosPisos(color, talla, c);
  const arriba = c.quedan > 0 ? "pisos-q hay" : c.vendidas > 0 ? "pisos-q" : "pisos-q nada";
  return (
    <td className={total ? "pisos-td pisos-total" : "pisos-td"} tabIndex={0} data-tip={tip} aria-label={tip}>
      <span className="pisos-casilla">
        <span className={arriba}>{c.quedan}</span>
        <span className={c.vendidas > 0 ? "pisos-v" : "pisos-v nada"}>{c.vendidas > 0 ? c.vendidas : "—"}</span>
      </span>
    </td>
  );
}

/**
 * La tabla de la ficha de «Qué pedir», la misma en lo agotado y en lo que se acaba (Felipe 2026-11-25 eligió la «B2» de
 * `docs/maquetas/analisis-pedir-sin-comprar-2026-11/mejor-b.html`): una fila por color, una casilla de dos pisos por talla y la del total, con
 * su clave arriba; lo que tiene la otra tienda, color por talla, en su propio bloque, para que no se confunda con lo que te queda a ti.
 */
function TablaDePedir({ tabla }: { tabla: TablaFichaPedir }) {
  return (
    <div className="h-sec" data-guia="analisis.ficha-tallas">
      <TituloGrupo nota={tabla.nota}>{tabla.titulo}</TituloGrupo>
      <div className="pisos-clave" aria-hidden>
        <span className="pisos-casilla">
          <span className="pisos-q">0</span>
          <span className="pisos-v">2</span>
        </span>
        <span className="pisos-clave-txt">
          <span className="pisos-q">Arriba: te quedan</span>
          <span>Abajo: vendiste en 8 semanas</span>
        </span>
      </div>
      <div className="m-tabla pisos">
        <table>
          <thead>
            <tr>
              <th className="col-color" scope="col">
                Color
              </th>
              {tabla.tallas.map((t) => (
                <th key={t} scope="col">
                  {t}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {tabla.filas.map((f) => (
              <tr key={f.color}>
                {/* El nombre baja de renglón si falta ancho (el celular): así entran las tallas sin correr la tabla. */}
                <th className="color" scope="row" style={{ whiteSpace: "normal" }}>
                  <span className="inline-flex items-baseline">
                    <span className="pt shrink-0" data-color-dato style={{ ["--prenda" as string]: f.punto ?? "var(--color-grafico-neutro)" }} />
                    <span>{f.color || "Sin color"}</span>
                  </span>
                </th>
                {f.casillas.map((c, k) => (
                  <CasillaDos key={tabla.tallas[k]} color={f.color} talla={tabla.tallas[k] ?? null} c={c} />
                ))}
                <CasillaDos color={f.color} talla={null} c={f.total} total />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabla.otra && (
        <div className="pisos-otra">
          <TituloGrupo cuenta={tabla.otra.total}>{`${tabla.otra.ciudad} tiene`}</TituloGrupo>
          <div className="pisos-piezas">
            {tabla.otra.piezas.map((p) => (
              <Chip key={`${p.color}-${p.talla ?? ""}`} versalitas={false}>
                <span className="pisos-pt" data-color-dato style={{ ["--prenda" as string]: p.punto ?? "var(--color-grafico-neutro)" }} />
                {p.color || "Sin color"}
                {p.talla && <span className="pisos-talla">{p.talla}</span>}
                <b className="pisos-cant">{p.cantidad}</b>
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
