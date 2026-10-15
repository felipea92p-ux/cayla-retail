import "server-only";
import postgres from "postgres";

// La puerta angosta (ADR-0408): la tienda habla con la base del ERP SOLO por funciones `retail.tienda_*`, con un usuario
// que hereda el rol `tienda_web`. Ese rol no tiene permiso sobre ninguna tabla y nunca es la llave de servicio del ERP.
// `prepare: false` porque en producción la conexión pasa por el pooler de Supabase en modo transacción.
//
// Cada tema lee la base desde su propio `lib/<tema>-servidor.ts` (portada, cuentas, catálogo…), siempre con `base()` o
// `leerConRespaldo()` de aquí. Lo vigila lib/candados.test.ts.
let conexion: postgres.Sql | null = null;

export function base() {
  const url = process.env.TIENDA_DB_URL;
  if (!url) throw new Error("Falta TIENDA_DB_URL: la conexión de la tienda a la base (usuario del rol tienda_web).");
  conexion ??= postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 5, connection: { application_name: "cayla-tienda" } });
  return conexion;
}

/** Una lectura que no puede tumbar la página: si la base no responde, anota el fallo y devuelve `respaldo` (principio 9). */
export async function leerConRespaldo<T>(evento: string, leer: (db: postgres.Sql) => Promise<T>, respaldo: T): Promise<T> {
  try {
    return await leer(base());
  } catch (error) {
    console.error(JSON.stringify({ evento, mensaje: error instanceof Error ? error.message : String(error) }));
    return respaldo;
  }
}
