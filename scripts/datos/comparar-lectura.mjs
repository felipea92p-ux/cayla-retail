/**
 * La lectura de código que usa `comparar.mjs`, separada para poder probarla (ese archivo se ejecuta al importarlo).
 *
 * EL PROBLEMA QUE RESUELVE. `comparar.mjs` solo veía una llamada escrita como `.rpc("nombre", …)` con el nombre
 * literal como primer argumento. Cualquier otra forma —un ternario `.rpc(p.activo ? "desactivar_proveedor" :
 * "reactivar_proveedor", …)`, un ayudante `llamar("cerrar_periodo", …)`— era invisible, y `DRIFT.md` decía de esa
 * función «ninguna pantalla la usa… una función que sobra y habría que retirar». Quien confiara en esa frase podía
 * retirar una función viva y romper Finanzas o Proveedores en las tiendas.
 *
 * LA REGLA. Un nombre de función de producción que aparece ENTRE COMILLAS en código de una pantalla (no en un
 * comentario ni en una prueba) cuenta como usado: no se puede leer qué parámetros manda, pero la pantalla lo nombra.
 * Por eso hay que ignorar los comentarios: un comentario que cita `agregar_colaborador` entre acentos graves NO usa la
 * función, y contarlo taparía a una función que de verdad sobra.
 *
 * LÍMITES (conocidos, a propósito): no entiende literales de expresión regular (`/["']/`); si uno trae una comilla,
 * el daño se acota a esa línea (las comillas simples y dobles no cruzan saltos de línea). Y una plantilla con `${…}`
 * se lee como un solo texto: un nombre escrito DENTRO de la expresión no se ve.
 */

/**
 * El texto con los comentarios reemplazados por espacios. Conserva la longitud y los saltos de línea, así una
 * posición en el resultado es la misma posición en el original (los números de línea no se mueven).
 * Una `//` dentro de un texto entre comillas (`"https://…"`) no es un comentario.
 */
export function sinComentarios(texto) {
  let salida = "";
  let i = 0;
  const n = texto.length;
  const blanco = (s) => s.replace(/[^\n]/g, " ");

  while (i < n) {
    const c = texto[i];
    const d = texto[i + 1];

    if (c === "/" && d === "/") {
      let j = i;
      while (j < n && texto[j] !== "\n") j++;
      salida += blanco(texto.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && d === "*") {
      const fin = texto.indexOf("*/", i + 2);
      const j = fin === -1 ? n : fin + 2;
      salida += blanco(texto.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      // Comillas simples y dobles: terminan en la misma comilla o en el salto de línea (nunca cruzan una línea; así un
      // apóstrofo suelto en un texto de pantalla no se «traga» lo que sigue).
      let j = i + 1;
      while (j < n && texto[j] !== c && texto[j] !== "\n") {
        if (texto[j] === "\\") j++;
        j++;
      }
      const fin = j < n && texto[j] === c ? j + 1 : j;
      salida += texto.slice(i, fin);
      i = fin;
      continue;
    }
    if (c === "`") {
      // Plantilla: puede cruzar líneas y termina en el acento grave sin escapar.
      let j = i + 1;
      while (j < n && texto[j] !== "`") {
        if (texto[j] === "\\") j++;
        j++;
      }
      const fin = j < n ? j + 1 : n;
      salida += texto.slice(i, fin);
      i = fin;
      continue;
    }
    salida += c;
    i++;
  }
  return salida;
}

/**
 * Los nombres de `conocidos` (un `Set` de nombres de función de producción) que aparecen entre comillas en el código
 * de `texto` —no en comentarios—, con la línea de su PRIMERA aparición. `[{ nombre, linea }]`, en orden de aparición.
 *
 * «Entre comillas» es el nombre completo y solo el nombre: `"registrar_activo"`, `'registrar_activo'` o
 * `` `registrar_activo` ``. `"registrar_activo_x"` o `"la función registrar_activo"` no cuentan.
 */
export function nombresEntreComillas(texto, conocidos) {
  const limpio = sinComentarios(texto);
  const vistos = new Set();
  const encontrados = [];
  const re = /(["'`])([a-z][a-z0-9_]*)\1/g;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    const nombre = m[2];
    if (!conocidos.has(nombre) || vistos.has(nombre)) continue;
    vistos.add(nombre);
    encontrados.push({ nombre, linea: limpio.slice(0, m.index).split("\n").length });
  }
  return encontrados;
}

/**
 * La fecha de la foto de producción en palabras («2026-09-25 16:09 UTC»), o `null` si no hay o no se entiende. Sale en
 * el informe porque todo lo que dice `comparar.mjs` es tan fresco como esa foto: una función creada o cambiada
 * DESPUÉS sale como «no existe» o con parámetros de más, aunque en producción ya esté bien.
 */
export function fechaDeLaFoto(iso) {
  if (typeof iso !== "string") return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return `${t.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
