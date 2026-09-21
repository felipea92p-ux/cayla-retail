// Pide el Inicio a la app real con la sesión de demostración y extrae su texto, por rol y por falla.
// Necesita el servidor falso corriendo (supabase-falso.mjs) y la app en marcha.
//   node scripts/demo/verifica-inicio.mjs [url-de-la-app]     (por defecto http://localhost:3000/)
// Sirve porque el HTML que entrega el servidor trae la pantalla completa aunque el navegador esté oculto.
const MOCK = "http://localhost:54399";
const APP = process.argv[2] ?? "http://localhost:3000/";
const c = await (await fetch(`${MOCK}/__mock/cookie`)).json();
const ctl = (p) => fetch(`${MOCK}/__mock/${p}`).then((r) => r.json());

function texto(html) {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "|")
    .replace(/&amp;/g, "&")
    .replace(/\|+/g, " | ")
    .replace(/\s+/g, " ")
    .trim();
  const i = t.indexOf("Hola");
  return i >= 0 ? t.slice(i) : "(sin «Hola»: " + t.slice(0, 200) + ")";
}
async function pagina() {
  const r = await fetch(APP, { headers: { Cookie: `${c.nombre}=${c.valor}` } });
  return { status: r.status, t: texto(await r.text()) };
}
const casos = [
  ["LÍDER · Tienda TRU · caja abierta", "rol?r=lider", "caja?abierta=1", "falla?que="],
  ["LÍDER · caja CERRADA", "rol?r=lider", "caja?abierta=0", "falla?que="],
  ["COLABORADORA · Tienda TRU", "rol?r=integrante", "caja?abierta=1", "falla?que="],
  ["TALLER (líder mirando desde el Taller)", "rol?r=taller", "caja?abierta=1", "falla?que="],
  ["FALLA: ventas del día", "rol?r=lider", "caja?abierta=1", "falla?que=ventas"],
  ["FALLA: traslados", "rol?r=lider", "caja?abierta=1", "falla?que=traslados"],
  ["FALLA: movimientos", "rol?r=lider", "caja?abierta=1", "falla?que=movimientos"],
];
for (const [nombre, rol, caja, falla] of casos) {
  await ctl(rol); await ctl(caja); await ctl(falla);
  const { status, t } = await pagina();
  console.log(`\n=== ${nombre}  [HTTP ${status}]\n${t.slice(0, 900)}`);
}
await ctl("rol?r=lider"); await ctl("caja?abierta=1"); await ctl("falla?que=");
