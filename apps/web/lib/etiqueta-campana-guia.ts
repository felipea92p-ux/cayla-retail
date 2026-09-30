// La guía de foco de la ventana «Campaña» de una etiqueta (CLAUDE.md «Guía de foco», ADR-0284). Sin React ni red.
//
// CONTRATO
//   PROMETE: decir, campo por campo, qué está hecho y qué hay que corregir, con la MISMA regla que apaga «Guardar»
//            (`valido` de `CampanaModal`): descuento, fechas y fechas entre sí bien escritos.
//   ASUME:   nada de esto es obligatorio llenarlo (una campaña puede ser solo informativa, sin descuento ni fechas). Por eso un
//            campo solo es «requerido» cuando la persona YA escribió algo en él: escribirlo mal bloquea, dejarlo vacío no.
//            Si «hecho» sale de aquí, «se puede guardar» sale de aquí también: una prueba exige que coincida con `valido`.
//   NO HACE: no agrega reglas (no vuelve obligatorio el descuento), no mira las categorías (siempre opcionales).
import type { CampoDeGuia } from "./guia-campos";
import { objecionVigencia, parsearDescuento, parsearFecha } from "./etiqueta-campana";

export type EntradaCampana = {
  descuento: string;
  desde: string;
  hasta: string;
  /** Cuántas categorías eligió la persona (opcional). */
  categorias: number;
  /** Sin él (un rol que no es líder) el descuento no se escribe: la campaña se configura solo con fechas y categorías. */
  puedeDarDescuento: boolean;
};

/** Lo que hoy apaga «Guardar» en `CampanaModal`: el descuento, las dos fechas y su orden. */
export function campanaValida(e: Pick<EntradaCampana, "descuento" | "desde" | "hasta">): boolean {
  const pct = parsearDescuento(e.descuento);
  const d = parsearFecha(e.desde);
  const h = parsearFecha(e.hasta);
  return pct.ok && d.ok && h.ok && !(d.ok && h.ok && objecionVigencia(d.valor, h.valor));
}

export function camposDeCampana(e: EntradaCampana): CampoDeGuia[] {
  const conDescuento = e.descuento.trim() !== "";
  const conFechas = e.desde.trim() !== "" || e.hasta.trim() !== "";
  const fechasBien = (() => {
    const d = parsearFecha(e.desde);
    const h = parsearFecha(e.hasta);
    return d.ok && h.ok && !objecionVigencia(d.valor, h.valor);
  })();
  return [
    ...(e.puedeDarDescuento
      ? [
          {
            id: "descuento",
            nombre: "Descuento",
            requerido: conDescuento,
            hecho: conDescuento && parsearDescuento(e.descuento).ok,
            pendiente: "Corrige el descuento: un porcentaje entre 0 y 100.",
          },
        ]
      : []),
    {
      id: "vigencia",
      nombre: "Fechas",
      requerido: conFechas,
      hecho: conFechas && fechasBien,
      pendiente: "Corrige las fechas: «Hasta» no puede ser antes que «Desde».",
    },
    { id: "categorias", nombre: "Categorías", requerido: false, hecho: e.categorias > 0, pendiente: "" },
  ];
}
