"use client";

import Image from "next/image";
import { categoriaDe } from "@/components/ui/PrendaCelda";
import { MosaicoPrenda } from "@/components/MosaicoPrenda";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { formatoSoles } from "@/lib/resumen-formato";
import { ayudaNuevos, chipsNuevos, filtrarNuevos, hrefFichaProducto, hrefFotosProducto, notaEnMiSede, type FiltroNuevos, type NuevoProducto, colorUnico } from "@/lib/inicio-almacen-reglas";
import { ChipSede } from "./ChipSede";
import { Ico } from "./iconos";
import { ReintentarLectura } from "./ReintentarLectura";

/**
 * «Nuevo en otras sedes» (maqueta docs/maquetas/inicio-almacen-2026-09/): lo que se dio de alta hoy y ayer, en un carrusel de
 * tarjetas con foto (o «Sin foto»), quién, cuándo, precio y cuánto hay YA en esta sede. Sirve para mirar si una prenda que llegó
 * sin etiqueta ya la registraron antes de crear otra igual.
 *
 * El catálogo es UNO para todas las sedes (solo cambia el inventario), así que la sección se llama «Nuevo en el catálogo» y cada
 * tarjeta lleva la sigla de la sede donde se registró (`ChipSede`, ADR-0292), con un filtro por sede cuando se conoce.
 * Cambiar de filtro reacomoda las tarjetas con una transición de vista (las que siguen se deslizan a su lugar).
 */
export function NuevoEnOtrasSedes({
  items,
  titulo,
  puedeEditar,
}: {
  /** `null` = no se pudo leer. */
  items: NuevoProducto[] | null;
  titulo: { seccion: string; lista: string };
  /** ¿Puede tomar la foto (abrir la edición del producto)? */
  puedeEditar: boolean;
}) {
  const [filtro, setFiltro] = useState<FiltroNuevos>("todas");
  const pista = useRef<HTMLDivElement>(null);

  function cambiarFiltro(nuevo: FiltroNuevos) {
    const siguiente = nuevo === filtro && nuevo !== "todas" ? "todas" : nuevo;
    const aplicar = () => setFiltro(siguiente);
    const vt = (document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> } }).startViewTransition;
    if (!vt || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return aplicar();
    // Dos clics seguidos hacen que el navegador aborte la transición anterior y lo avise por promesa: no es un error.
    const t = vt.call(document, aplicar);
    [t.ready, t.finished, t.updateCallbackDone].forEach((p) => p.catch(() => {}));
  }

  function mover(sentido: -1 | 1) {
    const p = pista.current;
    if (p) p.scrollBy({ left: sentido * p.clientWidth * 0.8, behavior: "smooth" });
  }

  const visibles = items ? filtrarNuevos(items, filtro) : [];
  let ultimoDia = "";

  return (
    <section id="nuevos" className="ia-rv">
      <div className="ia-sec-h">
        <div className="ia-l">
          <p className="label-cayla text-[11px] text-tinta/65">{titulo.seccion}</p>
          {items && <span className="ia-cnt">{items.length}</span>}
          <span className="text-[13px] text-tinta/65">hoy y ayer</span>
        </div>
        {items && items.length > 0 && (
          <div className="ia-arr">
            <button type="button" onClick={() => mover(-1)} aria-label="Anteriores">
              <Ico clave="chevron" className="rotate-180" />
            </button>
            <button type="button" onClick={() => mover(1)} aria-label="Siguientes">
              <Ico clave="chevron" />
            </button>
          </div>
        )}
      </div>

      {items === null ? (
        <div className="card-cayla ia-err">
          <Ico clave="warn" />
          <p>No se pudo leer lo nuevo del catálogo. Lo demás de esta pantalla sí está al día.</p>
          <ReintentarLectura />
        </div>
      ) : items.length === 0 ? (
        <div className="card-cayla ia-vacio">
          <span className="ia-ck">
            <svg viewBox="0 0 24 24">
              <path d="M5 12l4 4 10-10" />
            </svg>
          </span>
          <div>
            <b>Nada nuevo hoy ni ayer</b>
            <span>Cuando alguien registre un producto, aparece aquí.</span>
          </div>
        </div>
      ) : (
        <>
          <p className="ia-ayuda">
            <Ico clave="bulb" />
            <span>{ayudaNuevos(items)}</span>
          </p>
          <div className="ia-chips">
            {chipsNuevos(items).map((c) => (
              <button key={c.clave} type="button" className="ia-chip" aria-pressed={filtro === c.clave} onClick={() => cambiarFiltro(c.clave)}>
                {c.etiqueta}
                <em>{c.cuenta}</em>
              </button>
            ))}
          </div>
          <div ref={pista} className="ia-fd">
            {visibles.length === 0 ? (
              <div className="card-cayla ia-err" style={{ flex: 1 }}>
                <Ico clave="eye" />
                <p>Ninguno coincide con este filtro.</p>
              </div>
            ) : (
              visibles.map((p, i) => {
                const divisor = p.dia !== ultimoDia;
                ultimoDia = p.dia;
                return (
                  <FragmentoTarjeta key={p.id} divisor={divisor ? (p.dia === "hoy" ? "Hoy" : "Ayer") : null}>
                    <Tarjeta p={p} indice={i} puedeEditar={puedeEditar} />
                  </FragmentoTarjeta>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}

function FragmentoTarjeta({ divisor, children }: { divisor: string | null; children: React.ReactNode }) {
  return (
    <>
      {divisor && (
        <div className="ia-dv">
          <span>{divisor}</span>
        </div>
      )}
      {children}
    </>
  );
}

function Tarjeta({ p, indice, puedeEditar }: { p: NuevoProducto; indice: number; puedeEditar: boolean }) {
  const estilo = { "--i": indice, viewTransitionName: `ia-pc-${p.id.slice(0, 8)}` } as CSSProperties;
  const visibles = p.colores.slice(0, 4);
  return (
    <article className="ia-pc ia-tilt ia-spot" style={estilo}>
      <div className="ia-ft">
        {p.fotoUrl ? (
          <Image src={p.fotoUrl} alt="" fill sizes="250px" unoptimized />
        ) : (
          // La capa absoluta es de este contenedor: el mosaico trae su propio `relative`.
          <div className="absolute inset-0">
            <MosaicoPrenda forma="relleno" conNombre colorHex={colorUnico(p.colores)} {...categoriaDe(p)} className="h-full w-full !rounded-none" />
          </div>
        )}
        <i className="ia-scan" />
        <span className="ia-bd ia-nv">
          <Ico clave="plus" />
          Nuevo
        </span>
        <span className={`ia-bd ${p.fotoUrl ? "ia-fo" : "ia-sf"}`}>
          <Ico clave="camera" />
          {p.fotoUrl ? "Foto" : "Sin foto"}
        </span>
      </div>
      <div className="ia-cuerpo">
        {p.codigo && <p className="ia-cod">{p.codigo}</p>}
        <h4>{p.referencia}</h4>
        <p className="ia-qn">
          <ChipSede p={p} />
          <span>
            {p.quien ? `${p.quien} · ` : ""}
            <span className="whitespace-nowrap">{p.hace}</span>
          </span>
        </p>
        {visibles.length > 0 && (
          <div className="ia-sw">
            {visibles.map((c) => (
              <i key={c.nombre} title={c.nombre} style={{ background: c.hex ?? "var(--color-sand)" }} />
            ))}
            <b>{p.colores.length > 4 ? `+${p.colores.length - 4}` : `${p.colores.length} ${p.colores.length === 1 ? "color" : "colores"}`}</b>
          </div>
        )}
        <div className="ia-pie-pc">
          <span className="ia-pr">{p.precio === null ? "Sin precio" : formatoSoles(p.precio)}</span>
          {notaEnMiSede(p.enMiSede) && <span className={`ia-tr ${(p.enMiSede ?? 0) > 0 ? "ia-ok" : ""}`}>{notaEnMiSede(p.enMiSede)}</span>}
        </div>
      </div>
      <div className="ia-ac2">
        <Link className="ia-mini" href={hrefFichaProducto(p.id)}>
          Ver ficha
        </Link>
        {!p.fotoUrl && puedeEditar && (
          <Link className="ia-mini ia-foto" href={hrefFotosProducto(p.id)}>
            <Ico clave="camera" />
            Tomar foto
          </Link>
        )}
      </div>
    </article>
  );
}
