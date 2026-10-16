// La página de elegir de la ronda 16 en UN solo archivo que se abre sin servidor: CSS del ERP, fuentes, demos y fotos adentro.
//   node empaquetar.mjs     (desde esta carpeta, después de construir.mjs) → elegir-ronda16-un-archivo.html
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const cache = new Map();
const uriDe = (ruta) => {
  if (!cache.has(ruta)) cache.set(ruta, `data:${MIME[extname(ruta).toLowerCase()] ?? "application/octet-stream"};base64,${readFileSync(ruta).toString("base64")}`);
  return cache.get(ruta);
};

let html = readFileSync("elegir.html", "utf8");
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => {
  const ruta = resolve(href);
  let css = readFileSync(ruta, "utf8");
  css = css.replace(/url\((["']?)(\.\.?\/[^"')]+)\1\)/g, (m, q, rel) => {
    const archivo = resolve(dirname(ruta), rel);
    return existsSync(archivo) ? `url("${uriDe(archivo)}")` : m;
  });
  return `<style>\n${css.replace(/<\/style/gi, "<\\/style")}\n</style>`;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => `<script>\n${readFileSync(resolve(src), "utf8").replace(/<\/script/gi, "<\\/script")}\n</script>`);
html = html.replace(/(src|data-grande)="(img\/[^"]+)"/g, (_, attr, rel) => `${attr}="${uriDe(resolve(rel))}"`);

const salida = "elegir-ronda16-un-archivo.html";
writeFileSync(salida, html);
const quedan = html.match(/(?:src|href)="(?!data:|#|https?:)[^"]+\.(?:png|jpg|css|js|woff2)"/g) ?? [];
console.log(`${salida}: ${(html.length / 1024 / 1024).toFixed(1)} MB · referencias sin resolver: ${quedan.length}`);
