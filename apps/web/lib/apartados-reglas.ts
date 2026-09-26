// Reglas de «apartar» sin nada de servidor: las importan los modales (cliente), la lectura
// (`apartados.ts`) y las pruebas. Quien manda es la base (`apartar_stock`/`liberar_apartado`,
// 20260920160000, ADR-0141): acá solo se adelanta lo que se puede validar sin un viaje, y se
// traduce a lenguaje de tienda. Nada de esto reemplaza un candado de la base.

/** Al abrir el formulario: la clienta suele pasar en un par de días. La fecha se puede cambiar. */
export const DIAS_SUGERIDOS_APARTADO = 3;
/** Mismo tope que `c_max_dias` dentro de `apartar_stock`: un typo de año no deja una reserva de años. */
export const MAX_DIAS_APARTADO = 60;

export type Apartado = {
  id: string;
  varianteId: string;
  sku: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  sububicacionId: string | null;
  cantidad: number;
  clienta: string;
  contacto: string;
  nota: string | null;
  /** `aaaa-mm-dd`, día de Lima. */
  venceEl: string;
  creadoEn: string;
  /** Nombre de quien apartó (`personas.nombres`); null si esa persona ya no existe. */
  apartoNombre: string | null;
  /** Si QUIEN MIRA puede liberarlo. Lo calcula la base (`listar_apartados`): decisión de Felipe —
   *  cualquiera aparta, pero el apartado de otra persona solo lo libera una líder. Es la MISMA regla
   *  que aplica `liberar_apartado`, en un solo lugar: la pantalla solo decide si ofrece el botón. */
  puedeLiberar: boolean;
};

/** Por qué se libera un apartado — los mismos cuatro valores que valida `liberar_apartado`. */
export const MOTIVOS_LIBERACION = [
  { valor: "clienta_no_vino", texto: "La clienta no vino" },
  { valor: "entregada", texto: "Se la entrego a la clienta ahora (luego se cobra en Vender)" },
  { valor: "error_de_carga", texto: "Me equivoqué al apartar" },
  { valor: "otro", texto: "Otro motivo" },
] as const;
export type MotivoLiberacion = (typeof MOTIVOS_LIBERACION)[number]["valor"];

/** `aaaa-mm-dd` de HOY en Lima. `en-CA` da justo ese formato, y `timeZone` evita que un servidor
 *  en UTC corra la fecha un día (a las 8 p. m. de Lima ya es «mañana» en UTC). */
export function hoyLima(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** Suma días a un `aaaa-mm-dd` sin pasar por la zona horaria del equipo. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Días de calendario entre `hoy` y `venceEl`: negativo = ya venció. */
export function diasHasta(venceEl: string, hoy: string): number {
  const [a, m, d] = venceEl.split("-").map(Number);
  const [ha, hm, hd] = hoy.split("-").map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - Date.UTC(ha, hm - 1, hd)) / 86_400_000);
}

export type EstadoVencimiento = "vencido" | "hoy" | "vigente";

/** «Hoy» todavía vale: vence AL FINAL del día límite, no a su medianoche inicial. */
export function estadoVencimiento(venceEl: string, hoy: string): EstadoVencimiento {
  const dias = diasHasta(venceEl, hoy);
  if (dias < 0) return "vencido";
  return dias === 0 ? "hoy" : "vigente";
}

export function textoVencimiento(venceEl: string, hoy: string): string {
  const dias = diasHasta(venceEl, hoy);
  if (dias < 0) return `Venció hace ${-dias} ${-dias === 1 ? "día" : "días"}`;
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  return `Vence en ${dias} días`;
}

export function resumirApartados(apartados: Apartado[], hoy: string): { abiertos: number; unidades: number; vencidos: number } {
  return {
    abiertos: apartados.length,
    unidades: apartados.reduce((acc, a) => acc + a.cantidad, 0),
    vencidos: apartados.filter((a) => estadoVencimiento(a.venceEl, hoy) === "vencido").length,
  };
}

export type ErroresApartar = Partial<Record<"cantidad" | "clienta" | "contacto" | "fecha", string>>;

/** Los mismos candados que `apartar_stock`, en el orden en que se llena el formulario, para dar el
 *  aviso al lado del campo y no después de un viaje. `maximo` = lo DISPONIBLE en el lugar elegido. */
export function validarApartar(
  form: { cantidad: string; clienta: string; contacto: string; fecha: string },
  maximo: number,
  hoy: string
): ErroresApartar {
  const errores: ErroresApartar = {};
  const cantidad = Number(form.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    errores.cantidad = "Escribe cuántas prendas apartas (al menos 1).";
  } else if (cantidad > maximo) {
    errores.cantidad = maximo <= 0 ? "No hay prendas disponibles para apartar aquí." : `Solo ${maximo === 1 ? "hay 1 disponible" : `hay ${maximo} disponibles`} para apartar.`;
  }
  if (!form.clienta.trim()) errores.clienta = "Anota el nombre de la clienta.";
  if (!form.contacto.trim()) errores.contacto = "Anota un teléfono o WhatsApp para avisarle.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.fecha)) {
    errores.fecha = "Elige hasta cuándo se la guardas.";
  } else if (form.fecha < hoy) {
    errores.fecha = "La fecha límite no puede ser anterior a hoy.";
  } else if (form.fecha > sumarDias(hoy, MAX_DIAS_APARTADO)) {
    errores.fecha = `Como máximo ${MAX_DIAS_APARTADO} días desde hoy.`;
  }
  return errores;
}
