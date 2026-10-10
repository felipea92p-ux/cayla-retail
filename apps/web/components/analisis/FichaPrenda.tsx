"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAnalisis } from "@/components/analisis/contexto";
import { Icono } from "@/components/analisis/iconos";
import { ChipEstado, COLOR_ESTADO, TilePrenda } from "@/components/analisis/piezas";
import type { ModeloAnalisis } from "@/lib/analisis-modelo";
import { grupoDe } from "@/lib/analisis-reglas";
import { hrefExistencias, hrefMovimientos } from "@/lib/analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  chipDeGrupo,
  dineroDe,
  dondeHay,
  grillaDelModelo,
  hechosDe,
  sedeParaPedir,
  subtituloFicha,
  type TonoFicha,
} from "@/lib/analisis-ficha";
import { diasEnAlmacen, nuncaSalio } from "@/lib/analisis-piso";

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
      <Modal titulo="Esta prenda ya no está en tu tienda" onClose={onCerrar} variante="hoja" ancho="max-w-xl" conCerrar tituloGrande>
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
  const chip = chipDeGrupo(grupo, sinSalir);
  const hechos = hechosDe(p, grupo, datos.sedes, sinSalir ? { dias: diasEnAlmacen(p, datos.hoy) } : null);
  const barras = barrasSemanas(p.semanas, datos.hoy);
  const donde = dondeHay(p, datos.sedes, datos.sede.id);
  const grilla = grillaDelModelo(p, datos.tallas);
  const dinero = dineroDe(p);
  // Un botón cuyo destino la cuenta no ve no se dibuja (cada función devuelve null).
  const principal = accionPrincipal(p, grupo, datos.sedes, acceso, sinSalir);
  const pedirA = sedeParaPedir(p, grupo, datos.sedes, acceso);
  const existencias = hrefExistencias(p, acceso);
  const movimientos = hrefMovimientos(p, acceso);
  const conAcciones = Boolean(principal || pedirA || existencias || movimientos);

  return (
    <Modal titulo={p.nombre} subtitulo={subtituloFicha(p)} onClose={onCerrar} variante="hoja" ancho="max-w-xl" conCerrar tituloGrande>
      <div ref={setRaiz} className="analisis analisis-hoja">
        <div className="anim">
          <div className="h-cab">
            <TilePrenda prenda={p} tamano={64} />
            <ChipEstado est={chip.est}>{chip.texto}</ChipEstado>
          </div>

          <div className="h-sec">
            <div className="hechos">
              {hechos.map((h, k) => (
                <div key={`${h.icono}-${k}`} className="hecho" style={{ ["--c" as string]: COLOR_TONO[h.tono] }}>
                  <Icono nombre={h.icono} />
                  <b>{h.valor}</b>
                  {h.etiqueta && <small>{h.etiqueta}</small>}
                </div>
              ))}
            </div>
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

          <div className="h-sec">
            <h3>Dónde hay</h3>
            <div className="donde">
              <div className="dn-cab">
                <span />
                <span>Tiene</span>
                <span>Vendió en 30 días</span>
              </div>
              {donde.map((f, j) => (
                <div key={f.sedeId} className="dn">
                  <span className="nm">
                    {f.ciudad}
                    {f.tuya && <small>tú</small>}
                  </span>
                  {/* En la mía, lo que hay en el piso y en el almacén: al pasar el mouse, al enfocar o al tocar. */}
                  <span className="tq" {...(f.detalle ? { "data-tip": f.detalle, tabIndex: 0, role: "img", "aria-label": `Tiene ${f.tiene}: ${f.detalle}` } : {})}>
                    <i className="cx" style={{ ["--d" as string]: j, ["--n" as string]: f.ancho }} />
                    <b>{f.tiene}</b>
                  </span>
                  <span className="vd">
                    {Array.from({ length: f.puntos }, (_, x) => (
                      <i key={x} className="po" style={{ ["--d" as string]: x }} />
                    ))}
                    <span>{f.vendio}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {grilla && (
            <div className="h-sec">
              <h3>Todo el modelo en tu tienda</h3>
              <div style={{ overflowX: "auto" }}>
                <table className="grilla">
                  <thead>
                    <tr>
                      <th />
                      {grilla.tallas.map((t) => (
                        <th key={t} className="col" scope="col">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grilla.filas.map((f) => (
                      <tr key={f.color}>
                        <th className="fil" scope="row">
                          <span className="pt" data-color-dato style={{ ["--prenda" as string]: f.punto ?? "var(--color-grafico-neutro)" }} />
                          {f.color}
                        </th>
                        {f.celdas.map((c) => (
                          <td key={c.talla} className={c.clase || undefined} tabIndex={0} data-tip={c.tip} aria-label={c.tip}>
                            {c.tiene}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                <Link href={principal.href} className="btn-cayla btn-primario">
                  {principal.texto}
                </Link>
              )}
              {pedirA && (
                <button type="button" className="btn-cayla btn-secundario" onClick={() => pedir([p], pedirA.id)}>
                  Pedir a {pedirA.ciudad}
                </button>
              )}
              {existencias && (
                <Link href={existencias} className="btn-cayla btn-secundario">
                  Ver en Existencias
                </Link>
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
