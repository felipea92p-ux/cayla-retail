"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { ChipEstado, COLOR_ESTADO, TilePrenda } from "@/components/analisis/piezas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { diasQueQuedan, plural, porLlegar } from "@/lib/analisis-reglas";
import { grupoConSobra } from "@/lib/analisis-sobra";
import { llegaTarde, lecturaDeRitmo, tipUnaVenta } from "@/lib/analisis-acaba";
import { pedidoPorTipo } from "@/lib/analisis-pedido-en-camino-reglas";
import { proveedorDelModelo } from "@/lib/analisis-a-quien-pedir";
import { metaDeTipo, plazoDeTipo } from "@/lib/analisis-horizonte";
import { categoriaDe } from "@/lib/analisis-pedir";
import { sumarDias } from "@/lib/fechas-lima";
import { dondeComprarDe, hrefExistencias, hrefMovimientos } from "@/lib/analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  chipDeGrupo,
  dineroDe,
  fraseDelModelo,
  hechosDe,
  lineaOtrasTiendas,
  sedeParaPedir,
  subtituloFicha,
  tablaDelModelo,
  type TonoFicha,
} from "@/lib/analisis-ficha";
import { diasEnAlmacen, nuncaSalio } from "@/lib/analisis-piso";
import { BotonVer } from "@/components/ui/BotonDescargar";

// Análisis v4 (ADR-0357): la ficha de una prenda (actividad 6), copia de `fichaHTML()` de la maqueta aprobada. Arriba, la prenda y
// su estado; después tarjetitas (sin párrafos), sus ventas por semana, dónde hay en la red, el modelo entero en mi tienda, el dinero
// y los botones. La maqueta la dibuja como hoja lateral; en el ERP todo modal es `<Modal>` (ADR-0136): el mismo contenido, con la
// entrada y la cascada del sistema. Adentro, las barras crecen y los puntos asoman una vez (`.anim`; el retraso, en
// `analisis-ficha.css`). Lo que dice cada parte lo decide `lib/analisis-ficha.ts`; aquí solo se dibuja.
//
// No tiene campos: no lleva guía de foco (ADR-0284).

/** El color de cada tarjetita, con los mismos tokens que los estados de Análisis. */
const COLOR_TONO: Record<TonoFicha, string> = {
  rojo: COLOR_ESTADO.urg,
  ambar: COLOR_ESTADO.ate,
  verde: COLOR_ESTADO.bien,
  pizarra: COLOR_ESTADO.info,
  taupe: COLOR_ESTADO.nd,
};

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
  const { datos, acceso, pedir } = useAnalisis();
  // Refs con estado: la hoja es un portal que Radix monta un render después; el tooltip se engancha cuando ya existe.
  const [raiz, setRaiz] = useState<HTMLDivElement | null>(null);
  const [tip, setTip] = useState<HTMLDivElement | null>(null);
  useTipDeLaFicha(raiz, tip);

  // El grupo de la prenda con la vara de su tipo: la ficha dice lo mismo que el carril de donde se abrió.
  const grupo = grupoConSobra(p, datos.horizonte.dias);
  // Guardada y nunca colgada (solo si la base ya lo sabe: 20261007120000): no «va bien», nadie la vio.
  const sinSalir = datos.sabePiso && nuncaSalio(p);
  // Algo ya llega a tiempo: la ficha dice lo mismo que el carril («Ya viene», sin rojo) y «Comprar» deja de ser el botón principal.
  const yaViene = porLlegar(p, datos.hoy) > 0;
  // El ritmo sale de UNA sola venta (D6, 2026-10-16): lo que se acaba sigue en «Cómpralas», pero sin rojo y con el chip que lo dice.
  const ritmo = grupo === "comprar" ? lecturaDeRitmo(p, datos.hoy) : null;
  const unaVenta = ritmo?.unaVenta ?? false;
  // Lo que viene llega DESPUÉS de que se acabe (el mismo aviso ámbar de la fila): el chip no puede decir «Ya viene» en verde junto a él, salvo que
  // solo el peor caso la pase (`unos` en 0): ahí la franja dice «Puede llegar tarde» y el chip no afirma lo que ella duda.
  const tarde = grupo === "comprar" ? llegaTarde(p, datos.hoy) : null;
  // El rojo de «Cómpralas» es de lo que se agotó o queda una semana o menos, como la barra del carril.
  const chip = chipDeGrupo(grupo, sinSalir, yaViene, unaVenta, grupo === "comprar" ? diasQueQuedan(p) : null, tarde);
  // Lo ya pedido de su tipo: una orden es del tipo y no dice a qué modelo irá (la franja de «Se está acabando» lo dice una vez; la ficha, igual).
  const pedidoDe = useMemo(() => pedidoPorTipo(datos.pedido ?? [], datos.hoy), [datos.pedido, datos.hoy]);
  // La meta contra la que se mide lo que viene en camino es la misma de «Qué pedir» (A6: el fin de la campaña del Plan, el 25-dic, o el plazo de su TIPO
  // más un mes: el mismo plazo que usa «Qué pedir»): lo que llega después se dice.
  const metaFecha = datos.horizonte.modo === "plazo" ? sumarDias(datos.hoy, metaDeTipo(datos.horizonte, plazoDeTipo(datos.prendas.filter((x) => categoriaDe(x) === categoriaDe(p)).map((x) => x.origen)))) : datos.horizonte.fecha;
  const hechos = hechosDe(
    p,
    grupo,
    datos.sedes,
    datos.hoy,
    sinSalir ? { dias: diasEnAlmacen(p, datos.hoy) } : null,
    datos.proveedores ? proveedorDelModelo(p, datos.proveedores) : null,
    { hasta: metaFecha, nombre: datos.horizonte.modo === "plazo" ? "tu plazo + 1 mes" : datos.horizonte.nombre },
    p.categoria ? (pedidoDe.get(p.categoria.trim()) ?? null) : null,
  );
  // Las cifras van en la cuadrícula; lo que lleva frases (el proveedor, lo que viene en camino) va en franjas de ancho completo debajo.
  const cifras = hechos.filter((h) => h.ancho !== "completo");
  const franjas = hechos.filter((h) => h.ancho === "completo");
  const barras = barrasSemanas(p.semanas, datos.hoy);
  const frase = fraseDelModelo(p, datos.diasDeVentas);
  const tabla = tablaDelModelo(p);
  const otras = lineaOtrasTiendas(p, datos.sedes, datos.sede.id);
  const dinero = dineroDe(p);
  // Un botón cuyo destino la cuenta no ve no se dibuja (cada función devuelve null).
  const principal = accionPrincipal(p, grupo, datos.sedes, acceso, dondeComprarDe(datos), sinSalir, yaViene);
  const pedirA = sedeParaPedir(p, grupo, datos.sedes, acceso);
  const existencias = hrefExistencias(p, acceso);
  const movimientos = hrefMovimientos(p, acceso);
  const conAcciones = Boolean(principal || pedirA || existencias || movimientos);

  return (
    <Modal titulo={p.nombre} subtitulo={subtituloFicha(p)} onClose={onCerrar} variante="hoja" tamano="mediana" conCerrar>
      <div ref={setRaiz} className="analisis analisis-hoja">
        <div className="anim">
          <div className="h-cab">
            <TilePrenda prenda={p} tamano={64} />
            <span className="h-chips">
              <ChipEstado est={chip.est}>{chip.texto}</ChipEstado>
              {ritmo && unaVenta && (
                <span data-tip={tipUnaVenta(ritmo)} tabIndex={0}>
                  <Chip tono="ambar">Una sola venta</Chip>
                </span>
              )}
            </span>
          </div>

          <div className="h-sec">
            <div className="hechos">
              {cifras.map((h, k) => (
                <div key={`${h.icono}-${k}`} className="hecho" style={{ ["--c" as string]: COLOR_TONO[h.tono] }}>
                  <Icono nombre={h.icono} />
                  <b>{h.valor}</b>
                  {h.etiqueta && <small>{h.etiqueta}</small>}
                </div>
              ))}
            </div>
            {franjas.map((h, k) => (
              <div key={`${h.icono}-${k}`} className="hecho franja" style={{ ["--c" as string]: COLOR_TONO[h.tono] }}>
                <Icono nombre={h.icono} />
                <span className="f-txt">
                  <b>{h.valor}</b>
                  {h.etiqueta && <small>{h.etiqueta}</small>}
                  {h.mas?.map((linea, j) => (
                    <small key={j}>{linea}</small>
                  ))}
                </span>
              </div>
            ))}
          </div>

          <div className="h-sec">
            <h3>Ventas por semana en {datos.sede.ciudad}</h3>
            <div className="semanas">
              {barras.map((b, j) => (
                <div key={b.inicio} className={`s ${b.ultima ? "ult" : ""}`} data-tip={b.tip}>
                  <b>{b.vendidas || ""}</b>
                  <i className="cy" style={{ ["--d" as string]: j, height: b.alto }} />
                  <span>{b.etiqueta}</span>
                </div>
              ))}
            </div>
          </div>

          {/* El modelo en tu tienda (opción B, Felipe 2026-10-10): una frase, una tabla con palabras y totales —los colores que más se
              venden arriba— y las otras tiendas en una línea. */}
          <div className="h-sec">
            <h3>Talla y color · en tus {datos.diasDeVentas} {plural(datos.diasDeVentas, "día", "días")} de ventas</h3>
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

          <div className="h-sec">
            <h3>Dinero</h3>
            <dl className="dl">
              <dt>Costó cada una</dt>
              <dd>{dinero.costo}</dd>
              <dt>Ganas por cada una</dt>
              <dd>{dinero.ganas}</dd>
            </dl>
          </div>

          {conAcciones && (
            <div className="h-acciones">
              {principal && (
                <Link href={principal.href} className={`btn-cayla ${principal.secundaria ? "btn-secundario" : "btn-primario"}`}>
                  {principal.texto}
                </Link>
              )}
              {pedirA && (
                <button type="button" className="btn-cayla btn-secundario" onClick={() => pedir([p], pedirA.id)}>
                  Pedir a {pedirA.ciudad}
                </button>
              )}
              {existencias && (
                <BotonVer href={existencias}>Ver en Existencias</BotonVer>
              )}
              {movimientos && (
                <Link href={movimientos} className="btn-cayla btn-sutil">
                  Movimientos
                </Link>
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
