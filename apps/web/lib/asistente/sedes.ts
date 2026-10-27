// «Pregúntale a CAYLA» en cada sede (ADR-0529, actividad 8): el piloto se enciende por sede en Configuración ▸ Tiendas y caja, y lo
// cambia quien ve Configuración (Felipe 2026-10-27, `guardar_asistente_sede`). Aquí, lo puro: leer lo que devuelve la base
// (`fn_asistente_sedes`) sin creerle a ciegas, y la frase de cada sede.

export type SedeAsistente = {
  id: string;
  nombre: string;
  tipo: "tienda" | "almacen" | "taller";
  encendido: boolean;
  /** El día de Lima en que se encendió por última vez (`YYYY-MM-DD`); vacío si nunca. */
  desde: string | null;
};

const TIPOS = new Set(["tienda", "almacen", "taller"]);

/** Las filas de `fn_asistente_sedes()`. Una fila que no se entiende se salta (la pantalla no se cae por ella). */
export function leerSedesAsistente(data: unknown): SedeAsistente[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((f): SedeAsistente[] => {
    if (!f || typeof f !== "object") return [];
    const r = f as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.nombre !== "string" || typeof r.tipo !== "string" || !TIPOS.has(r.tipo)) return [];
    return [
      {
        id: r.id,
        nombre: r.nombre,
        tipo: r.tipo as SedeAsistente["tipo"],
        encendido: r.encendido === true,
        desde: typeof r.desde === "string" && r.desde ? r.desde : null,
      },
    ];
  });
}

/** Lo que dice la fila de una sede, bajo su nombre: desde cuándo corre o desde cuándo no. `hoy` = `YYYY-MM-DD` de Lima. */
export function estadoDeSede(sede: Pick<SedeAsistente, "encendido" | "desde">, hoy: string, fechaCorta: (f: string) => string): string {
  const dia = sede.desde?.slice(0, 10) ?? null;
  if (sede.encendido) return dia === null || dia === hoy ? "Encendido desde hoy" : `Encendido desde el ${fechaCorta(dia)}`;
  return dia === null ? "Nunca se encendió" : `Apagado · corrió desde el ${fechaCorta(dia)}`;
}

/** El aviso de lo que va del mes contra el tope, o nada si la base no lo dijo. */
export function gastoDelMes(gastado: number | null, tope: number): { texto: string; tono: "verde" | "ambar" | "rojo" } | null {
  if (gastado === null || !Number.isFinite(gastado) || gastado < 0) return null;
  const monto = (n: number) => `US$ ${n.toFixed(2).replace(".", ",")}`;
  const tono = gastado >= tope ? "rojo" : gastado >= tope * 0.8 ? "ambar" : "verde";
  return { texto: gastado >= tope ? `Mes gastado: ${monto(gastado)} de ${monto(tope)}. Sigue sin IA hasta el día 1.` : `Este mes: ${monto(gastado)} de ${monto(tope)}`, tono };
}
