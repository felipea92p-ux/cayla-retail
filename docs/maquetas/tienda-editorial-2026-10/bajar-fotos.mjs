// Baja las 57 fotos de campaña de Drive («FOTOS PARA WEB ▸ EDITADAS», carpeta pública) a ./fotos/fNN.jpg, en 1600 px.
// Las fotos no van al repo (son de personas y el repo es público: ver README); esta lista y este script sí, para que otra sesión
// pueda ver las maquetas igual. `fNN` es el orden de la carpeta en Drive el 2026-11-02 (comprobado con md5 contra las bajadas del 31-oct).
// Uso: node docs/maquetas/tienda-editorial-2026-10/bajar-fotos.mjs
import { mkdir, writeFile, access, readFile } from "node:fs/promises";

const aqui = new URL(".", import.meta.url);
const lista = JSON.parse(await readFile(new URL("fotos-drive.json", aqui), "utf8"));
await mkdir(new URL("fotos/", aqui), { recursive: true });

let bajadas = 0, ya = 0, fallas = 0;
for (const { archivo, id } of lista) {
  const destino = new URL(`fotos/${archivo}`, aqui);
  try { await access(destino); ya++; continue; } catch {}
  try {
    const r = await fetch(`https://drive.google.com/thumbnail?id=${id}&sz=w1600`, { redirect: "follow" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await writeFile(destino, Buffer.from(await r.arrayBuffer()));
    bajadas++;
  } catch (e) {
    fallas++;
    console.error(`${archivo}: no se pudo bajar (${e.message})`);
  }
}
console.log(`Fotos: ${bajadas} bajadas, ${ya} ya estaban, ${fallas} con error.`);
if (fallas) process.exitCode = 1;
