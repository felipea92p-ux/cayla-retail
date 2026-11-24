import type { PasoDeAvance } from "./puntos-avance";
import type { EstadoDeLaTarjeta } from "./recepcion-tallas-reglas";
import { conMiles } from "./recepcion-modelos-reglas";

// Los pasos de UN modelo en Recibir ▸ Contar (ADR-0699, Felipe 2026-11-24): lo que le queda para salir a la venta, siempre a la vista arriba de la placa.
// Cuántas → Crear (solo si es nueva y todavía no está en el catálogo) → Tallas → Llevar. Antes la placa numeraba dos (1 · cuántas, 2 · tallas) y crear y llevar
// vivían escondidos en la tarjeta de tallas: lo nuevo quedaba «para después» sin que nadie lo decidiera, y se terminaba en otra visita (Por terminar).
//
// CONTRATO
//   PROMETE: dado lo que la pantalla ya sabe del modelo (lo contado, si está en el catálogo, cómo va su tarjeta de tallas), la lista de pasos en orden con su
//            estado para `<PuntosAvance>`: a lo más UNO abierto, y los anteriores a él hechos. `null` si al modelo no le queda nada que hacer en pasos (no llegó).
//   ASUME:   que `tarjeta` sale de `estadoDeLaTarjeta` (recepcion-tallas-reglas.ts): este archivo no decide qué está repartido ni qué está en el stock, solo lo dibuja.
//   NO HACE: no guarda ni abre nada; qué hace tocar un paso lo decide la pantalla por su `clave`.

export type ClavePaso = "cuantas" | "crear" | "tallas" | "llevar";

export type PasoDelModelo = PasoDeAvance & {
  clave: ClavePaso;
  nombre: string;
  nombreCorto: string;
  /** Cómo va ese paso, en palabras: sale al pasar el mouse y lo lee el lector de pantalla. */
  detalle: string;
};

export type ModeloParaPasos = {
  /** Ya se dijo cuántas llegaron (aunque sea 0). */
  hayConteo: boolean;
  contadas: number;
  enStock: number;
  /** Lo anotó Compras como prenda nueva (o se agregó al contar), no una reposición. */
  esNuevo: boolean;
  /** Ya tiene su prenda en el catálogo (recién creada o elegida). */
  enCatalogo: boolean;
  /** Lo que dice la tarjeta de tallas; `null` sin modelo. */
  tarjeta: EstadoDeLaTarjeta | null;
  /** Lo repartido que todavía no entró al stock. */
  repartidas: number;
};

const LLENO: ReadonlySet<EstadoDeLaTarjeta> = new Set(["lista", "en-stock"]);

export function pasosDelModelo(m: ModeloParaPasos): PasoDelModelo[] | null {
  // No llegó: no le queda nada. Lo que no cuadró se responde al cerrar.
  if (m.hayConteo && m.contadas === 0) return null;
  const todoEnStock = m.tarjeta === "en-stock";
  const creada = m.enCatalogo || m.enStock > 0;
  const porRepartir = Math.max(0, m.contadas - m.enStock);

  const tallasHechas = m.tarjeta != null && LLENO.has(m.tarjeta);
  // En orden: el primero que no está hecho es el que toca, y lo de después espera, aunque los datos digan otra cosa (un paso no se salta).
  const hechos: [ClavePaso, boolean][] = [["cuantas", m.hayConteo], ...(m.esNuevo ? [["crear", creada] as [ClavePaso, boolean]] : []), ["tallas", tallasHechas], ["llevar", todoEnStock]];
  const iToca = hechos.findIndex(([, hecho]) => !hecho);
  const estadoDe = (clave: ClavePaso): PasoDeAvance["estado"] => {
    const i = hechos.findIndex(([c]) => c === clave);
    return iToca === -1 || i < iToca ? "hecho" : i === iToca ? "abierto" : "pendiente";
  };
  const cuantas = estadoDe("cuantas");
  const crear = m.esNuevo ? estadoDe("crear") : null;
  const tallas = estadoDe("tallas");
  const llevar = estadoDe("llevar");

  const pasos: Omit<PasoDelModelo, "numero">[] = [
    {
      clave: "cuantas",
      nombre: "Cuántas llegaron",
      nombreCorto: "Cuántas",
      detalle: m.hayConteo ? `Contaste ${conMiles(m.contadas)}` : "Sin contar",
      estado: cuantas,
      abrible: true,
    },
    ...(crear
      ? [
          {
            clave: "crear" as const,
            nombre: "Crear la prenda",
            nombreCorto: "Crear",
            detalle: creada ? "Ya está en el catálogo" : "Es nueva: créala para venderla hoy",
            estado: crear,
            abrible: crear !== "pendiente",
          },
        ]
      : []),
    {
      clave: "tallas",
      nombre: "Tallas y colores",
      nombreCorto: "Tallas",
      detalle: todoEnStock ? "Ya repartidas" : tallasHechas ? `Repartidas las ${conMiles(porRepartir)}` : `Repartidas ${conMiles(m.repartidas)} de ${conMiles(porRepartir)}`,
      estado: tallas,
      abrible: tallas !== "pendiente" && !todoEnStock,
    },
    {
      clave: "llevar",
      nombre: "Llevar al stock",
      nombreCorto: "Llevar",
      detalle: todoEnStock ? "Ya está a la venta" : tallasHechas ? "Lista para llevar" : "Primero sus tallas",
      estado: llevar,
      abrible: false,
    },
  ];
  return pasos.map((p, i) => ({ ...p, numero: i + 1 }));
}
