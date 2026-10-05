// Los escenarios: lo que NO se ve al cargar una ruta —un modal abierto, la lista de un combo, el buscador global— y que hay que
// auditar igual (ADR-0336). Un escenario es `{ id, ruta, cuentas?, nombre, preparar(pagina) }`:
//   · `ruta`    la pantalla donde ocurre (estática, o una con id real que el propio escenario sabe armar).
//   · `cuentas` las claves de `tema/cuentas.mjs` que lo ven (sin esto, todas las que entren a esa ruta).
//   · `preparar` recibe la página de Playwright YA cargada y hace los clics. Debe esperar a que lo abierto termine de entrar.
//   · `abre`    (opcional) el selector de lo que el escenario DEBE dejar abierto (`[role=dialog]`…). La CLI lo exige: un escenario que
//     «pasa» sin haber abierto nada audita la página de siempre y da una falsa tranquilidad.
//   · `limpiar` (opcional) deshace lo que el escenario cambió FUERA de la página (la red del contexto, una ruta interceptada): la CLI la
//     llama siempre al terminar, porque el contexto se comparte con los escenarios que siguen.
//   · `ancho`   «escritorio» o «celular» (menos de 700 px): el escenario solo existe en ese tamaño (sin esto, en los dos).
// Cada módulo que se audita agrega aquí los suyos. Se corren con `--escenarios` (o con `--escenario <id>`).

import { consultarLocal } from "../motor/sesion.mjs";

const esperar = (pagina, ms = 700) => pagina.waitForTimeout(ms);

export const ESCENARIOS = [
  // ---------- Estructura: lo que ve toda cuenta (actividad 4) ----------
  {
    id: "estructura.lateral-plegado",
    ruta: "/",
    ancho: "escritorio",
    nombre: "Lateral plegado con la etiqueta de una fila",
    async preparar(pagina) {
      await pagina.keyboard.press("[");
      await esperar(pagina, 600);
      await pagina.locator("aside nav a").first().hover();
      await esperar(pagina, 500);
    },
    // Plegar el lateral guarda una COOKIE: sin limpiarla, todas las páginas siguientes de este contexto arrancarían plegadas.
    async limpiar(pagina) {
      const cookies = await pagina.context().cookies();
      const plegado = cookies.filter((c) => /lateral/i.test(c.name));
      await pagina.context().clearCookies({ name: plegado[0]?.name ?? "__ninguna__" }).catch(() => {});
    },
  },
  {
    id: "estructura.grupo",
    ruta: "/",
    ancho: "escritorio",
    cuentas: ["admin", "admin-global", "admin-taller", "integrante", "rol-personalizado", "terminal-administrativa"],
    nombre: "Un grupo del lateral desplegado",
    async preparar(pagina) {
      // Ventas arranca abierta: se abre otro grupo (Inventario, Catálogo o Compras: el primero que la cuenta tenga).
      await pagina.locator("aside button").filter({ hasText: /^(Inventario|Catálogo|Compras)$/ }).first().click();
      await esperar(pagina, 700);
    },
  },
  {
    id: "estructura.perfil",
    abre: "[role=dialog]",
    ruta: "/",
    ancho: "escritorio",
    // Una terminal es un aparato, no una persona: su pie del lateral no abre un perfil.
    cuentas: ["admin", "admin-global", "admin-taller", "integrante", "rol-personalizado"],
    nombre: "Mi perfil abierto",
    async preparar(pagina) {
      // Clic por DOM: en `next dev` el indicador de Next tapa esa esquina e intercepta el puntero.
      await pagina.locator("aside button").filter({ hasText: /líder|colaborador|aparato/i }).first().evaluate((el) => el.click());
      await esperar(pagina, 1100);
    },
  },
  {
    // Necesita que la sede tenga `hora_cierre` y que ya haya pasado, con la caja abierta (en la base local viene vacía).
    id: "estructura.recordatorio",
    ruta: "/",
    cuentas: ["admin", "rol-personalizado", "terminal-ventas"],
    nombre: "Recordatorio de cierre de caja abierto (la Isla)",
    async preparar(pagina) {
      await pagina.locator(".rcc-pildora").first().waitFor({ timeout: 8000 });
      await pagina.locator(".rcc-pildora").first().evaluate((el) => el.click());
      await esperar(pagina, 1200);
    },
  },
  {
    // El loader global (ADR-0149) cubre TODA la pantalla mientras responde la base: se atrapa retrasando las respuestas de Next.
    id: "estructura.loader",
    ruta: "/",
    ancho: "escritorio",
    cuentas: ["admin", "integrante", "rol-personalizado"],
    nombre: "El loader a pantalla completa mientras carga otra pantalla",
    async preparar(pagina) {
      await pagina.route(/[?&]_rsc=/, async (ruta) => {
        await new Promise((r) => setTimeout(r, 7000));
        await ruta.continue().catch(() => {});
      });
      await pagina.locator('aside a[href="/caja"], aside a[href="/vender"], aside a[href="/inventario"]').first().evaluate((el) => el.click());
      await esperar(pagina, 1600);
    },
    async limpiar(pagina) {
      await pagina.unroute(/[?&]_rsc=/).catch(() => {});
    },
  },
  {
    id: "estructura.sin-red",
    ruta: "/",
    ancho: "escritorio",
    nombre: "El aviso de «sin conexión» al perder la red",
    async preparar(pagina) {
      await pagina.context().setOffline(true);
      await pagina.evaluate(() => window.dispatchEvent(new Event("offline")));
      await esperar(pagina, 1500);
    },
    async limpiar(pagina) {
      await pagina.context().setOffline(false);
    },
  },
  {
    id: "estructura.menu-celular",
    ruta: "/",
    ancho: "celular",
    nombre: "Cajón del menú en celular",
    async preparar(pagina) {
      await pagina.locator('[aria-label="Abrir menú"]').first().click();
      await esperar(pagina, 900);
    },
  },
  {
    id: "cabecera.buscador",
    abre: "[role=dialog]",
    ruta: "/",
    nombre: "Buscador global abierto (Ctrl K)",
    async preparar(pagina) {
      await pagina.keyboard.press("Control+k");
      await esperar(pagina);
    },
  },
  {
    id: "cabecera.sede",
    ruta: "/",
    cuentas: ["admin", "admin-taller"],
    nombre: "Lista de sedes de la cabecera abierta",
    async preparar(pagina) {
      await pagina.locator('header [aria-label^="Cambiar de ubicaci"]').first().click();
      await esperar(pagina, 500);
    },
  },
  {
    id: "cabecera.actividad",
    abre: "[role=dialog]",
    ruta: "/",
    cuentas: ["admin", "admin-taller"],
    nombre: "Panel de Actividad abierto",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /^Actividad/i }).first().click();
      await esperar(pagina, 1100);
    },
  },
];

// ---------- Inicio y Rendimiento (actividad 5) ----------
// Las pestañas y los segmentos del Observatorio y de Rendimiento son `role="tab"` o `role="radio"`, no `button`.
// `espera`: lo que tarda en TERMINAR lo que el clic dispara. El mapa del Observatorio reaparece en 1.6 s: medir antes lee textos a
// mitad de aparecer (1.1:1) y da hallazgos falsos.
const clicEn = (selector, nombre, rol = "tab", espera = 900) => async (pagina) => {
  await pagina.locator(selector).getByRole(rol, { name: nombre, exact: typeof nombre === "string" }).first().click();
  await esperar(pagina, espera);
};
const ADMIN = ["admin", "admin-taller"];
ESCENARIOS.push(
  { id: "inicio.obs-productos", ruta: "/", cuentas: ADMIN, ancho: "escritorio", nombre: "Observatorio · pestaña Productos", preparar: clicEn(".obs", "Productos") },
  { id: "inicio.obs-equipo", ruta: "/", cuentas: ADMIN, ancho: "escritorio", nombre: "Observatorio · pestaña Equipo", preparar: clicEn(".obs", "Equipo") },
  { id: "inicio.obs-stock", ruta: "/", cuentas: ADMIN, ancho: "escritorio", nombre: "Observatorio · pestaña Stock", preparar: clicEn(".obs", "Stock") },
  { id: "inicio.obs-30-dias", ruta: "/", cuentas: ADMIN, ancho: "escritorio", nombre: "Observatorio · periodo de 30 días", preparar: clicEn(".obs", "30 días", "tab", 3000) },
  {
    id: "inicio.obs-toda-cayla",
    ruta: "/",
    cuentas: ADMIN,
    ancho: "escritorio",
    nombre: "Observatorio · el país entero (Toda CAYLA)",
    preparar: clicEn(".obs", /Toda CAYLA/, "tab", 3200),
  },
  {
    // El zoom del mapa dura 1.6 s: se espera de más para medir el estado FINAL y no un texto a mitad de aparecer.
    id: "inicio.obs-volver",
    ruta: "/",
    cuentas: ["admin"],
    ancho: "escritorio",
    nombre: "Observatorio · volver al país con «‹ Toda CAYLA» (zoom terminado)",
    async preparar(pagina) {
      await pagina.locator(".obs .o-volver").first().click();
      await esperar(pagina, 3200);
    },
  },
  {
    id: "inicio.obs-tooltip",
    ruta: "/",
    cuentas: ADMIN,
    ancho: "escritorio",
    nombre: "Observatorio · tooltip del gráfico al pasar el mouse",
    async preparar(pagina) {
      const g = pagina.locator(".obs .o-graf").first();
      const caja = await g.boundingBox();
      await pagina.mouse.move(caja.x + caja.width * 0.45, caja.y + caja.height * 0.5, { steps: 6 });
      await esperar(pagina, 700);
    },
  },
  {
    id: "inicio.global-zoom",
    ruta: "/",
    cuentas: ["admin-global"],
    ancho: "escritorio",
    nombre: "CAYLA Global · acercar a una tienda del mapa",
    async preparar(pagina) {
      await pagina.locator(".obs .o-et").first().evaluate((el) => el.click());
      await esperar(pagina, 1400);
    },
  },
  {
    id: "inicio.ajustar",
    abre: "[role=dialog]",
    ruta: "/",
    cuentas: ["integrante", "rol-personalizado", "admin-taller"],
    ancho: "escritorio",
    nombre: "Inicio · «Ajustar» lo que me toca",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ajustar/ }).first().click();
      await esperar(pagina, 1100);
    },
  },
  // «Rendimiento · fijar la meta de una persona» NO se puede auditar en local: el botón «Meta» queda deshabilitado mientras la persona no
  // tenga horas programadas (la meta se reparte por horas, y los horarios son de Dynamic, que la base local no trae). Es un `<Modal>`
  // estándar (verificado en la actividad 2); se revisa contra producción o con horarios cargados.
  {
    id: "rendimiento.mes",
    ruta: "/rendimiento",
    cuentas: ["admin"],
    ancho: "escritorio",
    nombre: "Rendimiento · periodo Mes y la tabla de la gráfica",
    async preparar(pagina) {
      await pagina.getByRole("radio", { name: /^Mes$/i }).first().click();
      await esperar(pagina, 1000);
      await pagina.locator("summary").filter({ hasText: /Ver como tabla/ }).first().click();
      await esperar(pagina, 600);
    },
  },
);

// ---------- Ventas I: Vender y Caja (actividad 6) ----------
const VENDEDORAS = ["terminal-ventas", "admin", "integrante", "rol-personalizado"];

/**
 * Para vender, Vender exige que haya alguien DE TURNO (la asistencia de Dynamic: `fn_asesoras_de_turno`), y la base local no trae
 * las tablas de asistencia (`public.marcajes`): ahí nadie está nunca de turno y «Cobrar» queda deshabilitado. El hook del cliente
 * (`lib/useDeTurno.ts`) lee esa RPC desde el NAVEGADOR, así que se simula SOLO en la red de la auditoría (no se toca la base): una
 * asesora presente. `limpiar` quita la ruta.
 */
async function simularAsesoraDeTurno(pagina) {
  const id = consultarLocal("select p.id from public.personas p join auth.users u on u.id = p.auth_user_id where u.email = 'lucia@cayla.local'");
  await pagina.route(/\/rpc\/fn_asesoras_de_turno/, (ruta) =>
    ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ persona_id: id, nombre_corto: "Lucía P.", estado_ahora: "presente", es_de_esta_sede: true }]) }),
  );
}
const quitarAsesora = (pagina) => pagina.unroute(/\/rpc\/fn_asesoras_de_turno/).catch(() => {});

/** Agrega la primera prenda del catálogo al ticket (el botón «Agregar …» de su tarjeta) y espera a que el ticket tenga línea. */
async function agregarPrendaAlTicket(pagina) {
  await pagina.locator('button[aria-label^="Agregar "]').first().click();
  await esperar(pagina, 900);
}
async function habilitarCobro(pagina) {
  await simularAsesoraDeTurno(pagina);
  // La lectura del turno ya se hizo al cargar (sin la simulación): se vuelve a pedir recargando la pantalla.
  await pagina.reload({ waitUntil: "networkidle" });
  await esperar(pagina, 1800);
  await agregarPrendaAlTicket(pagina);
  // «Responsable» es obligatorio para guardar: se elige a la asesora presente y «Cobrar» se habilita. Quien ya viene con una
  // responsable (una líder, que se elige a sí misma) no ve el combo vacío: el paso se salta.
  const pedido = pagina.getByText("¿Quién está atendiendo?").first();
  if (await pedido.count()) {
    await pedido.click();
    await esperar(pagina, 600);
    await pagina.locator("[role=option]").first().click(); // la única opción: la asesora simulada (con su nombre completo)
    await esperar(pagina, 900);
  }
}

/** La hoja de cobro abierta (con una prenda y su responsable). */
async function abrirCobro(pagina) {
  await habilitarCobro(pagina);
  await pagina.getByRole("button", { name: /^Cobrar/ }).first().click();
  await esperar(pagina, 1400);
}
const medio = (nombre) => async (pagina) => {
  await abrirCobro(pagina);
  await pagina.getByRole("button", { name: nombre }).first().click();
  await esperar(pagina, 1100);
};

ESCENARIOS.push(
  {
    id: "vender.ticket",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    nombre: "Vender · una prenda en el ticket",
    async preparar(pagina) {
      await agregarPrendaAlTicket(pagina);
    },
  },
  {
    id: "vender.cobrar",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: ".hoja-cobro",
    nombre: "Vender · la hoja de cobro (medios de pago)",
    preparar: abrirCobro,
    limpiar: quitarAsesora,
  },
  { id: "vender.cobro-efectivo", ruta: "/vender", cuentas: VENDEDORAS, ancho: "escritorio", abre: ".hoja-cobro", nombre: "Vender · cobro en efectivo (monto recibido y vuelto)", preparar: medio(/Efectivo/i), limpiar: quitarAsesora },
  { id: "vender.cobro-tarjeta", ruta: "/vender", cuentas: VENDEDORAS, ancho: "escritorio", abre: ".hoja-cobro", nombre: "Vender · cobro con tarjeta", preparar: medio(/Tarjeta/i), limpiar: quitarAsesora },
  { id: "vender.cobro-yape", ruta: "/vender", cuentas: VENDEDORAS, ancho: "escritorio", abre: ".hoja-cobro", nombre: "Vender · cobro con Yape", preparar: medio(/Yape/i), limpiar: quitarAsesora },
  {
    id: "vender.cobro-dos-medios",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: ".hoja-cobro",
    nombre: "Vender · cobro con dos medios (efectivo + Yape) y boleta",
    async preparar(pagina) {
      await abrirCobro(pagina);
      await pagina.getByRole("button", { name: /Efectivo/i }).first().click();
      await esperar(pagina, 700);
      await pagina.getByRole("button", { name: /Yape/i }).first().click();
      await esperar(pagina, 700);
      await pagina.getByRole("button", { name: /Boleta/i }).first().click();
      await esperar(pagina, 1100);
    },
    limpiar: quitarAsesora,
  },
  {
    id: "vender.cobro-factura",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: ".hoja-cobro",
    nombre: "Vender · cobro con factura (datos del cliente)",
    async preparar(pagina) {
      await abrirCobro(pagina);
      await pagina.getByRole("button", { name: /Efectivo/i }).first().click();
      await esperar(pagina, 600);
      await pagina.getByRole("button", { name: /Factura/i }).first().click();
      await esperar(pagina, 1100);
    },
    limpiar: quitarAsesora,
  },
  {
    id: "vender.ver-opciones",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: "[role=dialog]",
    nombre: "Vender · «Ver todos los colores y tallas» de una prenda",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ver todos los colores y ta/ }).first().click();
      await esperar(pagina, 1100);
    },
  },
  {
    id: "vender.sin-registrar",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: "[role=dialog]",
    nombre: "Vender · «Prenda sin registrar»",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Prenda sin registrar/i }).first().click();
      await esperar(pagina, 1100);
    },
  },
  {
    id: "vender.mas",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    nombre: "Vender · el menú «Más»",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /^Más/ }).first().click();
      await esperar(pagina, 900);
    },
  },
);

// ---- Vender en CELULAR (PL-105: 375 px obligatorio): el catálogo viene plegado y el ticket es una hoja que sube desde abajo ----
async function abrirCatalogoCelular(pagina) {
  await pagina.getByRole("button", { name: /Ver catálogo/i }).first().click();
  await esperar(pagina, 1200);
}
async function ticketCelular(pagina) {
  await abrirCatalogoCelular(pagina);
  await agregarPrendaAlTicket(pagina);
  await pagina.getByRole("button", { name: /Ver ticket/i }).first().click();
  await esperar(pagina, 1400);
}
ESCENARIOS.push(
  { id: "vender.m-catalogo", ruta: "/vender", cuentas: VENDEDORAS, ancho: "celular", nombre: "Vender (celular) · el catálogo abierto", preparar: abrirCatalogoCelular },
  { id: "vender.m-ticket", ruta: "/vender", cuentas: VENDEDORAS, ancho: "celular", abre: "[role=dialog]", nombre: "Vender (celular) · la hoja del ticket con una prenda", preparar: ticketCelular },
  {
    id: "vender.m-cobrar",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "celular",
    // En celular el cobro vive dentro de la hoja del ticket (un <Modal>), no en `.hoja-cobro` (el panel lateral de escritorio).
    abre: "[role=dialog]",
    nombre: "Vender (celular) · la hoja de cobro",
    async preparar(pagina) {
      await simularAsesoraDeTurno(pagina);
      await pagina.reload({ waitUntil: "networkidle" });
      await esperar(pagina, 1800);
      await ticketCelular(pagina);
      const pedido = pagina.getByText("¿Quién está atendiendo?").first();
      if (await pedido.count()) {
        await pedido.click();
        await esperar(pagina, 600);
        await pagina.locator("[role=option]").first().click();
        await esperar(pagina, 900);
      }
      await pagina.getByRole("button", { name: /^Cobrar/ }).first().click();
      await esperar(pagina, 1400);
    },
    limpiar: quitarAsesora,
  },
);

// ---------- Caja (actividad 6) ----------
const CAJEROS = ["admin", "integrante", "terminal-ventas", "rol-personalizado"];
const botonCaja = (nombre) => async (pagina) => {
  await pagina.getByRole("button", { name: nombre }).first().click();
  await esperar(pagina, 1300);
};
ESCENARIOS.push(
  { id: "caja.gasto", ruta: "/caja", cuentas: CAJEROS, ancho: "escritorio", abre: "[role=dialog]", nombre: "Caja · «Registrar gasto»", preparar: botonCaja(/^Registrar gasto/) },
  { id: "caja.deposito", ruta: "/caja", cuentas: CAJEROS, ancho: "escritorio", abre: "[role=dialog]", nombre: "Caja · «Depósito o retiro»", preparar: botonCaja(/Depósito o retiro/) },
  { id: "caja.cerrar", ruta: "/caja", cuentas: CAJEROS, ancho: "escritorio", abre: "[role=dialog]", nombre: "Caja · «Cerrar caja» (el conteo del efectivo)", preparar: botonCaja(/^Cerrar caja/) },
  {
    id: "caja.venta",
    ruta: "/caja",
    cuentas: CAJEROS,
    ancho: "escritorio",
    abre: "[role=dialog]",
    nombre: "Caja · el detalle de una venta del turno",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ver el detalle de la venta/ }).first().evaluate((el) => el.click());
      await esperar(pagina, 1500);
    },
  },
  { id: "caja.movimientos-cajon", ruta: "/caja", cuentas: CAJEROS, ancho: "escritorio", nombre: "Caja · filtro «Mueve el cajón»", preparar: botonCaja(/^Mueve el cajón/) },
  {
    id: "caja.historial-cierre",
    ruta: "/caja/historial",
    cuentas: CAJEROS,
    ancho: "escritorio",
    abre: "[role=dialog]",
    nombre: "Historial de cajas · el detalle de un cierre",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ver el detalle del cierre/ }).first().evaluate((el) => el.click());
      await esperar(pagina, 1500);
    },
  },
);

// ---------- Ventas II: Cambios, Devoluciones, Historial y Comprobantes (actividad 7) ----------
// Cambios y Devoluciones NO son modales: son un flujo de 4 pasos dentro de la página (FlujoGuiado). Los escenarios avanzan paso a paso
// hasta la confirmación, sin confirmar: «Confirmar cambio» o «Registrar devolución» escribirían en la base.
const POSVENTA = ["admin", "integrante", "terminal-ventas"];
const clicRol = (rol, nombre, opts = {}) => async (pagina) => {
  await pagina.getByRole(rol, { name: nombre, ...opts }).first().click({ timeout: 8000 });
  await esperar(pagina, 1100);
};
const secuencia = (...pasos) => async (pagina) => { for (const paso of pasos) await paso(pagina); };
const iniciarCambio = clicRol("button", /Iniciar cambio/i);
const iniciarDevolucion = clicRol("button", /^Devolver/);
const elegirPrenda = async (pagina) => { await pagina.getByRole("radio").first().click({ timeout: 8000 }); await esperar(pagina, 600); };
const marcarPrenda = async (pagina) => { await pagina.getByRole("checkbox").first().click({ timeout: 8000 }); await esperar(pagina, 600); };
const continuar = clicRol("button", /Continuar/i);
// Un paso que no todas las ventas tienen (una prenda sin colores no pide elegir color): si no está, se sigue.
const opcional = (paso) => async (pagina) => { await paso(pagina).catch(() => {}); };
ESCENARIOS.push(
  { id: "cambios.prenda", ruta: "/cambios", cuentas: POSVENTA, abre: "text=¿Qué prenda cambia?", nombre: "Cambios · paso 2: ¿qué prenda cambia?", preparar: iniciarCambio },
  {
    id: "cambios.reemplazo",
    ruta: "/cambios",
    cuentas: POSVENTA,
    abre: "text=¿Por cuál la cambia?",
    nombre: "Cambios · paso 3: el motivo y la prenda que se lleva",
    preparar: secuencia(iniciarCambio, elegirPrenda, continuar),
  },
  {
    id: "cambios.confirmacion",
    ruta: "/cambios",
    cuentas: POSVENTA,
    abre: "text=Revisa y confirma",
    nombre: "Cambios · paso 4: revisa y confirma (sin confirmar)",
    preparar: secuencia(iniciarCambio, elegirPrenda, continuar, clicRol("button", /Tiene un defecto/i), clicRol("button", /^Talla [A-Z0-9]+, compró esta/i), opcional(clicRol("button", /^Color .+, compró|^Color [^,]+$/i)), clicRol("button", /Con defecto o uso/i), clicRol("button", /Revisar el cambio/i)),
  },
  { id: "cambios.donde-buscar", ruta: "/cambios", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Cambios · la lista «Dónde buscar la venta»", preparar: clicRol("combobox", /Dónde buscar la venta/i) },
  { id: "devoluciones.prendas", ruta: "/devoluciones", cuentas: POSVENTA, abre: "text=Prendas, paso actual", nombre: "Devoluciones · paso 2: qué prendas vuelven", preparar: iniciarDevolucion },
  {
    id: "devoluciones.detalle",
    ruta: "/devoluciones",
    cuentas: POSVENTA,
    abre: "text=¿En qué estado vuelve cada prenda?",
    nombre: "Devoluciones · paso 3: motivo y estado",
    preparar: secuencia(iniciarDevolucion, marcarPrenda, continuar),
  },
  {
    id: "devoluciones.defecto",
    ruta: "/devoluciones",
    cuentas: POSVENTA,
    abre: "text=Donar",
    nombre: "Devoluciones · paso 3 con «Con defecto o uso» (qué se hace con la prenda)",
    preparar: secuencia(iniciarDevolucion, marcarPrenda, continuar, clicRol("button", /Con defecto o uso/i)),
  },
  {
    id: "devoluciones.confirmacion",
    ruta: "/devoluciones",
    cuentas: POSVENTA,
    abre: "button:has-text('Registrar devolución')",
    nombre: "Devoluciones · paso 4: revisa y confirma (sin registrar)",
    preparar: secuencia(iniciarDevolucion, marcarPrenda, continuar, clicRol("button", /No era su talla/i), clicRol("button", /Revisar la devolución/i)),
  },
  { id: "devoluciones.por-aprobar", ruta: "/devoluciones", cuentas: POSVENTA, nombre: "Devoluciones · pestaña «Por aprobar»", preparar: clicRol("tab", /Por aprobar/i) },
  { id: "devoluciones.resueltas", ruta: "/devoluciones", cuentas: POSVENTA, nombre: "Devoluciones · pestaña «Resueltas»", preparar: clicRol("tab", /Resueltas/i) },
  // Historial de ventas
  { id: "historial.filtros", ruta: "/vender/historial", cuentas: POSVENTA, nombre: "Historial · el panel «Filtros»", preparar: clicRol("button", /^Filtros/i) },
  { id: "historial.pago", ruta: "/vender/historial", cuentas: POSVENTA, abre: "[role=listbox]", nombre: "Historial · la lista del filtro «Pago»", preparar: secuencia(clicRol("button", /^Filtros/i), clicRol("button", /^Pago/i)) },
  { id: "historial.calendario", ruta: "/vender/historial", cuentas: POSVENTA, abre: "[role=gridcell]", nombre: "Historial · «Personalizado» con el calendario abierto", preparar: secuencia(clicRol("button", /Personalizado/i), clicRol("button", /Abrir calendario/i)) },
  {
    id: "historial.venta",
    ruta: "/vender/historial",
    cuentas: POSVENTA,
    abre: "[role=dialog]",
    nombre: "Historial · el detalle de una venta (con «Qué hacer con esta venta»)",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ver el detalle de la venta/ }).first().evaluate((el) => el.click());
      await esperar(pagina, 1600);
    },
  },
  // Comprobantes
  { id: "comprobantes.opciones", ruta: "/vender/comprobantes/emitidos", cuentas: ["admin", "terminal-ventas"], abre: "[role=dialog]", nombre: "Comprobantes · «Opciones» de un comprobante", preparar: clicRol("button", /Opciones de/i) },
  { id: "comprobantes.reintentar", ruta: "/vender/comprobantes/emitidos", cuentas: ["admin", "terminal-ventas"], abre: "[role=dialog]", nombre: "Comprobantes · «Reintentar» (transmitir a SUNAT)", preparar: clicRol("button", /^Reintentar/i) },
  { id: "comprobantes.tipo", ruta: "/vender/comprobantes/emitidos", cuentas: ["admin", "terminal-ventas"], abre: "[role=listbox],[role=menu]", nombre: "Comprobantes · la lista del filtro «Tipo»", preparar: clicRol("button", /^Tipo/i) },
  { id: "comprobantes.ayuda", ruta: "/vender/comprobantes/proformas", cuentas: ["admin", "terminal-ventas"], nombre: "Comprobantes · la ayuda «Qué es Proforma»", preparar: clicRol("button", /Qué es Proforma/i) },
  { id: "comprobantes.nueva-proforma", ruta: "/vender/comprobantes/proformas", cuentas: ["admin", "terminal-ventas"], abre: "[role=dialog]", nombre: "Comprobantes · «Nueva proforma»", preparar: clicRol("button", /Nueva proforma/i) },
  {
    id: "comprobantes.proforma-prenda",
    ruta: "/vender/comprobantes/proformas",
    cuentas: ["admin", "terminal-ventas"],
    abre: "[role=dialog]",
    nombre: "Comprobantes · «Nueva proforma» con una prenda buscada (la muestra y el resultado)",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Nueva proforma/i }).first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
      await pagina.getByPlaceholder(/Busca la prenda/i).first().fill("Vestido");
      await esperar(pagina, 1800);
    },
  },
  { id: "comprobantes.nueva-serie", ruta: "/vender/comprobantes/series", cuentas: ["admin", "terminal-ventas"], abre: "[role=dialog]", nombre: "Comprobantes · «Nueva serie»", preparar: clicRol("button", /Nueva serie/i) },
  { id: "comprobantes.registrar-serie", ruta: "/vender/comprobantes/series", cuentas: ["admin", "terminal-ventas"], abre: "[role=dialog]", nombre: "Comprobantes · «Registrar» la serie de notas de crédito", preparar: clicRol("button", /^Registrar$/i) },
);

// ---------- Catálogo (actividad 8) ----------
const CATALOGO = ["admin", "integrante", "terminal-administrativa"];
const irA = (ruta) => async (pagina) => {
  await pagina.goto(new URL(ruta, pagina.url()).href, { waitUntil: "networkidle" }).catch(() => {});
  await esperar(pagina, 1800);
};
const idDeProducto = (codigo) => consultarLocal(`select id from retail.productos where codigo = '${codigo.replace(/'/g, "")}' limit 1`);
const productoPorCodigo = (codigo, sufijo) => async (pagina) => irA(`/productos/${idDeProducto(codigo)}/${sufijo}`)(pagina);
// Nuevo producto es un formulario de 4 pasos que se abren de a uno: cada escenario lo lleva hasta el paso que audita (sin crear nada).
const nuevoHasta = (paso) => async (pagina) => {
  const clic = async (rol, nombre) => { await pagina.getByRole(rol, { name: nombre }).first().click({ timeout: 8000 }); await esperar(pagina, 900); };
  await clic("button", /^Indumentaria/);
  if (paso === "familia") return;
  await clic("button", /^Vestidos$/);
  if (paso === "como-es") return;
  await pagina.getByPlaceholder("Vestido Lima").first().fill("Vestido Prueba Oscuro");
  await esperar(pagina, 600);
  await clic("button", /Algodón/);
  await clic("button", /Liso/);
  await clic("button", /^Seguir/);
  if (paso === "tallas") return;
  await clic("button", /^Negro$/);
  await clic("button", /^Seguir/);
};
ESCENARIOS.push(
  { id: "productos.vista-rapida", ruta: "/productos", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Productos · la vista rápida de una prenda", async preparar(pagina) { await pagina.locator(".card-cayla button").first().click({ timeout: 8000 }); await esperar(pagina, 1500); } },
  {
    id: "productos.vista-rapida-talla",
    ruta: "/productos",
    cuentas: CATALOGO,
    abre: "[role=dialog]",
    nombre: "Productos · la vista rápida con una talla elegida (todos los colores)",
    async preparar(pagina) {
      await pagina.locator(".card-cayla button").first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
      await pagina.getByRole("button", { name: /^Elegir la talla/ }).first().click({ timeout: 8000 });
      await esperar(pagina, 900);
    },
  },
  { id: "productos.filtro-categoria", ruta: "/productos", cuentas: ["admin"], ancho: "escritorio", abre: "[role=listbox],[role=dialog],[data-capa-flotante]", nombre: "Productos · la lista del filtro «Categoría»", preparar: clicRol("button", /^Categoría/) },
  { id: "productos.ordenar", ruta: "/productos", cuentas: ["admin"], abre: "[role=listbox],[role=menu],[role=dialog]", nombre: "Productos · «Ordenar por»", preparar: clicRol("button", /^Ordenar por/) },
  { id: "productos.temporada", ruta: "/productos", cuentas: ["admin"], nombre: "Productos · el aviso «prendas sin temporada» abierto", async preparar(pagina) { await pagina.getByText(/sin temporada/i).first().click({ timeout: 8000 }); await esperar(pagina, 1100); } },
  { id: "productos.tabla", ruta: "/productos", cuentas: CATALOGO, nombre: "Productos · vista Tabla", preparar: irA("/productos?vista=tabla") },
  {
    id: "productos.tabla-variantes",
    ruta: "/productos",
    cuentas: ["admin"],
    ancho: "escritorio",
    nombre: "Productos · Tabla con las variantes de una prenda desplegadas",
    preparar: secuencia(irA("/productos?vista=tabla"), clicRol("button", /^Ver las variantes de/)),
  },
  {
    id: "productos.tabla-seleccion",
    ruta: "/productos",
    cuentas: ["admin"],
    nombre: "Productos · Tabla con prendas marcadas (la barra de acciones)",
    async preparar(pagina) {
      await irA("/productos?vista=tabla")(pagina);
      await pagina.getByRole("checkbox", { name: /^Marcar (Blusa|Vestido|Blazer)/ }).first().check({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
  { id: "nuevo.familia", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 1: las categorías de una familia", preparar: nuevoHasta("familia") },
  { id: "nuevo.como-es", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 2: cómo es (marca, nombre, tejido, patrón)", preparar: nuevoHasta("como-es") },
  { id: "nuevo.tallas", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 3: tallas y colores", preparar: nuevoHasta("tallas") },
  { id: "nuevo.precio", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 4: precio y unidades", preparar: nuevoHasta("precio") },
  { id: "producto.editar", ruta: "/productos/[id]/editar", cuentas: ["admin", "terminal-administrativa"], abre: "text=VES-0001", nombre: "Editar producto · la ficha de una prenda", preparar: productoPorCodigo("VES-0001", "editar") },
  { id: "producto.historial", ruta: "/productos/[id]/historial", cuentas: ["admin"], abre: "h1", nombre: "Historial de una prenda", preparar: productoPorCodigo("VES-0001", "historial") },
  { id: "categorias.agregar", ruta: "/productos/categorias", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Categorías · «Agregar categoría»", preparar: clicRol("button", /Agregar categoría/i) },
  { id: "categorias.fila", ruta: "/productos/categorias", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Categorías · el detalle de una categoría", preparar: clicRol("button", /Blazers/i) },
  { id: "atributos.agregar", ruta: "/productos/atributos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Atributos · «Agregar etiqueta»", preparar: clicRol("button", /Agregar etiqueta/i) },
  { id: "atributos.prendas", ruta: "/productos/atributos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Atributos · las prendas de una etiqueta", preparar: clicRol("button", /^Prendas$/i) },
  { id: "atributos.campana", ruta: "/productos/atributos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Atributos · «Configurar campaña»", preparar: clicRol("button", /Configurar campaña/i) },
  { id: "marcas.nueva", ruta: "/productos/marcas", cuentas: CATALOGO, abre: "button:has-text('Registrar')", nombre: "Marcas · «Nueva marca» (el formulario se abre en la página)", preparar: clicRol("button", /Nueva marca/i) },
  { id: "marcas.editar", ruta: "/productos/marcas", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Marcas · «Editar» una marca", preparar: clicRol("button", /^Editar/i) },
  { id: "familias.agregar", ruta: "/productos/familias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Familias · «Agregar familia»", preparar: clicRol("button", /Agregar familia/i) },
  { id: "familias.editar", ruta: "/productos/familias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Familias · «Editar» una familia", preparar: clicRol("button", /^Editar/i) },
);

// Con la caja de la sede CERRADA: Vender cuelga la persiana (ADR-0301) y /caja pide abrirla. Solo por id (`--escenario`): necesitan que el
// Postgres local tenga la caja de la sede cerrada, y quien audita la cierra y la restaura a mano (ver el ADR-0336, «Cómo se verificó»).
ESCENARIOS.push(
  { id: "caja.cerrada-vender", soloPorId: true, ruta: "/vender", cuentas: VENDEDORAS, ancho: "escritorio", abre: ".caja-cerrada", nombre: "Vender · con la caja cerrada (la persiana y el cartel)", async preparar(pagina) { await esperar(pagina, 2200); } },
  { id: "caja.cerrada-vender-m", soloPorId: true, ruta: "/vender", cuentas: VENDEDORAS, ancho: "celular", abre: ".caja-cerrada", nombre: "Vender (celular) · con la caja cerrada", async preparar(pagina) { await esperar(pagina, 2200); } },
  { id: "caja.cerrada-abrir", soloPorId: true, ruta: "/caja", cuentas: CAJEROS, ancho: "escritorio", nombre: "Caja · con la caja cerrada (abrir la caja)", async preparar(pagina) { await esperar(pagina, 1200); } },
);

export const escenariosDe = (ruta, cuentaClave, celular = false) =>
  ESCENARIOS.filter(
    (e) => e.ruta === ruta && (!e.cuentas || e.cuentas.includes(cuentaClave)) && (!e.ancho || (e.ancho === "celular") === celular),
  );
