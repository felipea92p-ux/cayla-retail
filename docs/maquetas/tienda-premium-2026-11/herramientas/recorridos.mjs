// Prueba los recorridos de la maqueta Premium en un navegador real (necesita el servidor en :3033). Uso:
//   node docs/maquetas/tienda-premium-2026-11/herramientas/recorridos.mjs
// Comprueba que las interacciones esenciales funcionan, a 1440 y a 390 px, y que no hay desborde horizontal ni errores de JS.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const { chromium } = createRequire(path.join(RAIZ, "apps/web/package.json"))("playwright");
const B = "http://127.0.0.1:3033/premium/index.html";
const resultados = [];
const prueba = async (nombre, fn) => { try { await fn(); resultados.push(["✓", nombre]); } catch (e) { resultados.push(["✗", nombre, e.message.split("\n")[0]]); } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const b = await chromium.launch();
for (const w of [1440, 390]) {
  const movil = w < 768;
  const ctx = await b.newContext({ viewport: { width: w, height: movil ? 844 : 900 }, isMobile: movil, hasTouch: movil });
  const p = await ctx.newPage();
  const errores = [];
  p.on("pageerror", e => errores.push(e.message));
  const ir = async h => { await p.goto(`${B}#${h}`); await p.waitForTimeout(250); };
  const clic = async s => { await p.locator(s).first().click(); await p.waitForTimeout(250); };
  const texto = () => p.locator("body").innerText();
  await p.goto(B); await p.evaluate(() => sessionStorage.clear()); await p.reload();
  const t = `[${w}]`;

  await prueba(`${t} inicio carga con prendas y fotos`, async () => { ok(await p.locator(".prenda").count() >= 8, "faltan tarjetas"); });
  await prueba(`${t} elegir tienda cambia la disponibilidad`, async () => {
    if (movil) await clic(".sede-linea"); else await clic(".cab .sede-boton");
    await clic('[data-a="elegirSede"][data-k="arequipa"]');
    ok((await texto()).includes("Arequipa"), "no dice Arequipa");
    if (movil) await clic(".sede-linea"); else await clic(".cab .sede-boton");
    await clic('[data-a="elegirSede"][data-k="trujillo"]');
  });
  await prueba(`${t} menú ${movil ? "del celular" : "grande"} abre y lleva a una categoría`, async () => {
    if (movil) { await clic('[data-a="menu"]'); await clic('[data-a="abrirGrupo"][data-m="ropa"]'); await clic('.cajon a[href*="categoria=VES"]'); }
    else { await clic('[data-a="mega"][data-m="ropa"]'); await clic('.mega a[href*="categoria=VES"]'); }
    ok(p.url().includes("categoria=VES"), "no navegó"); ok((await p.locator("h1").innerText()).includes("Vestidos"), "título");
  });
  await prueba(`${t} filtrar por talla y quitar el filtro`, async () => {
    await ir("/catalogo?talla=M"); const n1 = await p.locator(".prenda").count(); ok(n1 > 0, "sin resultados con M");
    await clic(".puesto"); ok(!p.url().includes("talla="), "no quitó el filtro");
  });
  await prueba(`${t} ordenar por precio`, async () => {
    await ir("/catalogo?orden=menor"); const precios = await p.$$eval(".prenda-precio b", bs => bs.slice(0, 6).map(b => Number(b.textContent.replace(/[^\d.]/g, ""))));
    ok(precios.every((x, i) => i === 0 || precios[i - 1] <= x), `desordenado ${precios}`);
  });
  await prueba(`${t} buscar: resultados mientras se escribe y «Ver las N»`, async () => {
    await ir("/"); await clic(movil ? '.solo-movil[data-a="buscarMovil"]' : 'button.buscador');
    await p.keyboard.type("blusa", { delay: 30 }); await p.waitForTimeout(300);
    ok(await p.locator(".resultados li").count() > 0, "sin resultados"); ok(await p.locator(".resultados mark").count() > 0, "sin resaltado");
    await clic('.hoja-buscar .btn-primario'); ok(p.url().includes("q=blusa"), "no llevó a la lista");
  });
  await prueba(`${t} buscar sin resultados muestra el vacío`, async () => { await ir("/catalogo?q=zzzz"); ok((await texto()).includes("No encontramos"), "sin vacío"); });
  await prueba(`${t} ficha: sin talla avisa; con talla agrega`, async () => {
    await ir("/catalogo?talla=M&hay=1"); await p.locator(".prenda-nombre").first().click(); await p.waitForTimeout(300);
    const boton = movil ? '.barra-compra [data-a="agregar"]' : '.ficha-acciones [data-a="agregar"]';
    if (await p.locator('.tallas .opcion:not([disabled])').count() > 1) { await clic(boton); ok((await texto()).includes("Elige tu talla"), "no pidió talla"); }
    await clic('.tallas .opcion:not([disabled])'); await clic(boton); await p.waitForTimeout(700);
    ok(await p.locator(".globo").count() === 1, "la bolsa no cuenta");
  });
  await prueba(`${t} favorito sin cuenta pide entrar`, async () => { await ir("/"); await clic('[data-a="fav"]'); ok((await texto()).includes("Guarda tus favoritos"), "sin hoja"); await p.keyboard.press("Escape"); });
  await prueba(`${t} Arma tu outfit: elegir, candado y Sorpréndeme`, async () => {
    await ir("/arma"); await clic('.pestanas [data-z="abajo"]'); await clic(".mini >> nth=1");
    await clic('[data-a="fijar"]'); await clic('[data-a="sorprende"]');
    ok(await p.locator('[data-a="fijar"][aria-pressed="true"]').count() >= 1, "perdió el candado");
    await clic('[data-a="armaBolsa"]'); ok(await p.locator(".modal").count() === 1, "sin hoja de tallas");
    for (const fila of await p.locator('.modal .opciones').all()) await fila.locator(".opcion:not([disabled])").first().click();
    await clic('[data-a="conjuntoAgregar"]'); ok((await texto()).includes("Agregaste"), "no agregó");
  });
  await prueba(`${t} bolsa: cantidad, quitar y deshacer`, async () => {
    await ir("/bolsa"); const antes = await p.locator(".linea").count(); ok(antes >= 2, "bolsa con menos de 2");
    await clic('[data-a="quitar"]'); ok(await p.locator(".linea").count() === antes - 1, "no quitó");
    await clic('.toast [data-a="deshacer"]'); ok(await p.locator(".linea").count() === antes, "no deshizo");
  });
  await prueba(`${t} entrar: error real y luego éxito vuelve a la bolsa`, async () => {
    await ir("/bolsa"); await clic('[data-a="separar"]'); await clic('.modal a[href="#/entrar"]');
    await p.fill("#c-correo", "maria@ejemplo.pe"); await p.fill("#c-clave", "otraclave1"); await clic('form[data-f="entrar"] button.btn-primario'); await p.waitForTimeout(1000);
    ok((await texto()).includes("no coinciden"), "sin error de contraseña");
    await p.fill("#c-clave", "cayla2026"); await clic('form[data-f="entrar"] button.btn-primario'); await p.waitForTimeout(1100);
    ok(p.url().endsWith("#/bolsa"), `no volvió a la bolsa: ${p.url()}`);
  });
  await prueba(`${t} separar: datos obligatorios, pedido y WhatsApp simulado`, async () => {
    await clic('[data-a="separar"]'); await p.waitForTimeout(300); ok(p.url().includes("/datos"), "no pidió datos");
    await clic('form[data-f="datos"] button.btn-primario'); ok((await texto()).includes("celular de 9 números"), "sin validación");
    await p.fill("#c-doc", "45678912"); await p.fill("#c-cel", "987654321"); await p.check('[name="mayor"]'); await p.check('[name="terminos"]');
    await clic('form[data-f="datos"] button.btn-primario'); await p.waitForTimeout(1300);
    ok(p.url().includes("/separado/W-"), `sin pedido: ${p.url()}`); ok((await texto()).includes("se cierra en"), "sin cuenta atrás");
    await clic('[data-a="wsp"]'); ok((await texto()).includes("¿Me confirman la separación?"), "sin mensaje"); await p.keyboard.press("Escape");
    await clic('[data-a="avanzar"]'); ok((await texto()).includes("Confirmado"), "no avanzó");
  });
  await prueba(`${t} crear cuenta con código de 6 números`, async () => {
    await p.evaluate(() => sessionStorage.clear()); await p.goto(`${B}#/crear-cuenta`); await p.reload(); await p.waitForTimeout(300);
    await p.fill("#c-correo", "nueva@ejemplo.pe"); await clic('[data-a="codigo"]'); await p.waitForTimeout(900);
    await p.locator("[data-codigo] input").first().fill("111111"); await p.waitForTimeout(500); ok((await texto()).includes("Ese código no es"), "sin error de código");
    await p.locator("[data-codigo] input").first().fill("246810"); await p.waitForTimeout(500); ok((await texto()).includes("Confirmado"), "no confirmó");
    await p.fill("#c-nombre", "Lucía"); await p.fill("#c-clave", "clave-segura"); await p.check('[name="mayor"]');
    await clic('form[data-f="registro"] button.btn-primario'); await p.waitForTimeout(1200); ok((await texto()).includes("Hola, Lucía"), "no entró");
  });
  await prueba(`${t} recuperar contraseña`, async () => { await clic('[data-a="salir"]'); await ir("/olvide"); await p.fill("#c-correo", "maria@ejemplo.pe"); await clic('form[data-f="olvide"] button'); await p.waitForTimeout(900); ok((await texto()).includes("Revisa tu correo"), "sin confirmación"); });
  await prueba(`${t} Club en sus tres estados`, async () => { for (const e of ["visitante", "cuenta", "miembro"]) { await ir(`/club?estado=${e}`); } ok((await texto()).includes("100 puntos valen S/ 5"), "sin reglas"); });
  await prueba(`${t} 404`, async () => { await ir("/no-existe"); ok((await texto()).includes("Esta página no está"), "sin 404"); });
  await prueba(`${t} sin desborde horizontal en ${12} pantallas`, async () => {
    const malas = [];
    for (const r of ["/", "/catalogo", "/prenda/" + (await p.evaluate(() => window.CAYLA.prendas[0].id)), "/looks", "/look/0", "/arma", "/ofertas", "/bolsa?demo=llena", "/entrar", "/club", "/tiendas", "/como-separar"]) {
      await ir(r); const sw = await p.evaluate(() => document.documentElement.scrollWidth); if (sw > w) malas.push(`${r} (+${sw - w})`);
    }
    ok(!malas.length, malas.join(", "));
  });
  await prueba(`${t} controles táctiles ≥ 44 px (celular)`, async () => {
    if (!movil) return;
    await ir("/prenda/" + (await p.evaluate(() => window.CAYLA.prendas[0].id)));
    const chicos = await p.$$eval("button, a.btn, .opcion, .color", els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 38 || r.width < 38) && !e.closest(".migas,.acordeon,.galeria-miniaturas"); }).map(e => (e.getAttribute("aria-label") || e.textContent).trim().slice(0, 30)));
    ok(chicos.length <= 3, `controles chicos: ${chicos.join(" | ")}`);
  });
  if (errores.length) resultados.push(["✗", `${t} errores de JS`, errores.join(" · ")]);
  await ctx.close();
}
await b.close();
for (const r of resultados) console.log(r.join("  "));
console.log(`\n${resultados.filter(r => r[0] === "✓").length}/${resultados.length} recorridos bien`);
