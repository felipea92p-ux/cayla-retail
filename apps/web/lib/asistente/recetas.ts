// Las RECETAS de «Pregúntale a CAYLA» (ADR-0536, «Recetas», Felipe 2026-10-28). La evaluación de tareas mostró que, con el mismo código, la
// IA arma pasos distintos para la misma pregunta (entre 45 % y 73 % de tareas que llegan al final). Para las tareas de todos los días el
// camino ya se sabe: aquí está escrito una vez, paso por paso, y la IA solo elige cuál receta es y copia los datos que dijo la persona
// (la prenda, el color, la talla, cómo paga…). Lo que no tiene receta lo sigue armando la IA, revisado como siempre (`tarea.ts`).
//
// Cada paso es un paso de una guía interactiva (su `data-guia`): `recetas.test.ts` falla si una guía o un paso deja de existir, si una
// receta no termina en el paso que guarda, o si una orden nombra un dato que la receta no pide. Así la receta no queda vieja cuando una
// pantalla cambia.

import type { Guia } from "../guias/tipos";
import { PUENTES } from "./puentes";
import type { PasoPropuesto } from "./tarea";

/** Los datos que una receta puede usar, tal como los dijo la persona. */
export const DATOS = ["prenda", "color", "talla", "medio", "comprobante", "monto", "destino"] as const;
export type Dato = (typeof DATOS)[number];
export type DatosDichos = Partial<Record<Dato, string>>;

export type PasoReceta = {
  guia: string;
  paso: string;
  /** La orden con el dato entre llaves («Elige {medio}»); `sinDato` si la persona no lo dijo («Elige cómo paga»). */
  orden: string;
  sinDato?: string;
  /** El paso escribe este dato en su buscador (`data-asistente="rellenable"`), tal cual lo dijo la persona. */
  rellenar?: Dato;
};

export type Receta = {
  id: string;
  /** Lo que hace, para que la IA la reconozca (en palabras de tienda). */
  para: string;
  pasos: readonly PasoReceta[];
};

/** Los pasos para encontrar una prenda en Productos y abrir su ficha para editarla. */
const ABRIR_FICHA: readonly PasoReceta[] = [
  { guia: "productos", paso: "buscador", orden: "Busca {prenda}", sinDato: "Busca la prenda", rellenar: "prenda" },
  { guia: "productos", paso: "tarjeta", orden: "Toca la prenda" },
  { guia: "productos", paso: "vr-botones", orden: "Toca Editar" },
];

export const RECETAS: readonly Receta[] = [
  {
    id: "vender",
    para: "Vender una o más prendas en el mostrador, hasta el cobro y la boleta o factura.",
    pasos: [
      { guia: "vender", paso: "buscador", orden: "Busca {prenda}", sinDato: "Busca la prenda", rellenar: "prenda" },
      { guia: "vender", paso: "resultados", orden: "Toca la prenda en la lista" },
      { guia: "vender", paso: "responsable", orden: "Elige quién está atendiendo" },
      { guia: "vender", paso: "cobrar", orden: "Toca Cobrar" },
      { guia: "vender", paso: "cobro-medio", orden: "Elige {medio}", sinDato: "Elige cómo paga" },
      { guia: "vender", paso: "cobro-comprobante", orden: "Marca {comprobante}", sinDato: "Marca Boleta o Factura" },
      { guia: "vender", paso: "cobro-confirmar", orden: "Revisa y confirma tú el cobro" },
    ],
  },
  {
    id: "cambio",
    para: "Cambiar una prenda que el cliente compró por otra (otra talla, otro color u otra prenda).",
    pasos: [
      { guia: "cambios", paso: "buscador", orden: "Busca la venta", rellenar: "prenda" },
      { guia: "cambios", paso: "flujo-prendas", orden: "Marca la prenda que trae" },
      { guia: "cambios", paso: "reemplazo", orden: "Elige la prenda nueva" },
      { guia: "cambios", paso: "pie-reemplazo", orden: "Revisa y confirma tú el cambio" },
    ],
  },
  {
    id: "devolucion",
    para: "Devolver una prenda y devolverle la plata al cliente.",
    pasos: [
      { guia: "devoluciones", paso: "buscador", orden: "Busca la venta", rellenar: "prenda" },
      { guia: "devoluciones", paso: "devolver", orden: "Toca Devolver" },
      { guia: "devoluciones", paso: "devolucion-prendas", orden: "Marca lo que devuelve" },
      { guia: "devoluciones", paso: "devolucion-pie-prendas", orden: "Toca Continuar" },
      { guia: "devoluciones", paso: "devolucion-motivo", orden: "Elige el motivo" },
      { guia: "devoluciones", paso: "devolucion-pie-motivo", orden: "Toca Revisar la devolución" },
      { guia: "devoluciones", paso: "devolucion-responsable", orden: "Elige quién la registra" },
      { guia: "devoluciones", paso: "devolucion-confirmar", orden: "Revisa y registra tú la devolución" },
    ],
  },
  {
    id: "gasto-caja",
    para: "Anotar un gasto pagado con la plata del cajón de la tienda (un taxi, útiles, limpieza).",
    pasos: [
      { guia: "caja", paso: "gasto", orden: "Toca Gasto" },
      { guia: "caja", paso: "gasto-pie", orden: "Llena la hoja y registra tú el gasto" },
    ],
  },
  {
    id: "ingreso-caja",
    para: "Anotar plata que entra al cajón y no es una venta (sencillo, un préstamo de otra sede).",
    pasos: [
      { guia: "caja", paso: "ingreso", orden: "Toca Ingreso" },
      { guia: "caja", paso: "ingreso-pie", orden: "Llena la hoja y registra tú el ingreso" },
    ],
  },
  {
    id: "traslado",
    para: "Mandar prendas de esta sede a otra tienda o al taller.",
    pasos: [
      { guia: "inventario.traslados.nuevo", paso: "ruta", orden: "Elige {destino} como destino", sinDato: "Elige a qué sede va" },
      { guia: "inventario.traslados.nuevo", paso: "cuando", orden: "Pon cuándo debería llegar" },
      { guia: "inventario.traslados.nuevo", paso: "prendas", orden: "Elige las prendas y cuántas" },
      { guia: "inventario.traslados.nuevo", paso: "responsable", orden: "Elige quién lo envía" },
      { guia: "inventario.traslados.nuevo", paso: "enviar", orden: "Revisa y envía tú" },
    ],
  },
  {
    id: "cliente-nuevo",
    para: "Registrar un cliente nuevo con su DNI o RUC.",
    pasos: [
      { guia: "clientas", paso: "nuevo", orden: "Toca Nuevo cliente" },
      { guia: "clientas", paso: "nuevo-documento", orden: "Escribe su DNI o RUC" },
      { guia: "clientas", paso: "nuevo-nombre", orden: "Revisa su nombre" },
      { guia: "clientas", paso: "nuevo-responsable", orden: "Elige quién lo registra" },
      { guia: "clientas", paso: "nuevo-registrar", orden: "Revisa y registra tú al cliente" },
    ],
  },
  {
    id: "agregar-color",
    para: "Agregar un color nuevo a una prenda que ya existe en el catálogo.",
    pasos: [
      ...ABRIR_FICHA,
      { guia: "productos.id.editar", paso: "agregar", orden: "Toca Agregar color" },
      { guia: "productos.id.editar", paso: "agregar-color", orden: "Elige {color}", sinDato: "Elige el color que llegó" },
      { guia: "productos.id.editar", paso: "agregar-color-pie", orden: "Suma el color a la ficha" },
      { guia: "productos.id.editar", paso: "barra-guardar", orden: "Revisa y guarda tú los cambios" },
    ],
  },
  {
    id: "agregar-talla",
    para: "Agregar una talla nueva a una prenda que ya existe en el catálogo.",
    pasos: [
      ...ABRIR_FICHA,
      { guia: "productos.id.editar", paso: "agregar", orden: "Toca Agregar talla" },
      { guia: "productos.id.editar", paso: "agregar-talla", orden: "Marca la talla {talla}", sinDato: "Marca las tallas que llegaron" },
      { guia: "productos.id.editar", paso: "agregar-talla-pie", orden: "Suma la talla a la ficha" },
      { guia: "productos.id.editar", paso: "barra-guardar", orden: "Revisa y guarda tú los cambios" },
    ],
  },
  {
    id: "cambiar-precio",
    para: "Cambiar el precio de una prenda del catálogo.",
    pasos: [
      ...ABRIR_FICHA,
      { guia: "productos.id.editar", paso: "vistas", orden: "Toca Precios" },
      { guia: "productos.id.editar", paso: "bloque", orden: "Escribe el precio nuevo: S/\u00a0{monto}", sinDato: "Escribe el precio nuevo" },
      { guia: "productos.id.editar", paso: "barra-guardar", orden: "Revisa y guarda tú los cambios" },
    ],
  },
];

/** Para comparar lo que dijo la persona con el dato de la IA: sin tildes, sin mayúsculas, sin espacios de más. */
const normal = (t: string) => t.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Un dato solo vale si la persona lo dijo: la IA lo copia de la pregunta, y si no aparece ahí (sin tildes ni mayúsculas), se descarta y la
 * orden usa su texto sin dato. Así nunca se le inventa un color o un precio a nadie.
 */
export function datoDicho(valor: string | undefined, pregunta: string): string | null {
  const v = (valor ?? "").replace(/\s+/g, " ").trim();
  if (v.length < 1 || v.length > 40 || !normal(pregunta).includes(normal(v))) return null;
  return v;
}

/**
 * Las recetas que esta cuenta puede hacer: todas sus pantallas a su alcance (`pantallasAlcanzables`), contando las que se abren desde
 * otra por un puente (Editar producto, desde Productos). Una receta con una pantalla que el rol no ve no se le ofrece a la IA.
 */
export function recetasAlcanzables(alcanzables: ReadonlyMap<string, string | null>): Receta[] {
  const llega = (guiaId: string) => alcanzables.has(guiaId) || (!!PUENTES[guiaId] && alcanzables.has(PUENTES[guiaId]!.desde));
  return RECETAS.filter((r) => r.pasos.every((p) => llega(p.guia)));
}

/** Las guías de una receta con dónde llevar a la persona: su entrada, o la dirección con `[id]` de una pantalla que se abre desde otra. */
export function candidatasDeReceta(receta: Receta, guias: readonly Guia[], alcanzables: ReadonlyMap<string, string | null>): { guia: Guia; href: string | null }[] {
  const ids = [...new Set(receta.pasos.map((p) => p.guia))];
  return ids.flatMap((id) => {
    const guia = guias.find((g) => g.id === id);
    return guia ? [{ guia, href: alcanzables.has(id) ? (alcanzables.get(id) ?? null) : guia.ruta }] : [];
  });
}

/** Los pasos de la receta con los datos de la persona, listos para `revisarTarea` (que agrega lo de siempre: el celular, los cierres). */
export function pasosDeReceta(receta: Receta, datos: DatosDichos, pregunta: string): PasoPropuesto[] {
  return receta.pasos.map((p) => {
    const nombrados = [...p.orden.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as Dato);
    const valores = new Map(nombrados.map((d) => [d, datoDicho(datos[d], pregunta)]));
    const completa = nombrados.every((d) => valores.get(d));
    const orden = completa ? p.orden.replace(/\{(\w+)\}/g, (_, d: Dato) => valores.get(d)!) : (p.sinDato ?? p.orden.replace(/\s*\{\w+\}/g, ""));
    return { guia_id: p.guia, paso_id: p.paso, orden, rellenar: p.rellenar ? (datoDicho(datos[p.rellenar], pregunta) ?? "") : "" };
  });
}
