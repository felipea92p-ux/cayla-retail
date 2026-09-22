// Partes PURAS de `pnpm terminales:crear` (ADR-0162): sin red ni base, para probarlas con `node --test` sin tocar
// ningún entorno. `crear.mjs` las usa; lo que habla con Supabase vive solo allá.

/** Las tres tiendas y cómo se las reconoce por nombre: producción las llama «Tienda TRU» y el Postgres local
 *  «Tienda Trujillo» (lo anota `20260922224300_nota_de_venta.sql`), así que se aceptan las dos formas. */
export const TIENDAS = {
  TRU: ["tru", "trujillo"],
  AQP: ["aqp", "arequipa"],
  LIM: ["lim", "lima"],
};

export const TIPOS = ["ventas", "administrativa"];

export const AYUDA = `Uso: pnpm terminales:crear <TRU|AQP|LIM> <ventas|administrativa> [--cambiar-clave]

Crea la cuenta de una terminal de tienda (ADR-0162): un usuario de Auth SIN persona, fijo a una tienda,
más su fila en retail.terminales. Muestra la clave UNA sola vez.

  --cambiar-clave   No crea nada: le pone una clave nueva a la terminal que ya existe en esa tienda.
  --help            Muestra esta ayuda.

Lee del entorno (nunca de un archivo del repo):
  NEXT_PUBLIC_SUPABASE_URL      el proyecto al que apunta (se muestra antes de confirmar)
  SUPABASE_SERVICE_ROLE_KEY     la llave de servicio (no se imprime)

Ejemplos:
  pnpm terminales:crear TRU ventas
  pnpm terminales:crear AQP administrativa --cambiar-clave`;

/** Lee los argumentos. Devuelve `{ ayuda: true }` o `{ tienda, tipo, cambiarClave }`; si algo no cuadra, lanza con un
 *  mensaje para quien lo corre (no para un programador). */
export function leerArgumentos(argv) {
  const banderas = argv.filter((a) => a.startsWith("-"));
  const posicionales = argv.filter((a) => !a.startsWith("-"));
  if (banderas.includes("--help") || banderas.includes("-h")) return { ayuda: true };
  const desconocidas = banderas.filter((b) => b !== "--cambiar-clave");
  if (desconocidas.length > 0) throw new Error(`No conozco la opción ${desconocidas.join(", ")}.`);
  if (posicionales.length !== 2) throw new Error("Faltan datos: di la tienda y el tipo, por ejemplo «TRU ventas».");
  const tienda = posicionales[0].toUpperCase();
  const tipo = posicionales[1].toLowerCase();
  if (!(tienda in TIENDAS)) throw new Error(`«${posicionales[0]}» no es una tienda: usa TRU, AQP o LIM.`);
  if (!TIPOS.includes(tipo)) throw new Error(`«${posicionales[1]}» no es un tipo: usa ventas o administrativa.`);
  return { ayuda: false, tienda, tipo, cambiarClave: banderas.includes("--cambiar-clave") };
}

/** terminal-ventas-tru@cayla.pe — un correo por tienda y tipo, fácil de reconocer en Auth. */
export function correoDe(tipo, tienda) {
  return `terminal-${tipo}-${tienda.toLowerCase()}@cayla.pe`;
}

/** «Terminal Ventas TRU» / «Terminal Administrativa TRU»: lo que sale en el pie del menú y en Colaboradores ▸ Terminales. */
export function nombreDe(tipo, tienda) {
  return `Terminal ${tipo.charAt(0).toUpperCase()}${tipo.slice(1)} ${tienda}`;
}

const sinTildes = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** De la lista de ubicaciones, la tienda ACTIVA cuyo nombre lleva el código o la ciudad como palabra suelta.
 *  Exige exactamente una: con cero o con dos, lanza y dice cuáles hay (mejor detenerse que crear en la tienda equivocada). */
export function resolverTienda(ubicaciones, codigo) {
  const claves = TIENDAS[codigo];
  const tiendas = ubicaciones.filter((u) => u.tipo === "tienda" && u.activo);
  const coinciden = tiendas.filter((u) => {
    const palabras = sinTildes(u.nombre).split(/[^a-z0-9]+/);
    return claves.some((c) => palabras.includes(c));
  });
  const lista = tiendas.map((u) => `«${u.nombre}»`).join(", ") || "ninguna";
  if (coinciden.length === 0) throw new Error(`No encontré una tienda activa para ${codigo}. Tiendas activas: ${lista}.`);
  if (coinciden.length > 1) throw new Error(`Hay más de una tienda activa que parece ${codigo}: ${coinciden.map((u) => `«${u.nombre}»`).join(", ")}.`);
  return coinciden[0];
}

// Sin 0/O, 1/l/I: la clave se escribe UNA vez a mano en el aparato y no debe prestarse a confusión.
const ALFABETO = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Clave fuerte y tecleable: 4 grupos de 5 (20 símbolos de 56 ≈ 116 bits), p. ej. «Hk7mP-q2Rst-...». `azar(n)` devuelve
 *  n bytes aleatorios (en `crear.mjs`, `crypto.randomBytes`); se recibe de afuera para poder probarla. Descarta los bytes
 *  que sesgarían el reparto (rechazo), así cada símbolo es igual de probable. */
export function generarClave(azar) {
  const tope = 256 - (256 % ALFABETO.length);
  const simbolos = [];
  while (simbolos.length < 20) {
    for (const b of azar(32)) {
      if (b < tope && simbolos.length < 20) simbolos.push(ALFABETO[b % ALFABETO.length]);
    }
  }
  return [0, 5, 10, 15].map((i) => simbolos.slice(i, i + 5).join("")).join("-");
}

export const ALFABETO_CLAVE = ALFABETO;
