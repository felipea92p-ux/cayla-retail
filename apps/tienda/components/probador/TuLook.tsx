"use client";

import { soles } from "@/lib/catalogo";
import {
  ayudaDeZona,
  colorDeLaPieza,
  deLaZona,
  notaDeLaFoto,
  presentes,
  type Look,
  type PrendaDelProbador,
  type Totales,
  type Zona,
} from "@/lib/probador";
import { Icono } from "../Icono";
import { Recorte } from "./Recorte";

/** Lo que puede faltar y se invita a agregar, con su nombre. */
const AGREGAR: readonly { zona: Zona; texto: string }[] = [
  { zona: "encima", texto: "Algo encima" },
  { zona: "bolso", texto: "Un bolso" },
];

/**
 * «Tu look» (lienzo v3): cada prenda puesta con su número, su recorte, su color con cuánto hay, lo que vale en ese color y su candado
 * (Sorpréndeme no la cambia); «Algo encima» y «Un bolso» si faltan y hay qué ponerse, y lo que cuesta el look completo. Lo que la tienda
 * ya cumple va debajo, aparte (`Probador`): en la computadora se queda bajo la figura.
 */
export function TuLook({
  look,
  indice,
  prendas,
  zona,
  fijos,
  numero,
  totales,
  onElegir,
  onFijar,
}: {
  look: Look;
  indice: ReadonlyMap<string, PrendaDelProbador>;
  prendas: readonly PrendaDelProbador[];
  zona: Zona;
  fijos: Readonly<Partial<Record<Zona, boolean>>>;
  numero: Readonly<Partial<Record<Zona, number>>>;
  totales: Totales;
  onElegir: (zona: Zona) => void;
  onFijar: (zona: Zona) => void;
}) {
  return (
    <section className="pb-look" aria-label="Tu look">
      <div className="pb-look-cab">
        <h2>Tu look</h2>
        <span>El candado deja una prenda fija</span>
      </div>
      <ul className="pb-filas">
        {presentes(look).flatMap((z) => {
          const pieza = look[z]!;
          const p = indice.get(pieza.id);
          if (!p) return [];
          const c = colorDeLaPieza(p, pieza);
          const fijo = Boolean(fijos[z]);
          const deLaFoto = notaDeLaFoto(c);
          const rebajada = c.precioFinal < c.precio;
          return [
            <li key={z} className="pb-fila" data-activa={z === zona ? "" : undefined}>
              <span className="pb-fila-num" aria-hidden="true">
                {numero[z]}
              </span>
              <button type="button" className="pb-fila-foto" aria-label={`Cambiar ${p.nombre}`} onClick={() => onElegir(z)}>
                <span className="pb-fila-recorte">
                  <Recorte foto={c.foto} tamanos="48px" />
                </span>
              </button>
              <button type="button" className="pb-fila-txt" onClick={() => onElegir(z)}>
                <span className="pb-fila-nombre">{p.nombre}</span>
                <span className={`pb-fila-detalle${c.nota ? ` ${c.nota.tono}` : ""}`}>
                  <span className="pb-punto-color" data-color-dato style={c.hex ? { background: c.hex } : undefined} aria-hidden="true" />
                  {c.nombre}
                  {c.nota && ` · ${c.nota.texto}`}
                </span>
                {deLaFoto && <span className="pb-fila-sin-foto">{deLaFoto}</span>}
              </button>
              <span className="pb-fila-precio">
                {rebajada && <s>{soles(c.precio)}</s>}
                <b className={rebajada ? "oferta" : undefined}>
                  {c.desde ? "Desde " : ""}
                  {soles(c.precioFinal)}
                </b>
              </span>
              <button
                type="button"
                className="pb-candado"
                aria-pressed={fijo}
                aria-label={fijo ? `Soltar ${p.nombre}` : `Fijar ${p.nombre} y su color: Sorpréndeme no la cambia`}
                onClick={() => onFijar(z)}
              >
                <Icono nombre={fijo ? "candado" : "candadoAbierto"} />
              </button>
            </li>,
          ];
        })}
      </ul>

      {AGREGAR.filter((a) => !look[a.zona] && deLaZona(prendas, a.zona).length > 0).map((a) => (
        <button key={a.zona} type="button" className="pb-agregar" data-activa={zona === a.zona ? "" : undefined} onClick={() => onElegir(a.zona)}>
          <span className="pb-agregar-mas" aria-hidden="true">
            <Icono nombre="mas" />
          </span>
          <span className="pb-agregar-txt">{a.texto}</span>
          <span className="pb-agregar-ayuda">{ayudaDeZona(prendas, a.zona)}</span>
        </button>
      ))}

      <div className="pb-total">
        <span>El look completo</span>
        <span className="pb-total-cifra">
          {totales.lista > totales.final + 0.005 && <s>{soles(totales.lista)}</s>}
          <b>
            {totales.desde ? "Desde " : ""}
            {soles(totales.final)}
          </b>
        </span>
      </div>
    </section>
  );
}
