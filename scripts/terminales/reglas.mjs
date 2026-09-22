// Partes PURAS de `pnpm terminales:crear` (ADR-0162): sin red ni base, para probarlas con `node --test` sin tocar
// ningún entorno. `crear.mjs` las usa; lo que habla con Supabase vive solo allá.
//
// Desde el 2026-09-22 las terminales se crean sobre todo desde la PANTALLA (Colaboradores ▸ Terminales); este script queda
// de respaldo. Sin tipo: tienda + nombre + rol. Las reglas que comparten los dos (clave, correo, tienda, validación) viven
// en `apps/web/lib/terminales-reglas.ts` y se importan tal cual (Node 24 le quita los tipos al cargarlo).

export {
  ALFABETO_CLAVE,
  CLAVE_ROL_SUGERIDO,
  TIENDAS,
  codigoDeTienda,
  correoTerminal,
  generarClave,
  mensajeErrorAlta,
  normalizarNombre,
  resolverTienda,
  sufijoAzar,
} from "../../apps/web/lib/terminales-reglas.ts";
import { CLAVE_ROL_SUGERIDO, NOMBRE_MAX, TIENDAS, normalizarNombre } from "../../apps/web/lib/terminales-reglas.ts";

export const AYUDA = `Uso: pnpm terminales:crear <TRU|AQP|LIM> "<nombre>" [--rol "<rol>"]
     pnpm terminales:crear <TRU|AQP|LIM> "<nombre>" --cambiar-clave

RESPALDO de Colaboradores ▸ Terminales (lo normal es crearla ahí). Crea la cuenta de una terminal de tienda (ADR-0162):
un usuario de Auth SIN persona, fijo a una tienda, con el ROL que decide qué ve, más su fila en retail.terminales.
Muestra la clave UNA sola vez. Puede haber varias terminales por tienda: se distinguen por el nombre.

  --rol "<rol>"     El rol (su nombre, como se ve en Roles y accesos). Sin esto: «Terminal de ventas».
  --cambiar-clave   No crea nada: le pone una clave nueva a la terminal de ese nombre en esa tienda.
  --help            Muestra esta ayuda.

Lee del entorno (nunca de un archivo del repo):
  NEXT_PUBLIC_SUPABASE_URL      el proyecto al que apunta (se muestra antes de confirmar)
  SUPABASE_SERVICE_ROLE_KEY     la llave de servicio (no se imprime)

Ejemplos:
  pnpm terminales:crear TRU "Terminal Caja TRU"
  pnpm terminales:crear TRU "Terminal Almacén TRU" --rol "Terminal administrativa"
  pnpm terminales:crear AQP "Terminal Caja AQP" --cambiar-clave`;

/** Lee los argumentos. Devuelve `{ ayuda: true }` o `{ tienda, nombre, rol, cambiarClave }`; si algo no cuadra, lanza
 *  con un mensaje para quien lo corre (no para un programador). `rol` es null si no se pasó (se usa el sugerido). */
export function leerArgumentos(argv) {
  const args = [...argv];
  if (args.includes("--help") || args.includes("-h")) return { ayuda: true };
  let rol = null;
  let cambiarClave = false;
  const posicionales = [];
  while (args.length) {
    const a = args.shift();
    if (a === "--rol") {
      const valor = args.shift();
      if (!valor || valor.startsWith("-")) throw new Error("Falta el nombre del rol después de --rol.");
      rol = normalizarNombre(valor);
    } else if (a === "--cambiar-clave") {
      cambiarClave = true;
    } else if (a.startsWith("-")) {
      throw new Error(`No conozco la opción ${a}.`);
    } else {
      posicionales.push(a);
    }
  }
  if (posicionales.length !== 2) throw new Error('Faltan datos: di la tienda y el nombre, por ejemplo «TRU "Terminal Caja TRU"».');
  const tienda = posicionales[0].toUpperCase();
  const nombre = normalizarNombre(posicionales[1]);
  if (!(tienda in TIENDAS)) throw new Error(`«${posicionales[0]}» no es una tienda: usa TRU, AQP o LIM.`);
  if (!nombre) throw new Error("El nombre de la terminal no puede ir vacío.");
  if (nombre.length > NOMBRE_MAX) throw new Error(`El nombre es muy largo: hasta ${NOMBRE_MAX} letras.`);
  if (cambiarClave && rol) throw new Error("--cambiar-clave no cambia el rol: eso se hace en Colaboradores ▸ Terminales ▸ Cambiar rol.");
  return { ayuda: false, tienda, nombre, rol, cambiarClave };
}

/** De la lista de roles (filas de retail.roles), el que se eligió por nombre, o el sugerido. Nunca Líder ni uno archivado. */
export function resolverRol(roles, nombre) {
  const vigentes = roles.filter((r) => !r.archivado_at && !r.fijo && r.clave !== "lider");
  const lista = vigentes.map((r) => `«${r.nombre}»`).join(", ") || "ninguno";
  const elegido = nombre
    ? vigentes.find((r) => normalizarNombre(r.nombre).toLowerCase() === nombre.toLowerCase())
    : vigentes.find((r) => r.clave === CLAVE_ROL_SUGERIDO);
  if (!elegido) {
    throw new Error(
      nombre
        ? `No hay un rol vigente llamado «${nombre}». Roles que puede tener una terminal: ${lista}.`
        : `No encontré el rol «Terminal de ventas». Elige uno con --rol: ${lista}.`,
    );
  }
  return elegido;
}
