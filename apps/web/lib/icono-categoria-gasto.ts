// El ícono de la categoría de un gasto (la 06 del benchmark visual de Gastos, Felipe 2026-10-31): la fila dice de qué es antes de leerla,
// como el ícono de categoría de una prenda sin foto (ADR-0333). Va por el CÓDIGO de la categoría (`categorias_gasto.codigo`), nunca por su
// nombre visible, que se renombra; la que alguien cree sin deploy cae al recibo, que no promete nada. Lógica pura: el componente
// (`IconoCategoriaGasto`) solo traduce el nombre al dibujo de lucide.

export type IconoGasto =
  | "gota"
  | "casa"
  | "maletin"
  | "taza"
  | "bolsa"
  | "billete"
  | "wifi"
  | "aerosol"
  | "rayo"
  | "llave"
  | "megafono"
  | "escudo"
  | "enchufe"
  | "pantalla"
  | "tijera"
  | "telefono"
  | "camion"
  | "auto"
  | "edificio"
  | "maleta"
  | "regla"
  | "recibo";

/** @internal La tabla entera, para la prueba que exige que no haya dos categorías con el mismo dibujo. */
export const ICONO_DE_CATEGORIA: Readonly<Record<string, IconoGasto>> = {
  agua: "gota",
  alquileres: "casa",
  asesoria: "maletin",
  atencion_personal: "taza",
  bolsas: "bolsa",
  consumibles_taller: "regla",
  gastos_bancarios: "billete",
  internet: "wifi",
  limpieza: "aerosol",
  luz: "rayo",
  mantenimiento: "llave",
  publicidad: "megafono",
  seguros: "escudo",
  servicios_basicos: "enchufe",
  software: "pantalla",
  suministros: "tijera",
  telefonia: "telefono",
  traer_mercaderia: "camion",
  transporte: "auto",
  tributos: "edificio",
  viaje_compra: "maleta",
};

export function iconoDeCategoria(codigo: string | null | undefined): IconoGasto {
  return (codigo && ICONO_DE_CATEGORIA[codigo]) || "recibo";
}
