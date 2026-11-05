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
  type SinLlevar,
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
 * «Tu look» (lienzo v3): cada prenda puesta con su recorte (y su número en la esquina), su color con cuánto hay, lo que vale en ese color,
 * su candado (Sorpréndeme no la cambia) y su «✕» (no la llevo: sigue en la figura, pero no cuenta en el total ni va a la bolsa);
 * «Algo encima» y «Un bolso» si faltan y hay qué ponerse, y lo que llevas. Todas las filas miden lo mismo (Felipe 2026-10-19, opción A de
 * `docs/maquetas/tienda-rediseno-2026-10/tu-look-filas.html`): el aviso de «aún no hay foto» va una sola vez bajo la lista, no en cada fila.
 * Lo que la tienda ya cumple va debajo, aparte (`Probador`): en la computadora se queda bajo la figura.
 */
export function TuLook({
  look,
  indice,
  prendas,
  zona,
  fijos,
  sin,
  numero,
  totales,
  onElegir,
  onFijar,
  onNoLlevar,
}: {
  look: Look;
  indice: ReadonlyMap<string, PrendaDelProbador>;
  prendas: readonly PrendaDelProbador[];
  zona: Zona;
  fijos: Readonly<Partial<Record<Zona, boolean>>>;
  /** Las prendas que el cliente no lleva (por id). */
  sin: SinLlevar;
  numero: Readonly<Partial<Record<Zona, number>>>;
  totales: Totales;
  onElegir: (zona: Zona) => void;
  onFijar: (zona: Zona) => void;
  onNoLlevar: (zona: Zona) => void;
}) {
  const zonas = presentes(look).filter((z) => indice.has(look[z]!.id));
  const sinFoto = zonas.some((z) => notaDeLaFoto(colorDeLaPieza(indice.get(look[z]!.id)!, look[z]!)));
  const algunaFuera = zonas.some((z) => sin.has(look[z]!.id));
  return (
    <section className="pb-look" aria-label="Tu look">
      <div className="pb-look-cab">
        <h2>Tu look</h2>
        <span>El candado deja una prenda fija</span>
      </div>
      <ul className="pb-filas">
        {zonas.flatMap((z) => {
          const pieza = look[z]!;
          const p = indice.get(pieza.id);
          if (!p) return [];
          const c = colorDeLaPieza(p, pieza);
          const fijo = Boolean(fijos[z]);
          const fuera = sin.has(pieza.id);
          const rebajada = c.precioFinal < c.precio;
          return [
            <li key={z} className="pb-fila" data-activa={z === zona ? "" : undefined} data-fuera={fuera ? "" : undefined}>
              <button type="button" className="pb-fila-foto" aria-label={`Cambiar ${p.nombre}`} onClick={() => onElegir(z)}>
                <span className="pb-fila-num" aria-hidden="true">
                  {numero[z]}
                </span>
                <span className="pb-fila-recorte">
                  <Recorte foto={c.foto} tamanos="56px" />
                </span>
              </button>
              <button type="button" className="pb-fila-txt" onClick={() => onElegir(z)}>
                <span className="pb-fila-nombre">{p.nombre}</span>
                <span className={`pb-fila-detalle${c.nota ? ` ${c.nota.tono}` : ""}`}>
                  <span className="pb-punto-color" data-color-dato style={c.hex ? { background: c.hex } : undefined} aria-hidden="true" />
                  <span>
                    {c.nombre}
                    {c.nota && ` · ${c.nota.texto}`}
                  </span>
                </span>
              </button>
              <span className="pb-fila-precio">
                {rebajada && <s>{soles(c.precio)}</s>}
                <b className={rebajada ? "oferta" : undefined}>
                  {c.desde ? "Desde " : ""}
                  {soles(c.precioFinal)}
                </b>
              </span>
              <div className="pb-fila-acc">
                <button
                  type="button"
                  className="pb-candado"
                  aria-pressed={fijo}
                  aria-label={fijo ? `Soltar ${p.nombre}` : `Fijar ${p.nombre} y su color: Sorpréndeme no la cambia`}
                  onClick={() => onFijar(z)}
                >
                  <Icono nombre={fijo ? "candado" : "candadoAbierto"} />
                </button>
                <button
                  type="button"
                  className="pb-candado pb-no-llevo"
                  aria-pressed={fuera}
                  aria-label={fuera ? `Llevar ${p.nombre}` : `No llevar ${p.nombre}: sigue en tu look, pero no entra a la bolsa`}
                  title={fuera ? "Llevarla" : "No la llevo"}
                  onClick={() => onNoLlevar(z)}
                >
                  <Icono nombre="cerrar" />
                </button>
              </div>
            </li>,
          ];
        })}
      </ul>
      {(sinFoto || algunaFuera) && (
        <p className="pb-look-nota">
          {algunaFuera ? "Las que no llevas siguen en tu look, pero no entran a la bolsa." : "Algunos colores aún no tienen foto: ves otra foto de la prenda."}
        </p>
      )}

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
        <span>{algunaFuera ? "Lo que llevas" : "El look completo"}</span>
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
