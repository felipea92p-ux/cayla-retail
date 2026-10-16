// Fotos de la cabecera de cada pantalla HOY y con la propuesta (la cabecera de Inventario/Clientes, `EncabezadoPagina`, armada en el
// navegador con el título, la frase y los botones de esa pantalla: no toca el código). Uso (desde apps/web):
//   B=… node unificar/.salida/elegir-cabeceras/cabeceras.mjs [oscuro]
import { chromium } from "playwright";
import { porClave } from "../../../tema/cuentas.mjs";
import { abrirContexto } from "../../../tema/motor/sesion.mjs";
const B = process.env.B ?? "http://localhost:3110";
const tema = process.argv[2] === "oscuro" ? "oscuro" : "claro";
const OUT = "unificar/.salida/elegir-cabeceras/img";
const PANTALLAS = [
  { id: "compras", ruta: "/compras", titulo: "Facturas de proveedor", cuenta: "admin" },
  { id: "por-pagar", ruta: "/compras/por-pagar", titulo: "Por pagar", cuenta: "admin" },
  { id: "proveedores", ruta: "/compras/proveedores", titulo: "Proveedores", cuenta: "admin" },
  { id: "recibir", ruta: "/recibir", titulo: "Recibir mercadería", cuenta: "admin" },
  { id: "produccion", ruta: "/produccion", titulo: "Resumen", cuenta: "admin-taller", sede: "Taller", frase: "¿Qué necesita mi decisión hoy? Lo que pide acción en el Taller, del más urgente al menos." },
  { id: "categorias", ruta: "/productos/categorias", titulo: "Categorías", cuenta: "admin" },
  { id: "atributos", ruta: "/productos/atributos", titulo: "Atributos", cuenta: "admin" },
  { id: "configuracion", ruta: "/configuracion", titulo: "Configuración", cuenta: "admin" },
  { id: "rendimiento", ruta: "/rendimiento", titulo: "Rendimiento", cuenta: "admin" },
  { id: "etiquetas", ruta: "/etiquetas-de-precio", titulo: "Etiquetas de precio", cuenta: "admin" },
];
const nav = await chromium.launch();
const contextos = {};
const ctx = async (c) => (contextos[c] ??= await abrirContexto(nav, porClave(c), { baseUrl: B, tema, viewport: { width: 1440, height: 900 }, escala: 1 }));
// El molde: la cabecera de Clientes (EncabezadoPagina con sus acciones a la derecha).
const pm = await (await ctx("admin")).newPage();
await pm.goto(B + "/clientas", { waitUntil: "domcontentloaded" }); await pm.waitForLoadState("networkidle").catch(() => {}); await pm.waitForTimeout(1500);
const molde = await pm.locator('main header[data-voz="cabecera"]').first().evaluate((h) => h.outerHTML);
await pm.close();
for (const s of PANTALLAS) {
  const p = await (await ctx(s.cuenta)).newPage();
  try {
    await p.goto(B + s.ruta, { waitUntil: "domcontentloaded" }); await p.waitForLoadState("networkidle").catch(() => {}); await p.waitForTimeout(2200);
    const zona = async (nombre) => {
      const caja = await p.evaluate(() => { const m = document.querySelector("main"); const r = m.getBoundingClientRect(); return { x: r.x, y: 0, width: r.width, height: 360 }; });
      await p.screenshot({ path: `${OUT}/${s.id}-${nombre}-${tema}.png`, clip: caja });
    };
    await zona("hoy");
    await p.evaluate(({ molde, titulo, sede, fraseFija }) => {
      const main = document.querySelector("main");
      const h1 = main.querySelector("h1");
      const orig = h1.closest('[data-voz="cabecera"]') ?? h1.closest('[data-guia$=".cabecera"]') ?? h1.parentElement;
      // la frase: el primer párrafo después del h1 (sin versalitas)
      let frase = null;
      for (let n = h1.nextElementSibling; n; n = n.nextElementSibling) if (n.tagName === "P") { frase = n.innerHTML; break; }
      if (fraseFija) frase = fraseFija;
      const ayuda = h1.querySelector("button");
      const acciones = [...orig.querySelectorAll("a.btn-cayla, button.btn-cayla, [data-guia] > button")].filter((b) => !h1.contains(b) && !b.closest("h1"));
      const t = document.createElement("template"); t.innerHTML = molde; const nuevo = t.content.firstElementChild;
      const h1n = nuevo.querySelector("h1"); h1n.textContent = titulo; if (ayuda) h1n.append(" ", ayuda.cloneNode(true));
      const linea = nuevo.querySelector("h1").previousElementSibling; // la línea sede · fecha
      if (linea) linea.innerHTML = linea.innerHTML.replace(/Todas las sedes/i, sede);
      const pn = h1n.nextElementSibling; if (pn && pn.tagName === "P") { if (frase) pn.innerHTML = frase; else pn.remove(); }
      const der = nuevo.lastElementChild; // la caja de las acciones (a la derecha)
      if (der && der !== nuevo.firstElementChild) { der.innerHTML = ""; acciones.forEach((a) => der.append(a.cloneNode(true))); if (!acciones.length) der.remove(); }
      orig.replaceWith(nuevo);
    }, { molde, titulo: s.titulo, sede: s.sede ?? "Tienda Lima", fraseFija: s.frase ?? null });
    await p.waitForTimeout(900);
    await zona("propuesta");
    console.log("ok", s.id);
  } catch (e) { console.log("FALLA", s.id, String(e.message).split("\n")[0]); }
  await p.close();
}
await nav.close();
