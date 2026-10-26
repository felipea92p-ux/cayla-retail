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
  // ---------- Compras ▸ Plan de campaña: el centro de avisos abierto (tarea #4 de la auditoría, 2026-10-26) ----------
  {
    id: "compras.plan-avisos",
    ruta: "/compras/plan",
    ancho: "escritorio",
    nombre: "Plan de campaña: el centro de avisos abierto",
    async preparar(pagina) {
      await pagina.locator('[data-guia="plan.avisos"] button').first().click();
      await esperar(pagina, 700);
    },
    abre: '[data-guia="plan.avisos-panel"]',
  },
  // ---------- Compras ▸ Plan de campaña ▸ Calendario (ADR-0525, 2026-10-26): la línea del año y la hoja de una campaña, nueva y existente ----------
  {
    id: "compras.plan-calendario-linea",
    ruta: "/compras/plan/calendario",
    nombre: "Calendario del plan: «La línea del año»",
    async preparar(pagina) {
      await pagina.locator('[data-guia="calendario.vista-linea"]').first().click();
      await esperar(pagina, 700);
    },
    abre: '[data-guia="calendario.linea"]',
  },
  {
    id: "compras.plan-calendario-hoja-nueva",
    ruta: "/compras/plan/calendario",
    nombre: "Calendario del plan: la hoja de una campaña nueva",
    async preparar(pagina) {
      await pagina.locator('[data-guia="calendario.nueva"]').first().click();
      await esperar(pagina, 900);
    },
    abre: "[role=dialog]",
  },
  {
    id: "compras.plan-calendario-hoja-campana",
    ruta: "/compras/plan/calendario",
    nombre: "Calendario del plan: la hoja de una campaña con su historia",
    async preparar(pagina) {
      await pagina.locator('[data-guia="calendario.en-mi-plan"] button[aria-label^="Editar"]').first().click();
      await esperar(pagina, 900);
    },
    abre: '[data-guia="calendario-hoja.historia"]',
  },
  // ---------- Compras ▸ Plan de campaña ▸ Resultados: «¿Subió la venta?» de una campaña terminada (ADR-0525, actualización b, 2026-10-26) ----------
  // La del Día de la Madre si existe (tiene historia con qué medirse); si no, la última que terminó.
  {
    id: "compras.plan-resultados-veredicto",
    ruta: "/compras/plan/resultados",
    nombre: "Resultados del plan: «¿Subió la venta?» de una campaña terminada",
    async preparar(pagina) {
      const id = consultarLocal("select p.id from retail.planes_compra p where p.hasta < retail.fn_hoy_lima() and p.archivado_en is null and p.etiqueta_id is not null order by (p.nombre ilike 'Día de la Madre%') desc, p.hasta desc limit 1");
      await irA(`/compras/plan/resultados?plan=${id}`)(pagina);
    },
    abre: '[data-guia="plan-resultados.veredicto"]',
  },
  // ---------- Compras ▸ Plan de campaña: el paso 2 de una categoría (ADR-0526, 2026-10-26): qué modelos, colores y tallas ----------
  // Necesita una campaña con una categoría que ya tenga su plan (paso 1 guardado) y pida comprar algo: se toma la campaña con más plan y, de sus categorías, la primera que ofrezca el paso 2.
  {
    id: "compras.plan-paso-2",
    ruta: "/compras/plan",
    ancho: "escritorio",
    nombre: "Plan de campaña: el paso 2 de una categoría (modelos, colores y tallas)",
    async preparar(pagina) {
      const id = consultarLocal("select pl.id from retail.planes_compra pl where pl.archivado_en is null order by (select coalesce(sum(l.normal), 0) from retail.planes_compra_lineas l where l.plan_id = pl.id) desc limit 1");
      await irA(`/compras/plan?plan=${id}`)(pagina);
      const filas = pagina.locator('[data-guia="plan.categoria"][aria-label^="Corregir"]');
      const cuantas = Math.min(await filas.count(), 10);
      for (let i = 0; i < cuantas; i++) {
        await filas.nth(i).click();
        await esperar(pagina, 900);
        const pestana = pagina.locator('[data-guia="plan-modal.paso-2"]').first();
        if (await pestana.count()) {
          await pestana.click();
          await esperar(pagina, 1500);
          return;
        }
        await pagina.keyboard.press("Escape");
        await esperar(pagina, 500);
      }
    },
    abre: '[data-guia="paso2.modelos"]',
  },
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
    // El Marcador (el aviso de cierre en el centro de la cabecera, ADR-0357; antes la «Isla») sale cuando la sede tiene `hora_cierre` y
    // faltan 15 min o menos, con la caja abierta. En la base local Tienda Lima no tiene hora de cierre, y aunque la tuviera dependería de
    // la hora a la que se corre. El escenario NO escribe en la base (es compartida con otras sesiones): contesta él la consulta que el
    // Marcador sondea (`/api/caja/recordatorio`) con una caja abierta hace 5 h y la hora de cierre de hace 70 min —nivel 3, «sin cerrar»—,
    // y le avisa a la pestaña que volvió a estar a la vista para que pregunte ya. Lo que se dibuja es el componente real; solo los datos
    // son del escenario. La pestaña colgante no baja sola en la primera lectura: la abre «Ver el detalle del cierre».
    id: "estructura.recordatorio",
    ruta: "/",
    cuentas: ["admin", "rol-personalizado", "terminal-ventas"],
    abre: ".rcc-ticket.rcc-abierta",
    nombre: "Recordatorio de cierre de caja con la pestaña abierta (el Marcador)",
    async preparar(pagina) {
      const ahora = Date.now();
      const limaHaceSetenta = new Date(ahora - 70 * 60_000 - 5 * 3_600_000); // Lima va 5 h detrás de UTC todo el año
      const horaCierre = [limaHaceSetenta.getUTCHours(), limaHaceSetenta.getUTCMinutes()].map((n) => String(n).padStart(2, "0")).join(":");
      const datos = { ubicacionId: "escenario-tema", sede: "Tienda Lima", horaCierre, caja: { id: "escenario-tema", abiertaEn: new Date(ahora - 5 * 3_600_000).toISOString(), abiertaPor: "Lucía" } };
      await pagina.route(/\/api\/caja\/recordatorio/, (ruta) => ruta.fulfill({ json: { datos, cifras: { esperado: 1240.5, ventas: 14 } } }));
      await pagina.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await pagina.locator(".rcc-caps").first().waitFor({ timeout: 8000 });
      await esperar(pagina, 900);
      if ((await pagina.locator(".rcc-ticket.rcc-abierta").count()) === 0) await pagina.locator(".rcc-mas, .rcc-caps").first().click({ timeout: 4000 });
      await esperar(pagina, 1200);
    },
    async limpiar(pagina) {
      await pagina.unroute(/\/api\/caja\/recordatorio/).catch(() => {});
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
      // El período es una píldora (ADR-0358): un botón con `aria-pressed`, ya no un radio.
      await pagina.getByRole("button", { name: /^Mes$/i }).first().click();
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
    // La ficha del color que se mira, abierta (ADR-0316; Felipe 2026-10-10): «Combina bien con» y la frase tras «¿Por qué?».
    id: "vender.ver-opciones-porque",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    abre: "[role=dialog]",
    nombre: "Vender · «Todo de la prenda» con el «¿Por qué?» del color abierto",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ver todos los colores y ta/ }).first().click();
      await esperar(pagina, 1100);
      await pagina.getByRole("button", { name: /^¿Por qué\?$/ }).first().click({ timeout: 8000 });
      await esperar(pagina, 600);
    },
  },
  {
    // La tarjeta sugerida que SE QUEDA al entrar al ticket (Formidable 2026-10-10, cambio 1): chip «1 en el ticket · 1 aquí», visto y «Quitar».
    id: "vender.ver-opciones-en-ticket",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    abre: "[role=dialog]",
    nombre: "Vender · «Todo de la prenda» con la prenda sugerida ya en el ticket",
    async preparar(pagina) {
      await pagina.getByRole("button", { name: /Ver todos los colores y ta/ }).first().click();
      await esperar(pagina, 1100);
      await pagina.getByRole("button", { name: /Ver tallas/ }).first().click({ timeout: 8000 });
      await esperar(pagina, 500);
      await pagina.locator('[role=dialog] [aria-label^="Prendas que combinan"] button[aria-label*=" aquí"]').first().click({ timeout: 8000 });
      await esperar(pagina, 900);
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
/** La hoja de cobro abierta en el celular: una asesora de turno simulada, una prenda en la hoja del ticket y «Cobrar». */
async function cobroCelular(pagina) {
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
    preparar: cobroCelular,
    limpiar: quitarAsesora,
  },
);

// ---- Vender: varios clientes a la vez (pestañas de tickets, Felipe 2026-10-25) ----
/** Dos tickets con prendas: uno espera y el otro está en la caja. Es la misma prenda en los dos, así sale también el aviso «Ya está en el
 *  ticket de Cliente 1» donde no alcanza. Los tickets viven en el navegador: no se escribe nada en la base. */
async function dosTickets(pagina) {
  await agregarPrendaAlTicket(pagina);
  await pagina.getByRole("button", { name: /^Nuevo cliente/ }).first().click();
  await esperar(pagina, 900);
  await agregarPrendaAlTicket(pagina);
}
async function dosTicketsCelular(pagina) {
  await abrirCatalogoCelular(pagina);
  await agregarPrendaAlTicket(pagina);
  await pagina.getByRole("button", { name: /Ver ticket/i }).first().click();
  await esperar(pagina, 1200);
  await pagina.getByRole("button", { name: "Nuevo cliente" }).first().click();
  await esperar(pagina, 900);
  await pagina.getByRole("button", { name: /Volver al catálogo/i }).first().click();
  await esperar(pagina, 900);
  await agregarPrendaAlTicket(pagina);
  await pagina.getByRole("button", { name: /Ver ticket/i }).first().click();
  await esperar(pagina, 1200);
}
ESCENARIOS.push(
  {
    id: "vender.tickets",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: '[role="group"][aria-label="Tickets abiertos"]',
    nombre: "Vender · pestañas de tickets (uno en la caja y uno esperando, con el aviso de la prenda repetida)",
    preparar: dosTickets,
  },
  {
    id: "vender.tickets-descartar",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "escritorio",
    abre: "[role=dialog]",
    nombre: "Vender · «Descartar este ticket» (pide confirmación)",
    async preparar(pagina) {
      await dosTickets(pagina);
      await pagina.getByRole("button", { name: /^Descartar el ticket de/ }).first().click();
      await esperar(pagina, 1000);
    },
  },
  {
    id: "vender.tickets-cierre",
    ruta: "/vender",
    // Cerrar la caja solo lo hace un líder o la terminal de ventas (ADR-0160).
    cuentas: ["admin", "terminal-ventas"],
    ancho: "escritorio",
    abre: "[data-tickets-sin-cobrar]",
    nombre: "Vender · «Hay tickets sin cobrar» antes de cerrar la caja",
    async preparar(pagina) {
      await dosTickets(pagina);
      await pagina.getByRole("button", { name: /^Más/ }).first().click();
      await esperar(pagina, 900);
      await pagina.getByRole("button", { name: "Cerrar caja", exact: true }).click();
      await esperar(pagina, 1200);
    },
  },
  {
    id: "vender.m-tickets",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "celular",
    abre: '[data-guia="vender.tickets"] button[aria-haspopup="dialog"]',
    nombre: "Vender (celular) · el selector «Cliente 2 de 2» en la hoja del ticket",
    preparar: dosTicketsCelular,
  },
  {
    id: "vender.m-tickets-lista",
    ruta: "/vender",
    cuentas: VENDEDORAS,
    ancho: "celular",
    abre: "[data-lista-tickets]",
    nombre: "Vender (celular) · la lista «Tus clientes»",
    async preparar(pagina) {
      await dosTicketsCelular(pagina);
      await pagina.locator('[data-guia="vender.tickets"] button[aria-haspopup="dialog"]').first().click();
      await esperar(pagina, 1100);
    },
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
/** Un clic en la pieza anclada por su `data-guia` (las guías interactivas, ADR-0389): no depende de su texto. */
const clicGuia = (guia) => async (pagina) => {
  await pagina.locator(`[data-guia="${guia}"]`).first().click({ timeout: 8000 });
  await esperar(pagina, 1100);
};
const clicRol = (rol, nombre, opts = {}) => async (pagina) => {
  await pagina.getByRole(rol, { name: nombre, ...opts }).first().click({ timeout: 8000 });
  await esperar(pagina, 1100);
};
// Una pestaña de vista (`<Pestanas>`, ADR-0358): con la vista en la URL es un enlace (`aria-current`); como estado, un `tab`. Se
// busca dentro de la fila para no tomar un enlace del lateral con el mismo nombre.
const clicPestana = (nombre) => async (pagina) => {
  await pagina.locator(".pestanas-cayla").locator("a, [role=tab]").filter({ hasText: nombre }).first().click({ timeout: 8000 });
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
  { id: "comprobantes.opciones", ruta: "/vender/comprobantes/emitidos", cuentas: ["admin", "terminal-ventas"], abre: "[role=dialog]", nombre: "Comprobantes · el «⋯» de un comprobante", preparar: clicRol("button", /Más acciones de/i) },
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
    // La ficha del color de la foto, abierta (ADR-0316; Felipe 2026-10-10): «Combina bien con» bajo la foto y la frase tras «¿Por qué?».
    id: "productos.vista-rapida-porque",
    ruta: "/productos",
    cuentas: CATALOGO,
    abre: "[role=dialog]",
    nombre: "Productos · la vista rápida con el «¿Por qué?» del color abierto",
    async preparar(pagina) {
      await pagina.locator(".card-cayla button").first().click({ timeout: 8000 });
      await esperar(pagina, 1500);
      await pagina.getByRole("button", { name: /^¿Por qué\?$/ }).first().click({ timeout: 8000 });
      await esperar(pagina, 600);
    },
  },
  // ADR-0354: «Historial» da vuelta la página dentro de la misma hoja; `abre` exige el hilo, no solo la ventana.
  {
    id: "productos.vista-rapida-historial",
    ruta: "/productos",
    cuentas: CATALOGO,
    abre: "[role=dialog] .hp",
    nombre: "Productos · el historial de una prenda (vista rápida ▸ Historial)",
    async preparar(pagina) {
      await pagina.locator(".card-cayla button").first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
      await pagina.locator("[data-ir-historial]").click({ timeout: 8000 });
      await esperar(pagina, 2500);
    },
  },
  // ADR-0515: la pestaña «Costo» del Historial (con «Hoy: N prendas» estimado) y la hoja «Corregir el costo» de la última compra. Solo
  // quien ve el dinero de compras: el admin. `abre` exige la tarjeta o la hoja, no solo la ventana.
  {
    id: "productos.historial-costo",
    ruta: "/productos",
    cuentas: ["admin"],
    abre: '[role=dialog] [data-guia="historial-prenda.costo-hoy"]',
    nombre: "Productos · el historial de una prenda ▸ Costo (Hoy: N prendas, errores arreglados)",
    async preparar(pagina) {
      await pagina.locator('[data-guia="productos.buscador"] input').first().fill("Pantalón Carla");
      await esperar(pagina, 1800);
      await pagina.locator(".card-cayla button").first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
      await pagina.locator("[data-ir-historial]").click({ timeout: 8000 });
      await esperar(pagina, 2500);
      await pagina.locator('[data-guia="historial-prenda.costo"]').click({ timeout: 8000 });
      await esperar(pagina, 1500);
    },
  },
  {
    id: "productos.historial-costo-corregir",
    ruta: "/productos",
    cuentas: ["admin"],
    abre: '[data-guia="historial-prenda.corregir-costo"]',
    nombre: "Productos · la hoja «Corregir el costo» de la última compra",
    async preparar(pagina) {
      await pagina.locator('[data-guia="productos.buscador"] input').first().fill("Pantalón Carla");
      await esperar(pagina, 1800);
      await pagina.locator(".card-cayla button").first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
      await pagina.locator("[data-ir-historial]").click({ timeout: 8000 });
      await esperar(pagina, 2500);
      await pagina.locator('[data-guia="historial-prenda.costo"]').click({ timeout: 8000 });
      await esperar(pagina, 1200);
      await pagina.locator('[data-guia="historial-prenda.costo-corregir"]').click({ timeout: 8000 });
      await esperar(pagina, 1500);
    },
  },
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
  {
    // «Dónde» (Felipe 2026-10-12): la matriz contada solo en el piso. La prenda del seed con piso, almacén y una dañada en Lima; `abre`
    // exige la matriz redibujada, no solo la ventana (sin piso ni almacén no hay «Dónde» y el escenario no pasa en verde).
    id: "productos.vista-rapida-piso",
    ruta: "/productos?q=Pantal%C3%B3n%20Carla",
    cuentas: CATALOGO,
    abre: '[role=dialog] .vr-grid[data-donde="piso"]',
    nombre: "Productos · la vista rápida contando solo lo del piso",
    async preparar(pagina) {
      await pagina.locator(".card-cayla button").first().click({ timeout: 8000 });
      await esperar(pagina, 1500);
      await pagina.locator('.vr-donde [role="radio"]', { hasText: "Piso" }).click({ timeout: 8000 });
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
  // ADR-0371 · «Por revisar»: las dos hojas (Aprobar, y Rechazar con y sin bloqueo). La del rechazo sin bloqueo necesita una prenda sin stock ni
  // orden en proceso; si no hay ninguna en la base local, abre la bloqueada (también es una hoja que auditar) y `abre` sigue exigiendo la ventana.
  { id: "por-revisar.aprobar", ruta: "/productos/por-revisar", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Por revisar · la hoja «Aprobar»", async preparar(pagina) { await pagina.getByRole("button", { name: /^Aprobar$/ }).first().click({ timeout: 8000 }); await esperar(pagina, 1300); } },
  { id: "por-revisar.rechazar-bloqueado", ruta: "/productos/por-revisar", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Por revisar · «Rechazar» con stock o una orden en proceso (la hoja que explica qué lo frena)", async preparar(pagina) { const fila = pagina.locator("ul[data-resultados] > li").filter({ hasText: /en stock|en proceso/ }).first(); await fila.getByRole("button", { name: /^Rechazar$/ }).click({ timeout: 8000 }); await esperar(pagina, 1300); } },
  { id: "por-revisar.rechazar", ruta: "/productos/por-revisar", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Por revisar · «Rechazar» de una prenda sin nada colgado (la advertencia de que es permanente)", async preparar(pagina) { const limpias = pagina.locator("ul[data-resultados] > li").filter({ hasNotText: /en stock|en proceso/ }); const fila = (await limpias.count()) > 0 ? limpias.first() : pagina.locator("ul[data-resultados] > li").first(); await fila.getByRole("button", { name: /^Rechazar$/ }).click({ timeout: 8000 }); await esperar(pagina, 1300); } },
  { id: "nuevo.familia", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 1: las categorías de una familia", preparar: nuevoHasta("familia") },
  { id: "nuevo.como-es", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 2: cómo es (marca, nombre, tejido, patrón)", preparar: nuevoHasta("como-es") },
  { id: "nuevo.tallas", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 3: tallas y colores", preparar: nuevoHasta("tallas") },
  {
    // El pie de la carta con un color señalado (ADR-0316; Felipe 2026-10-10): su nombre, Pantone y, debajo, «Combina bien con» con los
    // círculos de sus compañeros y la primera frase de la ficha. Un escenario sin color señalado auditaría el pie vacío.
    id: "nuevo.tallas-color",
    ruta: "/productos/nuevo",
    cuentas: CATALOGO,
    nombre: "Nuevo producto · paso 3 con un color señalado en la carta (su ficha al pie)",
    async preparar(pagina) {
      await nuevoHasta("tallas")(pagina);
      await pagina.getByRole("button", { name: /^Beige$/ }).first().hover({ timeout: 8000 });
      await esperar(pagina, 700);
    },
  },
  { id: "nuevo.precio", ruta: "/productos/nuevo", cuentas: CATALOGO, nombre: "Nuevo producto · paso 4: precio y unidades", preparar: nuevoHasta("precio") },
  { id: "producto.editar", ruta: "/productos/[id]/editar", cuentas: ["admin", "terminal-administrativa"], abre: "text=VES-0001", nombre: "Editar producto · la ficha de una prenda", preparar: productoPorCodigo("VES-0001", "editar") },
  { id: "producto.historial", ruta: "/productos/[id]/historial", cuentas: ["admin"], abre: "h1", nombre: "Historial de una prenda", preparar: productoPorCodigo("VES-0001", "historial") },
  { id: "categorias.agregar", ruta: "/productos/categorias", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Categorías · «Agregar categoría»", preparar: clicRol("button", /Agregar categoría/i) },
  { id: "categorias.fila", ruta: "/productos/categorias", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Categorías · el detalle de una categoría", preparar: clicRol("button", /Blazers/i) },
  // Los sellos salieron de Atributos el 2026-10-22 (hoy Catálogo ▸ Insignias, la billetera de pases): sus hojas se abren desde ahí.
  { id: "sellos.agregar", ruta: "/productos/insignias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Insignias · «Nueva campaña»", preparar: clicRol("button", /Nueva campaña/i) },
  { id: "sellos.prendas", ruta: "/productos/insignias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Insignias · las prendas del pase abierto", preparar: clicRol("button", /^Prendas$/i) },
  { id: "sellos.campana", ruta: "/productos/insignias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Insignias · «Configurar» el pase abierto", preparar: clicRol("button", /^(Configurar|Repetir)$/i) },
  // «Configurar» es la hoja de ofertas de la campaña (ADR-0496: «Tres preguntas»), con la etiqueta de la campaña a la derecha (ADR-0488).
  // Cada etapa es un estado que no se ve al cargar: la rebaja elegida (etiqueta con su descuento), el cuándo y, al final, las categorías
  // marcadas en la grilla con sus casillas y su mosaico.
  {
    id: "sellos.oferta.rebaja",
    ruta: "/productos/insignias",
    cuentas: ["admin"],
    abre: "[role=dialog] .eqp-pct",
    nombre: "Insignias · «Configurar» con «Una rebaja» elegida (la etiqueta con su descuento)",
    preparar: secuencia(clicRol("button", /^(Configurar|Repetir)$/i), clicRol("button", /Una rebaja/i), clicRol("button", /^50 %$/)),
  },
  {
    id: "sellos.oferta.cuando",
    ruta: "/productos/insignias",
    cuentas: ["admin"],
    abre: "[role=dialog] [data-guia='sellos.oferta-dias'] .of-dia",
    nombre: "Insignias · «Configurar» · ¿Cuándo y dónde? (fechas, días de la semana y tiendas)",
    preparar: secuencia(clicRol("button", /^(Configurar|Repetir)$/i), clicRol("button", /Una rebaja/i), clicRol("button", /^Siguiente/), clicRol("button", /^Solo algunos días$/i)),
  },
  {
    id: "sellos.campana.llena",
    ruta: "/productos/insignias",
    cuentas: ["admin"],
    abre: "[role=dialog] .cph-cat[data-elegida]",
    nombre: "Insignias · «Configurar» · prendas con categorías marcadas (la grilla y el mosaico)",
    preparar: secuencia(
      clicRol("button", /^(Configurar|Repetir)$/i),
      clicRol("button", /Una rebaja/i),
      clicRol("button", /^Siguiente/),
      clicRol("button", /^Tienda Lima$/),
      clicRol("button", /^Siguiente/),
      clicRol("checkbox", /^Camisas y Blusas,/),
      clicRol("checkbox", /^Casacas,/),
    ),
  },
  { id: "marcas.nueva", ruta: "/productos/marcas", cuentas: CATALOGO, abre: "button:has-text('Registrar')", nombre: "Marcas · «Nueva marca» (el formulario se abre en la página)", preparar: clicRol("button", /Nueva marca/i) },
  { id: "marcas.editar", ruta: "/productos/marcas", cuentas: CATALOGO, abre: "[role=dialog]", nombre: "Marcas · «Editar» una marca", preparar: clicRol("button", /^Editar/i) },
  // ADR-0373: los estados que no se ven al cargar. El resumen cerrado es lo de siempre; abierto trae las cuatro tarjetas de cifra.
  { id: "marcas.resumen", ruta: "/productos/marcas", cuentas: CATALOGO, abre: "#resumen-marcas[data-abierto]", nombre: "Marcas · «Resumen» abierto (las cuatro cifras)", preparar: clicRol("button", /^Resumen/i) },
  { id: "marcas.menu-mas", ruta: "/productos/marcas", cuentas: CATALOGO, abre: "[role=menu]", nombre: "Marcas · el menú «Más» (Desactivar y Eliminar, con su motivo si no se puede)", preparar: clicRol("button", /Más acciones/i) },
  {
    id: "marcas.sombra",
    ruta: "/productos/marcas",
    cuentas: CATALOGO,
    abre: ".buscador-sombra",
    nombre: "Marcas · el buscador con la sombra que completa la marca",
    async preparar(pagina) {
      // Una marca que el seed trae (CAYLA): con «cay» la sombra completa «la». Hace falta el cursor adentro (la sombra solo se ve así).
      await pagina.getByPlaceholder(/Busca una marca/i).first().fill("cay");
      await esperar(pagina, 700);
    },
  },
  {
    id: "marcas.parecidas",
    ruta: "/productos/marcas",
    cuentas: CATALOGO,
    abre: ".aviso-linea",
    nombre: "Marcas · una errata de una letra muestra las parecidas con su aviso",
    async preparar(pagina) {
      await pagina.getByPlaceholder(/Busca una marca/i).first().fill("cayka");
      await esperar(pagina, 800);
    },
  },
  { id: "familias.agregar", ruta: "/productos/familias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Familias · «Agregar familia»", preparar: clicRol("button", /Agregar familia/i) },
  { id: "familias.editar", ruta: "/productos/familias", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Familias · «Editar» una familia", preparar: clicRol("button", /^Editar/i) },
);

// ---------- Inventario I: Existencias, Movimientos, Traslados y Recibir (actividad 9) ----------
const INVENTARIO = ["admin", "integrante", "terminal-administrativa"];
const verDetalle = (nombre) => async (pagina) => {
  await pagina.getByRole("button", { name: nombre }).first().evaluate((el) => el.click());
  await esperar(pagina, 1500);
};
// «Para hoy» ya no va en la pantalla (ADR-0344, 2026-10-06): sus tareas —«Decidir» sobre las dañadas— y «Resumen por categoría» viven en la
// ventana «Pendientes de hoy». En una tienda se abre con el anillo del día, al costado de «Filtros», cuyo nombre accesible empieza por «Hoy…»
// («Hoy: 3 de 8 tallas…», «Hoy está todo al día», «Hoy no hay tallas…»); en el Taller, con el botón «Pendientes».
const abrirPendientes = clicRol("button", /^Hoy(:| está| no hay)|^Pendientes/);
// Los tipos de Movimientos son ENLACES dentro de su `<nav>` (ADR-0353), no botones: filtrar cambia la URL. Un tipo en cero no es enlace.
const tipoDeMovimiento = (nombre) => async (pagina) => {
  await pagina.getByRole("navigation", { name: "Tipo de movimiento" }).getByRole("link", { name: nombre }).first().click({ timeout: 8000 });
  await esperar(pagina, 1800);
};
ESCENARIOS.push(
  { id: "existencias.filtros", ruta: "/inventario", cuentas: INVENTARIO, nombre: "Existencias · el panel «Filtros»", preparar: clicRol("button", /^Filtros/i) },
  { id: "existencias.detalle", ruta: "/inventario", cuentas: INVENTARIO, nombre: "Existencias · «Ver detalle» (cada talla con su piso y su almacén)", abre: "[data-guia='existencias.tabla'] [role=button]", preparar: secuencia(clicRol("button", /^Filtros/i), clicRol("button", /^Tabla$/)) },
  { id: "existencias.danadas", ruta: "/inventario", cuentas: INVENTARIO, nombre: "Existencias · el filtro «Dañadas»", preparar: clicRol("button", /^Dañadas/i) },
  { id: "existencias.ordenar", ruta: "/inventario", cuentas: ["admin"], abre: "text=Nombre (A–Z)", nombre: "Existencias · «Ordenar por»", preparar: clicRol("button", /^Ordenar por/i) },
  // La tarjeta compacta (2026-10-07): «Colgar en el piso» del pie abre la tabla de Colgar varias; «Más ⌄» es un menú; la tarjeta abre el
  // cajón y «Todas» es la tabla de celdas piso/almacén.
  { id: "existencias.acciones", ruta: "/inventario", cuentas: INVENTARIO, abre: "[role=dialog] table", nombre: "Existencias · «Colgar en el piso» (la tabla de Colgar varias)", preparar: clicRol("button", /^Colgar en el piso/i) },
  { id: "existencias.mas", ruta: "/inventario", cuentas: INVENTARIO, abre: "[role=menu]", nombre: "Existencias · el menú «Más» de una tarjeta", preparar: clicRol("button", /^Más acciones de/i) },
  // El detalle de la prenda es un modal desde el 2026-10-12 (ADR-0391): la foto grande, la fila de la prenda, «Dónde está» y «Qué hago».
  { id: "existencias.modal", ruta: "/inventario", cuentas: INVENTARIO, abre: "[role=dialog] [data-guia='existencias.cajon-donde']", nombre: "Existencias · el modal de la prenda («Esta talla»)", preparar: async (pagina) => { await pagina.locator("article.card-cayla").first().click({ position: { x: 12, y: 12 }, timeout: 8000 }); await esperar(pagina, 1100); } },
  { id: "existencias.todas", ruta: "/inventario", cuentas: INVENTARIO, abre: "[role=dialog] table", nombre: "Existencias · el modal en «Todas» (colgadas y guardadas por talla, con totales)", preparar: secuencia(async (pagina) => { await pagina.locator("article.card-cayla").first().click({ position: { x: 12, y: 12 }, timeout: 8000 }); await esperar(pagina, 1100); }, clicRol("tab", /^Todas$/)) },
  { id: "existencias.todas.capa", ruta: "/inventario", cuentas: INVENTARIO, abre: "[role=dialog] button[aria-pressed=true]:has-text('En piso')", nombre: "Existencias · «Todas» con el filtro «En piso» puesto", preparar: secuencia(async (pagina) => { await pagina.locator("article.card-cayla").first().click({ position: { x: 12, y: 12 }, timeout: 8000 }); await esperar(pagina, 1100); }, clicRol("tab", /^Todas$/), clicRol("button", /^\d+\s*En piso$/i)) },
  { id: "existencias.pendientes", ruta: "/inventario", cuentas: INVENTARIO, abre: "[role=dialog]:has-text('Pendientes de hoy')", nombre: "Existencias · la ventana «Pendientes de hoy»", preparar: abrirPendientes },
  { id: "existencias.resumen", ruta: "/inventario", cuentas: ["admin"], abre: "[role=dialog]:has-text('Resumen del stock')", nombre: "Existencias · «Resumen por categoría»", preparar: secuencia(abrirPendientes, clicRol("button", /^Resumen por categoría/i)) },
  // Necesita una prenda dañada sin resolver en la sede (en la base local, una en Tienda Lima): sin ella, «Pendientes» no trae «Decidir».
  { id: "existencias.decidir", ruta: "/inventario", cuentas: ["admin"], ancho: "escritorio", abre: "[role=dialog]:has-text('Prendas dañadas')", nombre: "Existencias · «Decidir» sobre una prenda dañada", preparar: secuencia(abrirPendientes, clicRol("button", /^Decidir/i)) },
  { id: "movimientos.detalle", ruta: "/inventario/movimientos", cuentas: INVENTARIO, abre: "[role=dialog]", nombre: "Movimientos · el detalle de un movimiento", preparar: verDetalle(/^Ver el detalle: Salida/) },
  { id: "movimientos.grupo", ruta: "/inventario/movimientos", cuentas: INVENTARIO, abre: "[role=dialog]", nombre: "Movimientos · el detalle de un movimiento con varias prendas", preparar: verDetalle(/^Ver el detalle: las 3 prendas/) },
  { id: "movimientos.ajustes", ruta: "/inventario/movimientos", cuentas: ["admin"], ancho: "escritorio", abre: "nav[aria-label='Tipo de movimiento'] a[aria-current=true]", nombre: "Movimientos · el filtro «Ajustes y conteos»", preparar: tipoDeMovimiento(/^Ajustes/i) },
  { id: "movimientos.calendario", ruta: "/inventario/movimientos", cuentas: ["admin"], ancho: "escritorio", abre: "[role=gridcell]", nombre: "Movimientos · «Personalizado» con el calendario abierto", preparar: secuencia(clicRol("button", /Personalizado/i), clicRol("button", /Abrir calendario/i)) },
  { id: "traslados.pedir", ruta: "/inventario/traslados", cuentas: INVENTARIO, abre: "[role=dialog]", nombre: "Traslados · «Pedir a otra sede»", preparar: clicRol("button", /Pedir a otra sede/i) },
  // ADR-0355: la billetera de pases. Las pestañas, el reverso (el pase girado) y un pedido como pase.
  { id: "traslados.envias", ruta: "/inventario/traslados", cuentas: INVENTARIO, abre: "[role=tab][aria-selected=true]", nombre: "Traslados · la pestaña «Envías»", preparar: clicRol("tab", /^Envías/i) },
  { id: "traslados.terminadas", ruta: "/inventario/traslados", cuentas: INVENTARIO, abre: "[role=tab][aria-selected=true]", nombre: "Traslados · la pestaña «Terminadas» (sellos)", preparar: clicRol("tab", /^Terminadas/i) },
  {
    id: "traslados.reverso",
    ruta: "/inventario/traslados",
    cuentas: ["admin"],
    // En celular la raíz muestra solo la billetera (el pase se abre al tocarlo): el giro se mira en «traslados.contar».
    ancho: "escritorio",
    abre: ".tp-pase3d[data-vuelta]",
    nombre: "Traslados · el pase girado (su reverso)",
    async preparar(pagina) {
      await pagina.locator(".tp-boton").first().click();
      await esperar(pagina, 1200);
    },
  },
  {
    id: "traslados.contar",
    ruta: "/inventario/traslados/[id]",
    cuentas: ["admin"],
    abre: ".tp-contador",
    nombre: "Traslados · contar a ciegas en el reverso",
    async preparar(pagina) {
      const id = consultarLocal(
        "select t.id from retail.transferencias t join retail.ubicaciones u on u.id = t.ubicacion_destino_id where t.estado = 'en_transito' and u.nombre ilike '%lima%' order by t.numero desc limit 1",
      );
      await irA(`/inventario/traslados/${id}`)(pagina);
      await pagina.locator(".tp-boton").first().click();
      await esperar(pagina, 1200);
    },
  },
  {
    id: "traslados.pedido",
    ruta: "/inventario/traslados",
    cuentas: ["admin"],
    abre: ".tp-banda-num",
    nombre: "Traslados · un pedido entre sedes como pase",
    async preparar(pagina) {
      for (const pestana of [/^Envías/i, /^Te llegan/i, /^Terminadas/i]) {
        await clicRol("tab", pestana)(pagina);
        const pedido = pagina.locator(".tp-mini", { hasText: "Pedido" }).first();
        if (await pedido.count()) {
          // Los pases van apilados (cada uno tapa el centro del de arriba): se toca su banda, que es lo que se ve.
          await pedido.click({ position: { x: 40, y: 20 } });
          await esperar(pagina, 1500);
          return;
        }
      }
    },
  },
  { id: "traslados.sede", ruta: "/inventario/traslados/nuevo", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Nuevo traslado · la lista «Hacia»", preparar: clicRol("combobox", /Hacia|Elige a qué sede/i) },
  { id: "traslados.prenda", ruta: "/inventario/traslados/nuevo", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Nuevo traslado · la lista de prendas", preparar: clicRol("combobox", /Elige la prenda|Prenda/i) },
  {
    id: "traslados.detalle",
    ruta: "/inventario/traslados/[id]",
    cuentas: ["admin"],
    abre: ".tp-pase",
    nombre: "Traslados · el pase de un traslado",
    preparar: async (pagina) => irA(`/inventario/traslados/${consultarLocal("select id from retail.transferencias order by 1 limit 1")}`)(pagina),
  },
  // La guía impresa (ADR-0242 D-3): es papel (`.papel-fijo`), así que en oscuro el papel sigue claro y lo que se mide es lo de alrededor.
  {
    id: "traslados.guia",
    ruta: "/inventario/traslados/guia/[id]",
    cuentas: ["admin"],
    abre: ".guia-traslado[data-formato=termica] .gt-qr svg",
    nombre: "Traslados · la guía de una caja (térmica)",
    preparar: async (pagina) =>
      irA(`/inventario/traslados/guia/${consultarLocal("select id from retail.transferencias where estado = 'en_transito' order by numero desc limit 1")}`)(pagina),
  },
  {
    id: "traslados.guia-a4",
    ruta: "/inventario/traslados/guia/[id]",
    cuentas: ["admin"],
    abre: ".guia-traslado[data-formato=a4] .gt-qr svg",
    nombre: "Traslados · la guía de una caja (hoja A4)",
    async preparar(pagina) {
      await irA(`/inventario/traslados/guia/${consultarLocal("select id from retail.transferencias where estado = 'en_transito' order by numero desc limit 1")}`)(pagina);
      await clicRol("button", /^Hoja A4$/)(pagina);
      await esperar(pagina, 400);
    },
  },
  {
    // El QR «va en la caja» del frente: solo lo ve quien envía (Micaela, en Trujillo), mientras la caja viaja.
    id: "traslados.qr-del-pase",
    ruta: "/inventario/traslados/[id]",
    cuentas: ["integrante"],
    abre: ".tp-qr svg",
    nombre: "Traslados · el QR de la guía en el pase que sale",
    preparar: async (pagina) =>
      irA(
        `/inventario/traslados/${consultarLocal(
          "select t.id from retail.transferencias t join retail.ubicaciones u on u.id = t.ubicacion_origen_id where t.estado = 'en_transito' and u.nombre ilike '%trujillo%' order by t.numero desc limit 1",
        )}`,
      )(pagina),
  },
  // «¿De quién es?» es la lista de «Llegó mercadería» (fase 4) y la de «¿Llegó algo sin aviso?» (ADR-0393), según lo que tenga la base.
  { id: "recibir.proveedor", ruta: "/recibir", cuentas: INVENTARIO, abre: "[role=listbox]", nombre: "Recibir · la lista de proveedores", preparar: clicRol("combobox", /Proveedor|De quién es/i) },
  {
    id: "recibir.prenda",
    ruta: "/recibir",
    cuentas: INVENTARIO,
    nombre: "Recibir · una prenda buscada (con ADR-0393: un proveedor elegido en «¿Llegó algo sin aviso?»)",
    async preparar(pagina) {
      const buscador = pagina.getByPlaceholder(/Escanea o busca la prenda/i).first();
      if (await buscador.count()) {
        await buscador.fill("Vestido");
        await esperar(pagina, 1800);
        return;
      }
      // Con ADR-0393 la puerta no busca prendas (se cuentan en el envío): lo que cambia de cara es el proveedor elegido (y su factura).
      await pagina.getByRole("combobox", { name: /De quién es/i }).first().click({ timeout: 8000 });
      await esperar(pagina, 600);
      await pagina.getByRole("option").first().click({ timeout: 8000 });
      await esperar(pagina, 900);
    },
  },
);

// ---------- Inventario II: Conteo, Bajar al piso, Cuadrar, Frescura, Por regularizar y Análisis (actividad 10) ----------
const CONTEO_ID = () => consultarLocal("select id from retail.conteos where estado = 'cerrado' order by created_at limit 1");
const llenar = (placeholder, texto) => async (pagina) => {
  await pagina.getByPlaceholder(placeholder).first().fill(texto);
  await esperar(pagina, 1800);
};
ESCENARIOS.push(
  { id: "conteo.piso", ruta: "/inventario/conteo", cuentas: INVENTARIO, nombre: "Conteo · el piso de venta elegido", preparar: clicRol("radio", /Piso de venta/i) },
  { id: "conteo.categoria", ruta: "/inventario/conteo", cuentas: INVENTARIO, nombre: "Conteo · «Una categoría» (las categorías a elegir)", preparar: clicRol("radio", /Una categoría/i) },
  { id: "conteo.prenda", ruta: "/inventario/conteo", cuentas: INVENTARIO, nombre: "Conteo · «Por prenda»", preparar: clicRol("radio", /Por prenda/i) },
  { id: "conteo.detalle", ruta: "/inventario/conteo/[id]", cuentas: ["admin"], abre: "h1", nombre: "Conteo · un conteo cerrado", preparar: async (pagina) => irA(`/inventario/conteo/${CONTEO_ID()}`)(pagina) },
  { id: "conteo.revisar", ruta: "/inventario/conteo/[id]/revisar", cuentas: ["admin"], nombre: "Conteo · la revisión de un conteo", preparar: async (pagina) => irA(`/inventario/conteo/${CONTEO_ID()}/revisar`)(pagina) },
  { id: "bajar.buscar", ruta: "/inventario/bajar", cuentas: INVENTARIO, nombre: "Bajar al piso · una prenda buscada", preparar: llenar(/Escanea o escribe el nombre/i, "Vestido") },
  { id: "bajar.camara", ruta: "/inventario/bajar", cuentas: INVENTARIO, ancho: "celular", abre: "[role=dialog]", nombre: "Bajar al piso (celular) · la cámara", preparar: clicRol("button", /Escanear con la cámara/i) },
  { id: "cuadrar.buscar", ruta: "/inventario/cuadrar", cuentas: INVENTARIO, nombre: "Cuadrar el piso · una prenda buscada", preparar: llenar(/Escanea o escribe el código/i, "Vestido") },
  { id: "cuadrar.guardado", ruta: "/inventario/cuadrar", cuentas: INVENTARIO, nombre: "Cuadrar el piso · «Lo guardado»", preparar: clicRol("button", /Lo guardado/i) },
  { id: "cuadrar.camara", ruta: "/inventario/cuadrar", cuentas: INVENTARIO, ancho: "celular", abre: "[role=dialog]", nombre: "Cuadrar el piso (celular) · la cámara", preparar: clicRol("button", /Escanear con la cámara/i) },
  { id: "frescura.categoria", ruta: "/gestion/frescura", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Frescura · la lista «Categoría»", preparar: clicRol("button", /^Categoría/i) },
  { id: "frescura.estado", ruta: "/gestion/frescura", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Frescura · la lista «Estado» (sus tres apartados)", preparar: clicRol("button", /^Estado/i) },
  // ADR-0208 (act. 2026-10-07): el tablero por categoría; una fila tocada queda «elegida» (arena) y filtra la lista.
  { id: "frescura.tablero", ruta: "/gestion/frescura", cuentas: ["admin"], abre: "[aria-pressed=true]", nombre: "Frescura · una categoría del tablero elegida", preparar: clicRol("button", /^Camisas y Blusas/i) },
  // ADR-0208 (Formidable 2026-10-10 (c)): el «¿Por qué?» de «Aún no se sabe», con su lista flotando sobre la tarjeta de la tienda.
  {
    id: "frescura.porque-no-se-sabe",
    ruta: "/gestion/frescura",
    cuentas: ["admin"],
    abre: 'section[aria-labelledby="frescura-piso-titulo"] [aria-expanded="true"]',
    nombre: "Frescura · el porqué de «Aún no se sabe»",
    preparar: async (pagina) => {
      await pagina.locator('section[aria-labelledby="frescura-piso-titulo"] button', { hasText: "¿Por qué?" }).first().click({ timeout: 8000 });
      await esperar(pagina, 600);
    },
  },
  { id: "regularizar.vendio", ruta: "/inventario/por-regularizar", cuentas: INVENTARIO, abre: "[role=listbox]", nombre: "Por regularizar · la lista «Quién vendió»", preparar: clicRol("combobox", /Quién vendió/i) },
  { id: "regularizar.todas", ruta: "/inventario/por-regularizar", cuentas: INVENTARIO, nombre: "Por regularizar · «Todas»", preparar: clicRol("button", /^Todas/i) },
  // ADR-0360: la mesa «Puente». Con una prenda y «cómo estaba» elegidos se ven el puente entero, la balanza, la guía y los hilos; en el
  // celular la misma elección vive en una hoja. Sin ventas pendientes en la base local no hay talón que tocar: el escenario falla en vez de pasar en falso.
  {
    id: "regularizar.puente",
    ruta: "/inventario/por-regularizar",
    cuentas: INVENTARIO,
    ancho: "escritorio",
    abre: "[data-vsr-puente]",
    nombre: "Por regularizar · el puente con una prenda y «cómo estaba» elegidos",
    async preparar(pagina) {
      await pagina.locator(".vsr-ct").first().click();
      await esperar(pagina, 1400);
      await pagina.locator(".vsr-forma").first().click();
      await esperar(pagina, 800);
    },
  },
  {
    id: "regularizar.hoja",
    ruta: "/inventario/por-regularizar",
    cuentas: INVENTARIO,
    ancho: "celular",
    abre: "[role=dialog]",
    nombre: "Por regularizar (celular) · la hoja con las prendas y el puente",
    async preparar(pagina) {
      await pagina.locator(".vsr-talon").first().click();
      await esperar(pagina, 1000);
      await pagina.locator(".vsr-ct").first().click();
      await esperar(pagina, 1000);
    },
  },
  { id: "analisis.acaba", ruta: "/gestion/analisis", cuentas: ["admin"], nombre: "Análisis · «Se está acabando»", preparar: clicRol("tab", /Se está acabando/i) },
  { id: "analisis.nose", ruta: "/gestion/analisis", cuentas: ["admin"], nombre: "Análisis · «No se vende»", preparar: clicRol("tab", /No se vende/i) },
  { id: "analisis.pedir", ruta: "/gestion/analisis", cuentas: ["admin"], nombre: "Análisis · «Qué pedir»", preparar: clicRol("tab", /Qué pedir/i) },
  { id: "analisis.confianza", ruta: "/gestion/analisis", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Análisis · la hoja «Datos incompletos / confiables»", preparar: clicRol("button", /Datos (incompletos|confiables)/i) },
  // «Ver qué falta» (ADR-0357, decisión 2, act. 2026-10-06): mientras la tienda no cumple, la pantalla abre con los datos de hoy y su
  // aviso fijo (lo mide la visita de la ruta); este botón del aviso lleva a «Todavía no», con su propio aviso arriba. Con
  // ANALISIS_SIN_CANDADO=1 en local la pantalla ya recomienda y no hay aviso ni botón.
  { id: "analisis.que-falta", ruta: "/gestion/analisis", cuentas: ["admin"], abre: ".todavia", nombre: "Análisis · «Ver qué falta» («Todavía no»), con su aviso", preparar: clicRol("button", /Ver qué falta/i) },
  // La ficha de una prenda: se abre desde la primera prenda que haya a la vista (las listas de Hoy; si no traen nada, el ranking de
  // «Qué pedir»). Sin ventas con su prenda en la tienda no hay de dónde abrirla.
  {
    id: "analisis.ficha", ruta: "/gestion/analisis", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Análisis · la ficha de una prenda",
    preparar: async (pagina) => {
      const enHoy = pagina.locator(".analisis .top-f, .analisis .l5");
      if ((await enHoy.count()) > 0) await enHoy.first().click({ timeout: 8000 });
      else {
        // Con pocas ventas, Hoy no trae listas: «Qué pedir» siempre tiene su ranking si algo se vendió con su prenda.
        await pagina.getByRole("tab", { name: /Qué pedir/i }).first().click({ timeout: 8000 });
        await esperar(pagina, 1100);
        await pagina.locator(".analisis .rank-f").first().click({ timeout: 8000 });
      }
      await esperar(pagina, 1500);
    },
  },
);

// ---------- Compras y Producción (actividad 11) ----------
const COMPRAS = ["admin", "admin-taller"];
const idDeCompra = () => consultarLocal("select id from retail.compras order by created_at limit 1");
const idDeProveedor = () => consultarLocal("select id from retail.proveedores where nombre ilike '%Textiles Andina%' limit 1");
ESCENARIOS.push(
  { id: "compras.filtros", ruta: "/compras", cuentas: COMPRAS, nombre: "Historial de compras · el panel «Filtros»", preparar: clicRol("button", /^Filtros/i) },
  { id: "porpagar.pagar", ruta: "/compras/por-pagar", cuentas: COMPRAS, abre: "[role=dialog]", nombre: "Por pagar · «Pagar» un comprobante", preparar: clicRol("button", /^Pagar$/i) },
  {
    id: "porpagar.juntos",
    ruta: "/compras/por-pagar",
    cuentas: COMPRAS,
    nombre: "Por pagar · comprobantes marcados («Pagar juntos»)",
    async preparar(pagina) {
      await pagina.getByRole("checkbox", { name: /^Elegir F001/ }).first().evaluate((el) => el.click());
      await esperar(pagina, 1200);
    },
  },
  { id: "porpagar.proveedor", ruta: "/compras/por-pagar", cuentas: COMPRAS, nombre: "Por pagar · agrupado «Por proveedor»", preparar: clicRol("radio", /Por proveedor/i) },
  { id: "porpagar.filtros", ruta: "/compras/por-pagar", cuentas: COMPRAS, nombre: "Por pagar · el panel «Filtros»", preparar: clicRol("button", /^Filtros/i) },
  { id: "porpagar.vencidas", ruta: "/compras/por-pagar", cuentas: COMPRAS, ancho: "escritorio", nombre: "Por pagar · «Solo vencidas»", preparar: clicRol("button", /Solo vencidas/i) },
  { id: "proveedores.registrar", ruta: "/compras/proveedores", cuentas: COMPRAS, abre: "[role=dialog]", nombre: "Proveedores · «Registrar proveedor»", preparar: clicRol("button", /Registrar proveedor/i) },
  { id: "proveedores.vista", ruta: "/compras/proveedores", cuentas: COMPRAS, abre: "[role=dialog]", nombre: "Proveedores · la vista rápida de un proveedor", preparar: clicRol("button", /Textiles Andina SAC: abrir vista rápida/i) },
  { id: "proveedores.sin-datos", ruta: "/compras/proveedores", cuentas: COMPRAS, nombre: "Proveedores · el filtro «Sin datos de pago»", preparar: clicRol("button", /Sin datos de pago/i) },
  // El ranking (ADR-0521): marcar dos casillas cambia la columna derecha a «Comparar» (y, bajo 1280 px, saca la isla de abajo).
  { id: "proveedores.comparar", ruta: "/compras/proveedores", cuentas: COMPRAS, abre: "#proveedores-comparacion", nombre: "Proveedores · comparar dos proveedores del ranking", preparar: secuencia(clicRol("checkbox", /Comparar Textiles Andina/i), clicRol("checkbox", /Comparar Confecciones del Sur/i)) },
  { id: "proveedores.ficha", ruta: "/compras/proveedores/[id]", cuentas: ["admin"], abre: "h1", nombre: "Proveedores · la ficha de un proveedor", preparar: async (pagina) => irA(`/compras/proveedores/${idDeProveedor()}`)(pagina) },
  { id: "factura.detalle", ruta: "/compras/factura/[compraId]", cuentas: ["admin"], abre: "h1", nombre: "Factura de proveedor · el comprobante", preparar: async (pagina) => irA(`/compras/factura/${idDeCompra()}`)(pagina) },
  { id: "parte.detalle", ruta: "/compras/parte/[compraId]", cuentas: ["admin"], abre: "h1", nombre: "Parte de recepción · el documento", preparar: async (pagina) => irA(`/compras/parte/${idDeCompra()}`)(pagina) },
  { id: "produccion.orden-nueva", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: "[data-compositor-orden]", nombre: "Producción · «Nueva orden» sobre la lista", preparar: clicRol("button", /Nueva orden/i) },
  // ADR-0396, A2: la tabla única de cantidades de «Nueva orden». `abre` exige la raíz de la tabla con teclado (`data-matriz-mover`), no solo la hoja: sin modelos elegidos el escenario no pasa en verde sin haberla abierto.
  { id: "produccion.orden-nueva-tabla", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: "[data-matriz-mover]", nombre: "Producción · «Nueva orden» con un modelo que existe: la tabla de cantidades", preparar: secuencia(clicRol("button", /Nueva orden/i), async (pagina) => { await pagina.locator('[data-guia="prod-orden-nueva.modelo-fila"]').first().click({ timeout: 8000 }); await esperar(pagina, 1000); }) },
  // ADR-0396, A3: la ficha viva a la derecha de la hoja ancha (con un modelo ya elegido, para que no sea la ficha vacía).
  { id: "produccion.orden-nueva-ficha", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: 'aside[aria-label="La orden, tal como va a quedar"]', nombre: "Producción · «Nueva orden»: la ficha viva de la orden con un modelo elegido", preparar: secuencia(clicRol("button", /Nueva orden/i), async (pagina) => { await pagina.locator('[data-guia="prod-orden-nueva.modelo-fila"]').first().click({ timeout: 8000 }); await esperar(pagina, 1000); }) },
  { id: "produccion.orden-nueva-color", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: '[data-guia="prod-orden-nueva.matriz"] [role="combobox"]', nombre: "Producción · «Nueva orden» con un modelo nuevo: «+ Agregar color» abierto sobre la tabla", preparar: secuencia(clicRol("button", /Nueva orden/i), clicRol("button", /Crear un modelo nuevo/i), async (pagina) => { await pagina.getByRole("combobox", { name: /^Categoría/ }).first().click({ timeout: 8000 }); await esperar(pagina, 600); await pagina.getByRole("option").first().click({ timeout: 8000 }); await esperar(pagina, 800); }, clicRol("button", /Agregar color/i)) },
  // ADR-0509, A5: el borrador de «Nueva orden». Se escribe una cantidad (queda en el navegador, nada llega a la base) y se recarga: la lista ofrece lo que quedó a medias, y al elegir ese mismo modelo otra vez el formulario lo ofrece.
  // `abre` exige el aviso mismo: sin borrador el escenario no pasa en verde sin haberlo mostrado.
  { id: "produccion.orden-borrador", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: '[data-guia="prod-ordenes.borrador"]', nombre: "Producción · la lista con «Hay una orden a medias en este computador» (Retomar y Descartar)", preparar: secuencia(clicRol("button", /Nueva orden/i), async (pagina) => { await pagina.locator('[data-guia="prod-orden-nueva.modelo-fila"]').first().click({ timeout: 8000 }); await esperar(pagina, 1000); await pagina.locator('[data-guia="prod-orden-nueva.matriz"] input:not([data-sin-cursor])').first().fill("6"); await esperar(pagina, 600); await pagina.reload({ waitUntil: "domcontentloaded" }); await esperar(pagina, 1500); }) },
  { id: "produccion.orden-oferta", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: '[data-guia="prod-orden-nueva.oferta"]', nombre: "Producción · «Nueva orden» con «Hay una orden a medias de este modelo» (Retomarla y Descartarla)", preparar: secuencia(clicRol("button", /Nueva orden/i), async (pagina) => { await pagina.locator('[data-guia="prod-orden-nueva.modelo-fila"]').first().click({ timeout: 8000 }); await esperar(pagina, 1000); await pagina.locator('[data-guia="prod-orden-nueva.matriz"] input:not([data-sin-cursor])').first().fill("6"); await esperar(pagina, 600); await pagina.reload({ waitUntil: "domcontentloaded" }); await esperar(pagina, 1500); }, clicRol("button", /Nueva orden/i), async (pagina) => { await pagina.locator('[data-guia="prod-orden-nueva.modelo-fila"]').first().click({ timeout: 8000 }); await esperar(pagina, 1000); }) },
  // La hoja «Ver el modelo» del Resumen: se abre tocando la primera fila de «¿Qué producir?» (si la tienda no tiene modelos que producir, no hay fila y el escenario lo dice).
  // /formidable (2026-10-16): «¿Por qué?» de un asunto de tela del Resumen (la cuenta: lo que piden las órdenes, lo que hay y lo que viene en camino, pedido por pedido) y el consejo de la red de Nueva orden abierto. `abre` exige el texto de la cuenta, no solo el botón.
  { id: "produccion.resumen-porque", ruta: "/produccion", cuentas: ["admin-taller"], abre: '[data-guia="prod-resumen.porque"][aria-expanded="true"]', nombre: "Producción · Resumen · la cuenta de la tela abierta bajo «¿Por qué?»", async preparar(pagina) { await pagina.locator('[data-guia="prod-resumen.porque"]').first().click({ timeout: 8000 }); await esperar(pagina, 600); } },
  { id: "produccion.orden-nueva-red", ruta: "/produccion/ordenes", cuentas: ["admin-taller"], abre: '[data-guia="prod-orden-nueva.red-abrir"][aria-expanded="true"]', nombre: "Producción · «Nueva orden» con el consejo de la red abierto («¿Por qué?»: curva, cubrir y motor de demanda)", preparar: secuencia(clicRol("button", /Nueva orden/i), async (pagina) => { await pagina.locator('[data-guia="prod-orden-nueva.modelo-fila"]').first().click({ timeout: 8000 }); await esperar(pagina, 1000); await pagina.locator('[data-guia="prod-orden-nueva.red-abrir"]').first().click({ timeout: 8000 }); await esperar(pagina, 600); }) },
  { id: "produccion.ver-modelo", ruta: "/produccion", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · Resumen · «Ver el modelo» (la hoja de un modelo)", async preparar(pagina) { await pagina.locator("#produce li button").first().click(); await esperar(pagina, 900); } },
  { id: "produccion.insumo-nuevo", ruta: "/produccion/insumos", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · «Nuevo insumo»", preparar: clicRol("button", /Nuevo insumo/i) },
  // La ficha de una tela (ADR-0400, actividad 8e): el capital pedido con un toque y la hoja «Ficha de la tela» (el primer insumo, abierto).
  { id: "produccion.insumo-ingresar", ruta: "/produccion/insumos", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · la hoja «Ingresar insumo» (abre un lote)", preparar: clicRol("button", /Ingresar insumo/i) },
  { id: "produccion.insumos-capital", ruta: "/produccion/insumos", cuentas: ["admin-taller"], abre: '[data-guia="prod-insumos.capital"]', nombre: "Producción · Insumos con el capital pedido con un toque", preparar: clicRol("button", /Ver el capital en insumos/i) },
  { id: "produccion.insumo-ficha", ruta: "/produccion/insumos", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · la hoja «Ficha de la tela» (tejido y color)", preparar: secuencia(async (pagina) => { await pagina.locator('[data-guia="prod-insumos.fila-cabecera"]').first().click({ timeout: 8000 }); await esperar(pagina, 600); }, clicRol("button", /Completar tejido y color|Editar la ficha/i)) },
  { id: "produccion.cotizacion", ruta: "/produccion/cotizaciones-maquila", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · «Nueva cotización» de maquila", preparar: clicRol("button", /Nueva cotización/i) },
  { id: "produccion.factura-nueva", ruta: "/produccion/comprobantes", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · «Nueva factura»", preparar: clicRol("button", /Nueva factura/i) },
  { id: "produccion.proveedor-nuevo", ruta: "/produccion/proveedores", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · «Nuevo proveedor»", preparar: clicRol("button", /Nuevo proveedor/i) },
  // «Servicios y tarifas» (ADR-0400, actividad 8c): la lista de precios de los servicios de afuera, la hoja para cargar una tarifa y la que renueva una vigente («Cambiar» necesita una tarifa ya cargada en la base local).
  { id: "produccion.tarifas", ruta: "/produccion/proveedores", cuentas: ["admin-taller"], abre: '[data-guia="prod-tarifas.lista"]', nombre: "Producción · Proveedores ▸ «Servicios y tarifas»", preparar: clicRol("tab", /Servicios y tarifas/i) },
  { id: "produccion.tarifa-nueva", ruta: "/produccion/proveedores", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · la hoja «Nueva tarifa» de un servicio", preparar: secuencia(clicRol("tab", /Servicios y tarifas/i), clicRol("button", /Nueva tarifa/i)) },
  { id: "produccion.tarifa-cambiar", ruta: "/produccion/proveedores", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · la hoja «Cambiar la tarifa» de un servicio, con la vigente a la vista", preparar: secuencia(clicRol("tab", /Servicios y tarifas/i), clicRol("button", /^Cambiar$/, { exact: true })) },
  { id: "produccion.eficiencia-mes", ruta: "/produccion/eficiencia", cuentas: ["admin-taller"], nombre: "Producción · Eficiencia de otro mes", preparar: clicRol("radio", /Sep 2026/i) },
);

// ---------- La orden de producción en su página (ADR-0400, actividad 3) ----------
// La página de una orden en proceso (con una fase del Taller por anotar) y sus dos hojas: «Terminé N» (la tabla de cantidades
// precargada con lo que falta) y «Cambiar quién» (la fila de la fase). Ninguna se guarda: solo se abren.
// La orden en proceso más reciente con fases a la que todavía le falta cortar (así «Terminé N» y «Cambiar quién» están a la vista).
const numeroDeOrdenEnProceso = () => consultarLocal("select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id) order by (coalesce((select sum(a.cantidad) from retail.produccion_avances a join retail.produccion_fases f on f.id = a.fase_id where f.produccion_id = p.id and f.clave = 'corte'), 0) < p.cantidad_plan) desc, p.numero desc limit 1");
const irALaOrden = async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenEnProceso()}`)(pagina);
// Una orden con prendas listas para mandar a un servicio (lo que entró a esa fase supera lo que ya salió) y otra con prendas afuera (lo que salió supera lo que ya volvió): son las que muestran «Salida» y «Vuelta».
const SALIDAS_DE = "coalesce((select sum(sl.cantidad) from retail.produccion_salidas s join retail.produccion_salida_lineas sl on sl.salida_id = s.id where s.fase_id = f.id), 0)";
const numeroDeOrdenConSalida = () =>
  consultarLocal(`select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id and f.quien = 'servicio' and coalesce((select sum(a.cantidad) from retail.produccion_avances a join retail.produccion_fases fa on fa.id = a.fase_id where fa.produccion_id = p.id and fa.secuencia = (select max(f2.secuencia) from retail.produccion_fases f2 where f2.produccion_id = p.id and f2.secuencia < f.secuencia)), 0) > ${SALIDAS_DE}) order by p.numero desc limit 1`);
const numeroDeOrdenConVuelta = () =>
  consultarLocal(`select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id and f.quien = 'servicio' and ${SALIDAS_DE} > coalesce((select sum(vl.buenas + vl.segundas + vl.faltantes) from retail.produccion_vueltas v join retail.produccion_vuelta_lineas vl on vl.vuelta_id = v.id where v.fase_id = f.id), 0)) order by p.numero desc limit 1`);
// Una orden con una salida que todavía se puede anular (la misma regla que la base: `fn_produccion_salida_anulable`).
const numeroDeOrdenConAnulable = () =>
  consultarLocal(`select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_salidas s join retail.produccion_fases f on f.id = s.fase_id where f.produccion_id = p.id and s.anula_id is null and retail.fn_produccion_salida_anulable(s.id) is null) order by p.numero desc limit 1`);
// Una orden en proceso con una fase que se marca (Ploteo) sin marcar, y otra con la marca viva: las que ofrecen «Ploteo hecho» y su «Deshacer».
const numeroDeOrdenConPloteoSinMarcar = () =>
  consultarLocal("select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id and f.clave = 'ploteo' and retail.fn_produccion_marca_viva(f.id) is null) order by p.numero desc limit 1");
const numeroDeOrdenConPloteoMarcado = () =>
  consultarLocal("select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id and f.clave = 'ploteo' and retail.fn_produccion_marca_viva(f.id) is not null) order by p.numero desc limit 1");
// Una orden en proceso con tela declarada: es la que ofrece «Anotar lo que usaste».
const numeroDeOrdenConTela = () =>
  consultarLocal("select 'OP-' || lpad(p.numero::text, 6, '0') from retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_insumos i where i.produccion_id = p.id) and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id) order by p.numero desc limit 1");
// Una orden con las fases todas hechas (lista para pasar al stock): la misma regla que la página (`queSigue`).
const numeroDeOrdenLista = () =>
  // `fn_fases_de_orden` pregunta quién es la persona: la consulta se hace como el líder (sin eso devuelve vacío y toda orden «tendría las fases hechas»).
  consultarLocal(`select 'OP-' || lpad(p.numero::text, 6, '0') from (select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-000000000001', true)) _c, retail.producciones p where p.estado = 'en_proceso' and exists (select 1 from retail.produccion_fases f where f.produccion_id = p.id) and not exists (select 1 from jsonb_array_elements(coalesce(retail.fn_fases_de_orden(p.id), '[]'::jsonb)) f where f ->> 'estado' <> 'hecha') and jsonb_array_length(coalesce(retail.fn_fases_de_orden(p.id), '[]'::jsonb)) > 0 order by p.numero desc limit 1`);
ESCENARIOS.push(
  { id: "produccion.orden-pagina", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: '[data-guia="prod-orden.fases"]', nombre: "Producción · una orden en su propia página: ficha, fases, tela, costo y línea de tiempo", preparar: irALaOrden },
  { id: "produccion.orden-terminar", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog] [data-matriz-mover]", nombre: "Producción · una orden: la hoja «Terminé» con la tabla de cantidades precargada", preparar: secuencia(irALaOrden, clicRol("button", /^Terminé \d+$/)) },
  { id: "produccion.orden-salida", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog] [data-matriz-mover]", nombre: "Producción · una orden: la hoja «Salida» a un servicio, con lo que puede salir precargado", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenConSalida()}`)(pagina), clicRol("button", /^Salida$/, { exact: true })) },
  { id: "produccion.orden-vuelta", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog] [data-matriz-mover]", nombre: "Producción · una orden: la hoja «Vuelta» de un servicio, con lo que está afuera precargado", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenConVuelta()}`)(pagina), clicRol("button", /^Vuelta$/, { exact: true })) },
  { id: "produccion.orden-anular", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: '[role=dialog] [data-campo="motivo"]', nombre: "Producción · una orden: la hoja «Anular» una salida mal anotada, con su motivo", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenConAnulable()}`)(pagina), clicRol("button", /^Anular$/, { exact: true })) },
  { id: "produccion.orden-tela-usada", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: '[role=dialog] [data-campo="cantidad"]', nombre: "Producción · una orden: la hoja «Anotar lo que usaste» de la tela, con lo que falta según el plan", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenConTela()}`)(pagina), clicRol("button", /^Anotar lo que usaste$/, { exact: true })) },
  { id: "produccion.orden-editar-tela", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: '[role=dialog] [data-guia="prod-orden-editar-tela.lista"]', nombre: "Producción · una orden: la hoja «Editar tela y avíos» (o «Declarar» si no declaró ninguna), con la tela de cada color y sus avíos", preparar: secuencia(irALaOrden, clicRol("button", /^(Editar|Declarar tela y avíos)$/)) },
  { id: "produccion.orden-stock", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog] [data-matriz-mover]", nombre: "Producción · una orden: la hoja «Pasar al stock» con lo terminado precargado y el costo por prenda", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenLista()}`)(pagina), clicRol("button", /^Pasar al stock$/, { exact: true })) },
  { id: "produccion.orden-anular-orden", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · una orden: la hoja «Anular orden»", preparar: secuencia(irALaOrden, clicRol("button", /^Anular orden$/, { exact: true })) },
  { id: "produccion.orden-marcar", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · una orden: la hoja «Ploteo hecho» (una fase que se marca, sin contar prendas)", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenConPloteoSinMarcar()}`)(pagina), clicRol("button", /^Ploteo hecho$/)) },
  { id: "produccion.orden-desmarcar", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Producción · una orden: la hoja «Deshacer la marca» de Ploteo", preparar: secuencia(async (pagina) => irA(`/produccion/ordenes/${numeroDeOrdenConPloteoMarcado()}`)(pagina), clicRol("button", /^Deshacer$/, { exact: true })) },
  { id: "produccion.orden-cambiar-quien", ruta: "/produccion/ordenes/[numero]", cuentas: ["admin-taller"], abre: '[role=dialog] [data-campo="fase"]', nombre: "Producción · una orden: la hoja «Cambiar quién» de una fase que no empezó", preparar: secuencia(irALaOrden, clicRol("button", /^Cambiar quién$/, { exact: true })) },
);

// ---------- Órdenes de compra (ADR-0362, fase 1) ----------
// La ventana de una orden, su hoja «Anular orden» y «Editar» necesitan una orden «generada»: la primera de la base local.
const idDeOrdenCompra = () => consultarLocal("select id from retail.ordenes_compra where estado = 'generada' order by numero limit 1");
ESCENARIOS.push(
  { id: "ordenes.ventana", ruta: "/compras/ordenes", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Órdenes de compra · la orden abierta sobre la lista", preparar: async (pagina) => { await pagina.locator('main a[href*="/compras/ordenes/ver/"]').first().click({ timeout: 8000 }); await esperar(pagina, 1500); } },
  { id: "ordenes.calendario", ruta: "/compras/ordenes/nueva", cuentas: ["admin"], abre: '[role=dialog][aria-label="Calendario"]', nombre: "Nueva orden de compra · el calendario de «Entrega estimada»", preparar: clicRol("button", /Abrir calendario/i) },
  { id: "ordenes.llega-a", ruta: "/compras/ordenes/nueva", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Nueva orden de compra · la lista de «Llega a»", preparar: async (pagina) => { await pagina.locator("#oc-destino").click({ timeout: 8000 }); await esperar(pagina, 800); } },
  { id: "ordenes.anular", ruta: "/compras/ordenes/ver/[id]", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Órdenes de compra · la hoja «Anular orden»", preparar: secuencia(async (pagina) => irA(`/compras/ordenes/ver/${idDeOrdenCompra()}`)(pagina), clicRol("button", /^Anular orden$/)) },
  { id: "ordenes.editar", ruta: "/compras/ordenes/editar/[id]", cuentas: ["admin"], abre: "h1", nombre: "Órdenes de compra · «Editar OC-…»", preparar: async (pagina) => irA(`/compras/ordenes/editar/${idDeOrdenCompra()}`)(pagina) },
  // Fase 3: «Enviar a una sede» y la hoja «Anular envío» (necesita una orden con un envío en camino en la base local).
  { id: "ordenes.enviar", ruta: "/compras/ordenes/envio/[id]", cuentas: ["admin"], abre: "h1", nombre: "Órdenes de compra · «Enviar OC-…» a una sede", preparar: async (pagina) => irA(`/compras/ordenes/envio/${idDeOrdenCompra()}`)(pagina) },
  { id: "ordenes.anular-envio", ruta: "/compras/ordenes/ver/[id]", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Órdenes de compra · la hoja «Anular envío»", preparar: secuencia(async (pagina) => irA(`/compras/ordenes/ver/${consultarLocal("select oci.orden_compra_id from retail.despachos d join retail.despacho_items di on di.despacho_id = d.id join retail.orden_compra_items oci on oci.id = di.orden_compra_item_id where d.estado = 'en_camino' limit 1")}`)(pagina), clicRol("button", /^Anular envío$/)) },
);

// ---------- Fondo por rendir y gastos del viaje (ADR-0362, fase 6) ----------
// Fondos por rendir (el líder): entregar, lo que devuelve, saldar la deuda de un faltante y anular un movimiento. Cada hoja necesita su
// dato en la base local: un fondo con plata (devolver), una deuda de un faltante (su pago) y un movimiento que se pueda anular; «Revisar»
// necesita una rendición por aprobar, así que va solo por id. En Órdenes de compra, la hoja «Gasto del viaje» (y con su combo de órdenes
// abierto) y «Rendir» desde «Tu fondo» (quien audita tiene que tener un fondo); en una orden, «Traerla costó»; en Configuración, el tope de
// la planilla de movilidad.
const idDeOrdenConGastoDelViaje = () =>
  consultarLocal(
    "select gvo.orden_compra_id from retail.gastos_viaje_ordenes gvo join retail.gastos g on g.id = gvo.gasto_id where g.estado = 'vigente' order by g.created_at limit 1",
  );
ESCENARIOS.push(
  { id: "fondos.entregar", ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Fondos por rendir · «Entregar plata»", preparar: clicRol("button", /Entregar plata/i) },
  // Compras simple (ADR-0480, actividad 2): «Me dieron plata» (la compradora) y «Confirmar la plata» (necesita una plata anotada de otra persona).
  { id: "mi-plata.anotar", ruta: "/compras/mi-plata", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Mis compras · «Me dieron plata»", preparar: clicRol("button", /Me dieron plata/i) },
  // Revisar compras como bandeja (rediseño, maqueta compras-formidable-2026-10): cada cifra filtra la lista y abre su detalle al lado, sin
  // hoja. Los de gastos y cierres necesitan uno pendiente en la base: se corren por su id.
  { id: "fondos.plata-confirmar", ruta: "/compras/fondos", cuentas: ["admin"], abre: '[data-guia="fondos.plata-detalle"]', nombre: "Revisar compras · la plata por confirmar, con su detalle al lado", preparar: clicGuia("fondos.cifra-plata") },
  { id: "fondos.bandeja-papel", ruta: "/compras/fondos", cuentas: ["admin"], abre: '[data-guia="fondos.papel-detalle"]', nombre: "Revisar compras · una compra por completar, con su detalle al lado", preparar: clicGuia("fondos.cifra-papel") },
  { id: "fondos.bandeja-gasto", soloPorId: true, ruta: "/compras/fondos", cuentas: ["admin"], abre: '[data-guia="fondos.gasto-detalle"]', nombre: "Revisar compras · un gasto por revisar (necesita uno)", preparar: clicGuia("fondos.cifra-gasto") },
  { id: "fondos.bandeja-cierre", soloPorId: true, ruta: "/compras/fondos", cuentas: ["admin"], abre: '[data-guia="fondos.cierre-detalle"]', nombre: "Revisar compras · un cierre del día por recibir (necesita uno)", preparar: clicGuia("fondos.cifra-cierre") },
  // Las hojas del celular de Mi plata (rediseño): «Gasté en otra cosa» y «Mandar a la tienda» (necesita algo por mandar).
  { id: "mi-plata.gasto", ruta: "/compras/mi-plata", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Mis compras · «Gasté en otra cosa»", preparar: clicRol("button", /Gasté en otra cosa/i) },
  { id: "mi-plata.mandar", soloPorId: true, ruta: "/compras/mi-plata", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Mis compras · «Mandar a la tienda» (necesita algo por mandar)", preparar: clicRol("button", /Falta mandar/i) },
  // «Quién tiene plata» y «Entregas y devoluciones» se abren en una hoja desde la cabecera (Felipe 2026-10-23); lo de adentro, desde ella.
  { id: "fondos.quien-tiene", ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Revisar compras · la hoja «Quién tiene plata»", preparar: clicGuia("fondos.quien-tiene") },
  { id: "fondos.entregas", soloPorId: true, ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Revisar compras · la hoja «Entregas y devoluciones» (necesita una)", preparar: clicGuia("fondos.entregas") },
  { id: "fondos.devolver", ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog] >> nth=1", nombre: "Revisar compras · «Registrar devolución», desde «Quién tiene plata»", preparar: secuencia(clicGuia("fondos.quien-tiene"), clicRol("button", /^Registrar devolución/i)) },
  { id: "fondos.pagar-deuda", ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog] >> nth=1", nombre: "Revisar compras · «Registrar su pago» (la deuda de un faltante), desde «Quién tiene plata»", preparar: secuencia(clicGuia("fondos.quien-tiene"), clicRol("button", /^Registrar su pago/i)) },
  { id: "fondos.anular", ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog] >> nth=1", nombre: "Revisar compras · «Anular» un movimiento, desde «Entregas y devoluciones»", preparar: secuencia(clicGuia("fondos.entregas"), clicRol("button", /^Anular$/)) },
  { id: "fondos.revisar", soloPorId: true, ruta: "/compras/fondos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Fondos por rendir · «Revisar» una rendición (necesita una por aprobar)", preparar: clicRol("button", /^Revisar$/) },
  // La lista de lo rendido que no se puede leer (decisión 81): la lectura falla SOLO en la red de la auditoría (no se toca la base), y la
  // hoja dice que no pudo, con «Volver a intentar». `limpiar` quita la ruta.
  {
    id: "fondos.revisar-sin-lista",
    soloPorId: true,
    ruta: "/compras/fondos",
    cuentas: ["admin"],
    abre: "[role=dialog] >> text=No pude traer lo que rindió",
    nombre: "Fondos por rendir · «Revisar» cuando la lista de lo rendido no se puede leer",
    async preparar(pagina) {
      await pagina.route(/\/rpc\/fn_rendicion_fondo_items/, (ruta) => ruta.fulfill({ status: 500, contentType: "application/json", body: '{"message":"simulada"}' }));
      await clicRol("button", /^Revisar$/)(pagina);
    },
    limpiar: (pagina) => pagina.unroute(/\/rpc\/fn_rendicion_fondo_items/).catch(() => {}),
  },
  { id: "ordenes.gasto-viaje", ruta: "/compras/ordenes", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Órdenes de compra · la hoja «Gasto del viaje»", preparar: clicRol("button", /Gasto del viaje/i) },
  {
    id: "ordenes.gasto-viaje-orden",
    ruta: "/compras/ordenes",
    cuentas: ["admin"],
    abre: "[role=listbox]",
    nombre: "Órdenes de compra · «Gasto del viaje» con «+ Agregar una orden» abierto",
    preparar: secuencia(clicRol("button", /Gasto del viaje/i), clicRol("button", /Agregar una orden/i)),
  },
  { id: "ordenes.rendir", ruta: "/compras/ordenes", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Órdenes de compra · «Rendir» desde «Tu fondo»", preparar: clicRol("button", /^(Rendir|Ver tu rendición)/) },
  // «Rendir» con la lista de lo que no se rindió sin poder leerse (decisión 81): falla solo en la red de la auditoría.
  {
    id: "ordenes.rendir-sin-lista",
    soloPorId: true,
    ruta: "/compras/ordenes",
    cuentas: ["admin"],
    abre: "[role=dialog] >> text=No pude traer la lista",
    nombre: "Órdenes de compra · «Rendir» cuando la lista de lo que no se rindió no se puede leer",
    async preparar(pagina) {
      await pagina.route(/\/rpc\/fn_mi_ciclo_fondo/, (ruta) => ruta.fulfill({ status: 500, contentType: "application/json", body: '{"message":"simulada"}' }));
      await clicRol("button", /^Rendir$/)(pagina);
    },
    limpiar: (pagina) => pagina.unroute(/\/rpc\/fn_mi_ciclo_fondo/).catch(() => {}),
  },
  {
    id: "ordenes.traerla-costo",
    ruta: "/compras/ordenes/ver/[id]",
    cuentas: ["admin"],
    abre: '[data-guia="orden.gastos-viaje"]',
    nombre: "Órdenes de compra · una orden con «Traerla costó»",
    preparar: async (pagina) => irA(`/compras/ordenes/ver/${idDeOrdenConGastoDelViaje()}`)(pagina),
  },
  {
    id: "configuracion.tope-planilla",
    ruta: "/configuracion",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Configuración ▸ Impuestos · «+ Tope desde una fecha» (la planilla de movilidad)",
    preparar: secuencia(clicPestana(/^Impuestos/i), clicRol("button", /Tope desde una fecha/i)),
  },
);

// ---------- Órdenes de insumos del Taller (ADR-0362, fase 7) ----------
// La ventana de una orden, su hoja «Anular orden» y «Editar» necesitan una orden «generada»: la primera de la base local. Se auditan
// parados en el Taller, donde el menú las muestra.
const idDeOrdenInsumo = () => consultarLocal("select id from retail.ordenes_insumo where estado = 'generada' order by numero limit 1");
ESCENARIOS.push(
  { id: "oi.ventana", ruta: "/ordenes-insumos", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Órdenes de insumos · la orden abierta sobre la lista", preparar: async (pagina) => { await pagina.locator('main a[href*="/ordenes-insumos/ver/"]').first().click({ timeout: 8000 }); await esperar(pagina, 1500); } },
  { id: "oi.calendario", ruta: "/ordenes-insumos/nueva", cuentas: ["admin-taller"], abre: '[role=dialog][aria-label="Calendario"]', nombre: "Nueva orden de insumos · el calendario de «Entrega estimada»", preparar: clicRol("button", /Abrir calendario/i) },
  { id: "oi.insumo", ruta: "/ordenes-insumos/nueva", cuentas: ["admin-taller"], abre: "[role=listbox]", nombre: "Nueva orden de insumos · la lista de «Insumo» (código y unidad)", preparar: async (pagina) => { await pagina.getByLabel("Insumo de la línea 1").click({ timeout: 8000 }); await esperar(pagina, 800); } },
  { id: "oi.anular", ruta: "/ordenes-insumos/ver/[id]", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Órdenes de insumos · la hoja «Anular orden»", preparar: secuencia(async (pagina) => irA(`/ordenes-insumos/ver/${idDeOrdenInsumo()}`)(pagina), clicRol("button", /^Anular orden$/)) },
  { id: "oi.editar", ruta: "/ordenes-insumos/editar/[id]", cuentas: ["admin-taller"], abre: "h1", nombre: "Órdenes de insumos · «Editar OI-…»", preparar: async (pagina) => irA(`/ordenes-insumos/editar/${idDeOrdenInsumo()}`)(pagina) },
  { id: "oi.comprobante", ruta: "/ordenes-insumos/comprobante/[id]", cuentas: ["admin-taller"], abre: "h1", nombre: "Órdenes de insumos · «Comprobante de OI-…» (el papel del proveedor)", preparar: async (pagina) => irA(`/ordenes-insumos/comprobante/${idDeOrdenInsumo()}`)(pagina) },
  { id: "oi.recibir", ruta: "/produccion/recibir", cuentas: ["admin-taller"], abre: "[role=dialog]", nombre: "Recibir · la hoja de una orden de insumos", preparar: async (pagina) => { await pagina.locator('[data-guia="prod-recibir.ordenes"] button:not([disabled])').filter({ hasText: /^Recibir$/ }).first().click({ timeout: 8000 }); await esperar(pagina, 1200); } },
);

// ---------- «Nos debe» (ADR-0362, fase 5a) ----------
// Un proveedor que todavía debe prendas por reponer (un faltante «No vino» sin saldar). Con una base sin la fase 5 (sin la tabla de lo
// resuelto), el primero con un faltante «No vino»; sin ninguno, Textiles Andina (el escenario no encontrará el botón y lo dirá).
const idDeProveedorQueDebe = () => {
  const consultas = [
    "select x.proveedor_id from retail.despacho_diferencias x where x.tipo = 'faltante' and x.causa = 'no_vino' and x.cantidad > coalesce((select sum(r.cantidad) from retail.proveedor_deuda_resoluciones r where r.diferencia_id = x.id), 0) order by x.creado_en limit 1",
    "select proveedor_id from retail.despacho_diferencias where tipo = 'faltante' and causa = 'no_vino' order by creado_en limit 1",
  ];
  for (const sql of consultas) {
    try {
      const id = consultarLocal(sql);
      if (id) return id;
    } catch {
      // La base todavía no tiene esa tabla: la siguiente consulta.
    }
  }
  return idDeProveedor();
};
const elegirProveedorQueDebe = async (pagina) => {
  const nombre = consultarLocal(`select nombre from retail.proveedores where id = '${idDeProveedorQueDebe()}'`);
  await pagina.getByRole("combobox", { name: /^Proveedor/ }).first().click({ timeout: 8000 });
  await esperar(pagina, 500);
  await pagina.keyboard.type(nombre.split(" ")[0] ?? "");
  await esperar(pagina, 800);
  await pagina.getByRole("option", { name: new RegExp(nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click({ timeout: 8000 });
  await esperar(pagina, 1100);
};
ESCENARIOS.push(
  { id: "proveedores.nos-debe", ruta: "/compras/proveedores/[id]", cuentas: ["admin"], abre: "#nos-debe", nombre: "Proveedores · «Nos debe» con prendas por reponer", preparar: async (pagina) => irA(`/compras/proveedores/${idDeProveedorQueDebe()}#nos-debe`)(pagina) },
  { id: "proveedores.reposicion", ruta: "/compras/proveedores/[id]", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Proveedores · la hoja «Llegó la reposición»", preparar: secuencia(async (pagina) => irA(`/compras/proveedores/${idDeProveedorQueDebe()}`)(pagina), clicRol("button", /^Llegó la reposición$/)) },
  { id: "ordenes.nos-debe", ruta: "/compras/ordenes/nueva", cuentas: ["admin"], abre: '[data-guia="orden-form.nos-debe"]', nombre: "Nueva orden de compra · el aviso «te debe … por reponer» al elegir el proveedor", preparar: elegirProveedorQueDebe },
);

// ---------- Finanzas (actividad 12) ----------
const FIN = ["admin"];
ESCENARIOS.push(
  { id: "finanzas.que-mirar", ruta: "/finanzas/resumen", cuentas: FIN, abre: "[role=listbox]", nombre: "Finanzas · la lista «Qué mirar» (tienda o empresa)", preparar: clicRol("combobox", /Qué mirar/i) },
  { id: "finanzas.resumen-confianza", ruta: "/finanzas/resumen", cuentas: FIN, abre: "#fin-confianza-piezas", nombre: "Resumen · «cosas por revisar» abre el medidor de confianza", preparar: clicRol("button", /(cosas? por revisar|Ver el detalle)/i) },
  { id: "gastos.registrar", ruta: "/finanzas/gastos", cuentas: FIN, abre: "[role=dialog]", nombre: "Gastos · «Registrar gasto»", preparar: clicRol("button", /Registrar gasto/i) },
  { id: "gastos.fijos", ruta: "/finanzas/gastos", cuentas: FIN, nombre: "Gastos · la pestaña «Fijos del mes»", preparar: clicRol("tab", /Fijos del mes/i) },
  { id: "gastos.activos", ruta: "/finanzas/gastos", cuentas: FIN, nombre: "Gastos · la pestaña «Activos fijos»", preparar: clicRol("tab", /Activos fijos/i) },
  { id: "gastos.egresos", ruta: "/finanzas/gastos", cuentas: FIN, nombre: "Gastos · la pestaña «Egresos de caja por clasificar»", preparar: clicRol("tab", /Egresos de caja por clasificar/i) },
  { id: "gastos.categoria", ruta: "/finanzas/gastos", cuentas: FIN, abre: "[role=listbox]", nombre: "Gastos · la lista «Categoría»", preparar: clicRol("combobox", /^Categoría/i) },
  { id: "dinero.registrar", ruta: "/finanzas/dinero", cuentas: FIN, abre: "[role=dialog]", nombre: "Cuentas y dinero · «Registrar movimiento»", preparar: clicRol("button", /Registrar movimiento/i) },
  { id: "impuestos.ventas", ruta: "/finanzas/impuestos", cuentas: FIN, nombre: "Impuestos · «Registro de ventas»", preparar: clicRol("button", /Registro de ventas/i) },
  { id: "impuestos.compras", ruta: "/finanzas/impuestos", cuentas: FIN, nombre: "Impuestos · «Registro de compras»", preparar: clicRol("button", /Registro de compras/i) },
  { id: "impuestos.contador", ruta: "/finanzas/impuestos", cuentas: FIN, nombre: "Impuestos · «Paquete para el contador»", preparar: clicRol("button", /Paquete para el contador/i) },
  { id: "impuestos.mes", ruta: "/finanzas/impuestos", cuentas: FIN, abre: "[role=listbox]", nombre: "Impuestos · la lista «Mes que se mira»", preparar: clicRol("combobox", /Mes que se mira/i) },
  { id: "reportes.mes", ruta: "/finanzas/reportes", cuentas: FIN, abre: "[role=listbox]", nombre: "Estado de resultados · la lista «Mes»", preparar: clicRol("combobox", /^Mes/i) },
  { id: "reportes.de-donde", ruta: "/finanzas/reportes", cuentas: FIN, abre: "[role=dialog]", nombre: "Estado de resultados · «De dónde sale» una cifra", preparar: clicRol("button", /^De dónde sale: Ventas, Lima/i) },
  { id: "balance.arranque", ruta: "/finanzas/reportes/balance", cuentas: FIN, abre: "[role=dialog]", nombre: "Balance · «Registrar saldos de arranque»", preparar: clicRol("button", /Registrar saldos de arranque/i) },
  { id: "cierre.pendientes", ruta: "/finanzas/cierre", cuentas: FIN, nombre: "Cierre de mes · lo que falta de Tienda Lima", preparar: clicRol("button", /Tienda Lima .*pendientes/i) },
  { id: "cierre.mes", ruta: "/finanzas/cierre", cuentas: FIN, abre: "[role=listbox]", nombre: "Cierre de mes · la lista «Mes que se cierra»", preparar: clicRol("combobox", /Mes que se cierra/i) },
);

// ---------- Clientes, Comercial y Administración (actividad 13) ----------
const idDeProductoCualquiera = () => consultarLocal("select id from retail.productos where codigo = 'BLZ-0001' limit 1");
ESCENARIOS.push(
  { id: "clientas.nuevo", ruta: "/clientas", cuentas: ["admin", "terminal-ventas", "integrante"], abre: "[role=dialog]", nombre: "Clientes · «Nuevo cliente»", preparar: clicRol("button", /Nuevo cliente/i) },
  { id: "clientas.ficha", ruta: "/clientas", cuentas: ["admin", "terminal-ventas", "integrante"], abre: "[role=dialog]", nombre: "Clientes · la ficha de una clienta", preparar: clicRol("button", /^Camila Torres/i) },
  // «Editar» con el correo (20261015123000): uno mal escrito dice su error BAJO la caja (el que no se guarda: no escribe en la base).
  {
    id: "clientas.ficha-editar",
    ruta: "/clientas",
    cuentas: ["admin", "integrante"],
    abre: "[role=dialog]",
    nombre: "Clientes · «Editar» de la ficha, con el correo mal escrito",
    async preparar(pagina) {
      await clicRol("button", /^Camila Torres/i)(pagina);
      await clicRol("button", /^Editar/i)(pagina);
      await pagina.locator("#ficha-cliente-correo").fill("correo@incompleto");
      await pagina.locator("#ficha-cliente-correo").press("Tab");
      await esperar(pagina, 900);
    },
  },
  // «Archivar» con un pedido de la tienda online en curso: el aviso. La base local no suele tener un pedido web de Camila, así que el
  // escenario contesta él la lectura (`fn_clienta_tienda_online`, sin escribir nada); lo que se dibuja es la hoja real. Como el pedido
  // está PAGADO, el interruptor «Anonimizar» sale apagado y dice por qué (20261015131000).
  {
    id: "clientas.ficha-archivar",
    ruta: "/clientas",
    cuentas: ["admin", "integrante"],
    abre: "[role=dialog]",
    nombre: "Clientes · «Archivar» con un pedido de la tienda online en curso",
    async preparar(pagina) {
      await pagina.route(/\/rpc\/fn_clienta_tienda_online/, (ruta) =>
        ruta.fulfill({ json: { cuenta_web: true, pedidos_en_curso: [{ codigo: "W-0012", estado: "pagado", tienda: "Tienda Trujillo" }] } }),
      );
      await clicRol("button", /^Camila Torres/i)(pagina);
      await clicRol("button", /^Archivar a este cliente$/)(pagina);
    },
    limpiar: (pagina) => pagina.unroute(/\/rpc\/fn_clienta_tienda_online/).catch(() => {}),
  },
  // «Restablecer acceso a la tienda web» (Felipe 2026-10-15, 20261015132000). La base local no suele tener a Camila con cuenta web: el
  // escenario contesta él las dos lecturas (sin escribir nada). El bloque de la ficha, con un restablecimiento pendiente…
  {
    id: "clientas.ficha-tienda-online",
    ruta: "/clientas",
    cuentas: ["admin", "integrante"],
    abre: '[data-guia="clientas.ficha-tienda-online"]',
    nombre: "Clientes · la ficha con su cuenta de la tienda online y un restablecimiento pendiente",
    async preparar(pagina) {
      await pagina.route(/\/rpc\/fn_clienta_tienda_online/, (ruta) => ruta.fulfill({ json: { cuenta_web: true, pedidos_en_curso: [] } }));
      await pagina.route(/\/rpc\/fn_clienta_acceso_web/, (ruta) =>
        ruta.fulfill({
          json: {
            cuenta_web: true,
            restablecer: { correo: "camila.nueva@gmail.com", pedido_en: new Date().toISOString(), vence_en: new Date(Date.now() + 864e5).toISOString(), ultimo_envio_en: new Date().toISOString(), envios: 1 },
          },
        }),
      );
      await clicRol("button", /^Camila Torres/i)(pagina);
      await esperar(pagina, 900);
    },
    limpiar: async (pagina) => {
      await pagina.unroute(/\/rpc\/fn_clienta_tienda_online/).catch(() => {});
      await pagina.unroute(/\/rpc\/fn_clienta_acceso_web/).catch(() => {});
    },
  },
  // …y su hoja, con el correo nuevo mal escrito (dice su error BAJO la caja; no se manda nada).
  {
    id: "clientas.ficha-restablecer",
    ruta: "/clientas",
    cuentas: ["admin", "integrante"],
    abre: "#ficha-acceso-web-correo",
    nombre: "Clientes · «Restablecer acceso» de la tienda online, con el correo mal escrito",
    async preparar(pagina) {
      await pagina.route(/\/rpc\/fn_clienta_tienda_online/, (ruta) => ruta.fulfill({ json: { cuenta_web: true, pedidos_en_curso: [] } }));
      await pagina.route(/\/rpc\/fn_clienta_acceso_web/, (ruta) => ruta.fulfill({ json: { cuenta_web: true, restablecer: null } }));
      await clicRol("button", /^Camila Torres/i)(pagina);
      await clicRol("button", /^Restablecer acceso$/)(pagina);
      await pagina.locator("#ficha-acceso-web-correo").fill("correo@incompleto");
      await pagina.locator("#ficha-acceso-web-correo").press("Tab");
      await esperar(pagina, 900);
    },
    limpiar: async (pagina) => {
      await pagina.unroute(/\/rpc\/fn_clienta_tienda_online/).catch(() => {});
      await pagina.unroute(/\/rpc\/fn_clienta_acceso_web/).catch(() => {});
    },
  },
  // El historial en línea de tiempo (diseño B de Fichas, 2026-10-20): la pestaña «Historial» de la ficha.
  {
    id: "clientas.ficha-historial",
    ruta: "/clientas",
    cuentas: ["admin", "integrante"],
    abre: '[data-guia="clientas.ficha-actividad"]',
    nombre: "Clientes · la ficha, pestaña «Historial»",
    async preparar(pagina) {
      await clicRol("button", /^Camila Torres/i)(pagina);
      await clicRol("tab", /^Historial/i)(pagina);
      await esperar(pagina, 900);
    },
  },
  { id: "clientas.buscar", ruta: "/clientas", cuentas: ["admin", "terminal-ventas"], nombre: "Clientes · una búsqueda", async preparar(pagina) { await pagina.getByPlaceholder(/DNI, celular/i).first().fill("Rosa"); await esperar(pagina, 1800); } },
  { id: "avisos.beneficios", ruta: "/clientas/avisos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Avisos · «Beneficios del club»", preparar: clicRol("button", /Beneficios del club/i) },
  { id: "avisos.cumpleanos", ruta: "/clientas/avisos", cuentas: ["admin"], nombre: "Avisos · la pestaña «Cumpleaños»", preparar: clicRol("button", /^Cumpleaños/i) },
  // Clientes ▸ Recomendaciones (ADR-0408): la hoja de la primera de la lista (por responder: con la respuesta y «Archivar sin responder») y el filtro
  // «Estado» abierto. La base local no trae recomendaciones (las escribe un cliente desde la tienda online): quien audita las crea con
  // `tienda_recomendar` y las deja como estaban. Ninguno guarda: abren y eligen.
  {
    id: "recomendaciones.hoja",
    soloPorId: true,
    ruta: "/tienda-web/recomendaciones",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Recomendaciones · la hoja de una recomendación",
    async preparar(pagina) {
      await pagina.locator('[data-guia="recomendaciones.fila"] button').first().click({ timeout: 8000 });
      await pagina.locator("[role=dialog]").first().waitFor({ timeout: 15000 });
      await esperar(pagina, 1200);
    },
  },
  { id: "recomendaciones.estado", ruta: "/tienda-web/recomendaciones", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Recomendaciones · el filtro «Estado»", preparar: clicRol("button", /^Estado/i) },
  { id: "comercial.ayuda", ruta: "/comercial", cuentas: ["admin"], nombre: "Comercial · la ayuda «Qué cuenta como venta»", preparar: clicRol("button", /Qué es Qué cuenta como venta/i) },
  { id: "calidad.ayuda", ruta: "/comercial/calidad", cuentas: ["admin"], nombre: "Calidad de datos · la ayuda «Cómo se lee»", preparar: clicRol("button", /Qué es Cómo se lee/i) },
  { id: "buscar.resultados", ruta: "/buscar", cuentas: ["admin", "integrante", "terminal-ventas"], nombre: "Buscar · los resultados de una prenda", preparar: llenar(/SKU, referencia, talla, color/i, "Vestido") },
  { id: "colaboradores.ficha", ruta: "/colaboradores", cuentas: ["admin"], nombre: "Colaboradores · la ficha de una persona", preparar: clicRol("button", /Micaela Vendedora/i) },
  { id: "colaboradores.terminal", ruta: "/colaboradores", cuentas: ["admin"], nombre: "Colaboradores · la ficha de una terminal", preparar: clicRol("button", /^Almacén Trujillo/i) },
  { id: "colaboradores.roles", ruta: "/colaboradores", cuentas: ["admin"], nombre: "Colaboradores · «Roles y accesos»", preparar: clicRol("button", /^Roles y accesos/i) },
  { id: "colaboradores.rol", ruta: "/colaboradores", cuentas: ["admin"], nombre: "Colaboradores · el detalle de un rol", preparar: secuencia(clicRol("button", /^Roles y accesos/i), async (pagina) => { await pagina.getByRole("button", { name: /Integrante/i }).first().click({ timeout: 8000 }); await esperar(pagina, 1200); }) },
  { id: "tienda-web.ajustes", ruta: "/tienda-web/ajustes", cuentas: ["admin"], abre: '[data-guia="config.tienda-web-sedes"]', nombre: "Tienda web ▸ Conf. Tienda (antes Datos y plazos; ADR-0430; antes la pestaña «Tienda web» de Configuración)" },
  { id: "configuracion.caja", ruta: "/configuracion", cuentas: ["admin"], nombre: "Configuración · «Caja y avisos»", preparar: clicPestana(/Caja y avisos/i) },
  { id: "configuracion.cuentas", ruta: "/configuracion", cuentas: ["admin"], nombre: "Configuración · «Cuentas y cobros»", preparar: clicPestana(/Cuentas y cobros/i) },
  { id: "configuracion.gastos", ruta: "/configuracion", cuentas: ["admin"], nombre: "Configuración · «Gastos fijos»", preparar: clicPestana(/Gastos fijos/i) },
  { id: "configuracion.presupuesto", ruta: "/configuracion", cuentas: ["admin"], nombre: "Configuración · «Presupuesto»", preparar: clicPestana(/^Presupuesto/i) },
  { id: "configuracion.impuestos", ruta: "/configuracion", cuentas: ["admin"], nombre: "Configuración · «Impuestos»", preparar: clicPestana(/^Impuestos/i) },
  { id: "configuracion.empresa", ruta: "/configuracion", cuentas: ["admin"], nombre: "Configuración · «Empresa»", preparar: clicPestana(/^Empresa/i) },
  { id: "actividad.modulo", ruta: "/actividad", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Actividad · la lista «Módulo»", preparar: clicRol("combobox", /^Módulo/i) },
  { id: "actividad.persona", ruta: "/actividad", cuentas: ["admin"], abre: "[role=listbox]", nombre: "Actividad · la lista «Persona»", preparar: clicRol("combobox", /^Persona/i) },
  { id: "actividad.hoy", ruta: "/actividad", cuentas: ["admin"], nombre: "Actividad · el período «Hoy»", preparar: clicRol("button", /^Hoy/i) },
  { id: "etiquetas.previa", ruta: "/etiquetas-de-precio", cuentas: ["admin"], abre: "input[aria-label^='Etiquetas de']", nombre: "Etiquetas de precio · la vista previa (papel fijo)", preparar: async (pagina) => { await irA(`/etiquetas-de-precio?producto=${idDeProductoCualquiera()}`)(pagina); await esperar(pagina, 2500); } },
);

// ---------- Recibir contando primero (ADR-0393) ----------
// La cara A de `/recibir/envio/[id]`. Solo por id (`--escenario`): necesitan la base con las migraciones 20261013170000–183000 y un
// envío de Trujillo abierto (contar, agregar, cerrar) o cerrado con algo para después («Para después», «Hacer ahora», reabrir). Los ve
// Micaela (integrante, Trujillo, con Recibir). Sin ADR-0393 en la base, el escenario lo dice en vez de auditar la fase 4 en falso.
const exigirAdr0393 = () => {
  if (consultarLocal("select to_regclass('retail.despacho_pendientes') is not null") !== "t") {
    throw new Error("la base local no tiene ADR-0393 (migraciones 20261013170000–183000): la pantalla del envío sigue siendo la de la fase 4");
  }
};
const envioDeTrujillo = (condicion) => {
  exigirAdr0393();
  const id = consultarLocal(
    `select d.id from retail.despachos d join retail.ubicaciones u on u.id = d.ubicacion_destino_id where u.nombre ilike '%trujillo%' and ${condicion} order by d.numero desc limit 1`,
  );
  if (!id) throw new Error(`no hay un envío de Trujillo que cumpla «${condicion}» en la base local`);
  return id;
};
const ENVIO_ABIERTO = "d.estado = 'abierto'";
// «Para después» tiene algo si hay un pendiente anotado (tallas o crear) o prendas sin separar (esas no se anotan: salen de las cuentas).
const ENVIO_CON_PENDIENTES =
  "d.estado = 'cerrado' and (exists (select 1 from retail.despacho_pendientes p where p.despacho_id = d.id and p.estado = 'pendiente') or exists (select 1 from retail.fn_envio_cuentas(array[d.id]) c where c.sin_separar > 0))";
const irAlEnvio = (condicion) => async (pagina) => irA(`/recibir/envio/${envioDeTrujillo(condicion)}`)(pagina);
// «Describir ahora» solo sale en la categoría que tiene nuevas sin describir: se elige un envío abierto que las tenga y se recorren sus
// categorías (elegir una no guarda nada) hasta dar con el botón.
// Felipe 2026-10-14: un envío sin aviso abierto que todavía no sabe de quién es (al cerrar pide «¿De quién llegó?»).
const ENVIO_SIN_PROVEEDOR =
  "d.estado = 'abierto' and exists (select 1 from retail.despachos_sin_aviso s where s.despacho_id = d.id and s.proveedor_id is null) and exists (select 1 from retail.despacho_conteos k where k.despacho_id = d.id)";
const ENVIO_CON_NUEVAS =
  "d.estado = 'abierto' and exists (select 1 from retail.despacho_conteos c, jsonb_array_elements(c.separado->'nuevas') n where c.despacho_id = d.id and n->>'descripcion' is null and (n->>'cantidad')::int > 0)";
const abrirDescribir = async (pagina) => {
  const boton = pagina.getByRole("button", { name: /Describir ahora/ }).first();
  const categorias = pagina.locator('[data-guia="recepcion.categorias"] button.rc-cat-item');
  for (let i = 0, n = await categorias.count(); i < n && !(await boton.isVisible().catch(() => false)); i++) {
    await categorias.nth(i).click({ timeout: 8000 });
    await esperar(pagina, 500);
  }
  await boton.click({ timeout: 8000 });
  await esperar(pagina, 1100);
};
const RECEPCION = ["integrante"];
ESCENARIOS.push(
  { id: "recepcion.contar", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: '[data-guia="recepcion.categorias"]', nombre: "Recibir un envío · Contar (la lista y el contador)", preparar: irAlEnvio(ENVIO_ABIERTO) },
  { id: "recepcion.agregar", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: "[role=dialog]", nombre: "Recibir un envío · la hoja «Agregar lo que llegó»", preparar: secuencia(irAlEnvio(ENVIO_ABIERTO), async (pagina) => { await pagina.locator('[data-guia="recepcion.agregar"]').first().click({ timeout: 8000 }); await esperar(pagina, 1100); }) },
  { id: "recepcion.describir", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: "[role=dialog]", nombre: "Recibir un envío · la hoja «Describir lo nuevo»", preparar: secuencia(irAlEnvio(ENVIO_CON_NUEVAS), abrirDescribir) },
  { id: "recepcion.de-quien", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: '[data-guia="recepcion.de-quien"]', nombre: "Recibir un envío · Cerrar sin proveedor («¿De quién llegó?»)", preparar: secuencia(irAlEnvio(ENVIO_SIN_PROVEEDOR), async (pagina) => { await pagina.locator('[data-guia="recepcion.pasar-a-cerrar"]').first().click({ timeout: 8000 }); await esperar(pagina, 1200); }) },
  { id: "recepcion.cerrar", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: '[data-guia="recepcion.tabla-cierre"]', nombre: "Recibir un envío · Cerrar (la tabla y el pie)", preparar: secuencia(irAlEnvio(ENVIO_ABIERTO), async (pagina) => { await pagina.locator('[data-guia="recepcion.pasar-a-cerrar"]').first().click({ timeout: 8000 }); await esperar(pagina, 1200); }) },
  { id: "recepcion.cerrado", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: '[data-guia="recepcion.para-despues"]', nombre: "Recibir un envío · cerrado, con «Para después»", preparar: irAlEnvio(ENVIO_CON_PENDIENTES) },
  { id: "recepcion.hacer-ahora", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: "[role=dialog]", nombre: "Recibir un envío · la hoja «Hacer ahora» (separar)", preparar: secuencia(irAlEnvio(ENVIO_CON_PENDIENTES), clicRol("button", /^Hacer ahora$/)) },
  { id: "recepcion.reabrir", soloPorId: true, ruta: "/recibir/envio/[id]", cuentas: RECEPCION, abre: "[role=dialog]", nombre: "Recibir un envío · la hoja «Reabrir»", preparar: secuencia(irAlEnvio(ENVIO_CON_PENDIENTES), clicRol("button", /Reabrir el conteo/)) },
);

// Catálogo ▸ Vitrina web (ADR-0408, actividad 3): la hoja de un modelo y la de mostrar u ocultar (se elige el primer modelo de la lista).
ESCENARIOS.push(
  {
    id: "vitrina.hoja-modelo",
    ruta: "/tienda-web/vitrina",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Vitrina web · la hoja de un modelo (mostrar, Lo nuevo y lo que ve el cliente)",
    async preparar(pagina) {
      await pagina.locator('[data-guia="vitrina.abrir"]').first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
  {
    id: "vitrina.lote-mostrar",
    ruta: "/tienda-web/vitrina",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Vitrina web · mostrar en la web los elegidos",
    async preparar(pagina) {
      await pagina.locator('[data-guia="vitrina.casilla"] input').first().check({ timeout: 8000 });
      await esperar(pagina, 600);
      await pagina.locator('[data-guia="vitrina.lote-mostrar"]').click({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
  // Vitrina web ▸ Esperan una talla (ADR-0408, actividad 12): la lista filtrada por «Ya llegaron» (la cifra que filtra, puesta) y la
  // búsqueda que no encuentra nada (el vacío con la lupa tachada).
  {
    id: "vitrina.esperan-llegaron",
    ruta: "/tienda-web/vitrina/esperan",
    cuentas: ["admin"],
    abre: '[data-guia="esperan.cifras"] button[aria-pressed=true]',
    nombre: "Esperan una talla · el filtro «Ya llegaron»",
    async preparar(pagina) {
      await pagina.locator('[data-guia="esperan.cifras"] button').filter({ hasText: /Ya llegaron/i }).first().click({ timeout: 8000 });
      await esperar(pagina, 900);
    },
  },
  {
    id: "vitrina.esperan-sin-coincidencias",
    ruta: "/tienda-web/vitrina/esperan",
    cuentas: ["admin"],
    abre: ".vacio",
    nombre: "Esperan una talla · una búsqueda que no encuentra nada",
    async preparar(pagina) {
      await pagina.locator('[data-guia="esperan.buscador"] input').first().fill("zzz-nada", { timeout: 8000 });
      await esperar(pagina, 900);
    },
  },
);

// Ventas ▸ Pedidos web (ADR-0408, actividad 8): la hoja de un pedido (por confirmar, «No se puede confirmar», ya confirmado con «Anular»,
// «Reservarla») y la de enviar a otra tienda. Solo por id: la base local no trae pedidos web (los separa un cliente en la tienda online); quien audita
// los crea con `crear_pedido_web` en la sede de la cuenta (y los deja como estaban). Ninguno guarda: abren y cambian de vista.
const abrirPedidoWeb = async (pagina) => {
  await pagina.locator('[data-guia="pedidos-web.abrir"]').first().click({ timeout: 8000 });
  await pagina.locator("[role=dialog]").first().waitFor({ timeout: 15000 });
  await esperar(pagina, 1200);
};
ESCENARIOS.push(
  { id: "pedidos-web.confirmar", soloPorId: true, ruta: "/tienda-web/pedidos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Pedidos web · la hoja de un pedido por confirmar", preparar: abrirPedidoWeb },
  { id: "pedidos-web.no-confirmar", soloPorId: true, ruta: "/tienda-web/pedidos", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Pedidos web · «No se puede confirmar» (el motivo)", preparar: secuencia(abrirPedidoWeb, clicRol("button", /^No se puede confirmar$/)) },
  {
    id: "pedidos-web.anular",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · un pedido confirmado y «Anular» (el motivo)",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=cobrar"), abrirPedidoWeb, clicRol("button", /^Anular$/)),
  },
  {
    // Una prenda que estaba por conseguir y ya llegó a la tienda: «Reservarla» abre su paso (de dónde sale y quién).
    id: "pedidos-web.reservar",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · reservar lo que llegó",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=cobrar"), abrirPedidoWeb, clicRol("button", /^Reservarla$/)),
  },
  {
    id: "pedidos-web.enviar",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · enviar a la tienda del pedido",
    async preparar(pagina) {
      await pagina.locator('[data-guia="pedidos-web.enviar"]').first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
);

// Vitrina web ▸ Looks (ADR-0408, actividad 11): la hoja de un look nuevo, la de uno que ya existe y la de mostrar u ocultar. Las dos
// últimas necesitan un look en la base local (se elige el primero de la lista).
ESCENARIOS.push(
  {
    id: "looks.nuevo",
    ruta: "/tienda-web/vitrina/looks",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Vitrina web ▸ Looks · la hoja de un look nuevo",
    async preparar(pagina) {
      await pagina.locator('[data-guia="looks.nuevo"]').first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
  {
    id: "looks.editar",
    ruta: "/tienda-web/vitrina/looks",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Vitrina web ▸ Looks · la hoja de un look (sus prendas, si se ve y su lugar)",
    async preparar(pagina) {
      await pagina.locator('[data-guia="looks.abrir"]').first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
  {
    id: "looks.mostrar",
    ruta: "/tienda-web/vitrina/looks",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Vitrina web ▸ Looks · mostrar u ocultar un look",
    async preparar(pagina) {
      await pagina.locator('[data-guia="looks.interruptor"] button').first().click({ timeout: 8000 });
      await esperar(pagina, 1200);
    },
  },
);

// Cobrar dentro del pedido web (ADR-0408, actividad 9): «Registrar un pago» encima del primer pedido de «Por cobrar» (con Yape y su n.º,
// o con efectivo) y «Devolver un pago» de un pedido anulado que ya había pagado (el primero de «Cerrados»). Solo por id: la base local
// necesita esos pedidos (quien audita los crea con `crear_pedido_web`, los confirma y les anota un pago; y los deja como estaban). Ninguno
// guarda: abren la hoja y eligen.
const abrirRegistrarPago = async (pagina) => {
  await pagina.locator('[data-guia="pedido-web.pagar"]').first().click({ timeout: 8000 });
  await pagina.getByRole("dialog", { name: "Registrar un pago" }).waitFor({ timeout: 15000 });
  await esperar(pagina, 1000);
};
const conPedidoPorCobrar = secuencia(irA("/tienda-web/pedidos?pestana=cobrar"), abrirPedidoWeb, abrirRegistrarPago);
ESCENARIOS.push(
  {
    id: "pedidos-web.pagar",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · registrar un pago con Yape (el n.º de operación)",
    preparar: secuencia(conPedidoPorCobrar, clicRol("radio", /^Yape$/)),
  },
  {
    id: "pedidos-web.pagar-efectivo",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · registrar un pago en efectivo (entra a la caja)",
    preparar: secuencia(conPedidoPorCobrar, clicRol("radio", /^Efectivo$/)),
  },
  {
    id: "pedidos-web.devolver",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · devolver un pago de un pedido anulado",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=cerrados"), abrirPedidoWeb, clicRol("button", /^Devolver$/)),
  },
);

// Entregar un pedido web (ADR-0408, actividad 10): la hoja de un pedido pagado y listo (su boleta, el código y «Entregar») y la misma con
// un código escrito. Solo por id: la base local necesita un pedido pagado completo en «Por entregar» (quien audita lo crea, lo confirma y
// lo paga con la caja abierta; y lo deja como estaba). Ninguno guarda: abren la hoja y escriben.
ESCENARIOS.push(
  {
    id: "pedidos-web.entregar",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · entregar un pedido pagado (la boleta y el código)",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=entregar"), abrirPedidoWeb),
  },
  {
    id: "pedidos-web.entregar-codigo",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · entregar con el código escrito",
    async preparar(pagina) {
      await secuencia(irA("/tienda-web/pedidos?pestana=entregar"), abrirPedidoWeb)(pagina);
      await pagina.locator('[data-guia="pedido-web.codigo"] input').first().fill("1234", { timeout: 8000 });
      await esperar(pagina, 600);
    },
  },
);

// Anular un pedido web PAGADO (ADR-0408, 20261015114000): la hoja «Anular el pedido» encima del primer pedido de «Por entregar» (lo que
// pasa con sus prendas, su plata y su boleta), la misma con un motivo elegido, y un pedido pagado y anulado en «Cerrados» (lo devuelto
// y cómo quedó su boleta). Solo por id: la base local necesita un pedido pagado completo y otro anulado después de pagarse (quien
// audita los crea, los confirma, los paga y anula uno; y los deja como estaban). Ninguno guarda: abren la hoja y eligen.
const abrirAnularPedido = async (pagina) => {
  await pagina.locator('[data-guia="pedido-web.anular-pagado"]').first().click({ timeout: 8000 });
  await pagina.getByRole("dialog", { name: "Anular el pedido" }).waitFor({ timeout: 15000 });
  await esperar(pagina, 1000);
};
ESCENARIOS.push(
  {
    id: "pedidos-web.anular-pagado",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · anular un pedido pagado (sus prendas, su plata y su boleta)",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=entregar"), abrirPedidoWeb, abrirAnularPedido),
  },
  {
    id: "pedidos-web.anular-pagado-motivo",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · anular un pedido pagado con su motivo elegido",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=entregar"), abrirPedidoWeb, abrirAnularPedido, clicRol("radio", /^El cliente desistió$/)),
  },
  {
    id: "pedidos-web.anulado-pagado",
    soloPorId: true,
    ruta: "/tienda-web/pedidos",
    cuentas: ["admin"],
    abre: "[role=dialog]",
    nombre: "Pedidos web · un pedido pagado y anulado (lo devuelto y cómo quedó su boleta)",
    preparar: secuencia(irA("/tienda-web/pedidos?pestana=cerrados"), abrirPedidoWeb),
  },
);

// Con la caja de la sede CERRADA: Vender cuelga la persiana (ADR-0301) y /caja pide abrirla. Solo por id (`--escenario`): necesitan que el
// Postgres local tenga la caja de la sede cerrada, y quien audita la cierra y la restaura a mano (ver el ADR-0336, «Cómo se verificó»).
ESCENARIOS.push(
  { id: "caja.cerrada-vender", soloPorId: true, ruta: "/vender", cuentas: VENDEDORAS, ancho: "escritorio", abre: ".caja-cerrada", nombre: "Vender · con la caja cerrada (la persiana y el cartel)", async preparar(pagina) { await esperar(pagina, 2200); } },
  { id: "caja.cerrada-vender-m", soloPorId: true, ruta: "/vender", cuentas: VENDEDORAS, ancho: "celular", abre: ".caja-cerrada", nombre: "Vender (celular) · con la caja cerrada", async preparar(pagina) { await esperar(pagina, 2200); } },
  { id: "caja.cerrada-abrir", soloPorId: true, ruta: "/caja", cuentas: CAJEROS, ancho: "escritorio", nombre: "Caja · con la caja cerrada (abrir la caja)", async preparar(pagina) { await esperar(pagina, 1200); } },
);

// ---------- Cobros con máquina y el depósito a Interbank (ADR-0429) ----------
// La hoja de cobro pregunta «¿Con qué máquina la tarjeta?» solo donde la tienda tiene dos (Trujillo: Vendemás e Izipay): la ve Micaela
// (integrante). Se audita con la otra máquina marcada, en escritorio y en el celular. En Cuentas y dinero, el depósito de la máquina
// con los días que cubre (el combo «De» en Vendemás, la que tiene cobros en la base local) y, en Configuración, la tarifa de una
// máquina (los dos, solo el líder).
const elegirOpcion = (combo, opcion) => async (pagina) => {
  await pagina.getByRole("combobox", { name: combo }).first().click({ timeout: 8000 });
  await esperar(pagina, 500);
  await pagina.getByRole("option", { name: opcion }).first().click({ timeout: 8000 });
  await esperar(pagina, 900);
};
const marcarIzipay = async (pagina) => {
  await pagina.getByRole("radio", { name: /Izipay/ }).first().click({ timeout: 8000 });
  await esperar(pagina, 700);
};
ESCENARIOS.push(
  { id: "vender.cobro-tarjeta-maquina", ruta: "/vender", cuentas: ["integrante"], ancho: "escritorio", abre: "[data-maquinas]", nombre: "Vender (Trujillo) · «¿Con qué máquina la tarjeta?» con Izipay marcada", preparar: secuencia(medio(/Tarjeta/i), marcarIzipay), limpiar: quitarAsesora },
  { id: "vender.m-cobro-tarjeta-maquina", ruta: "/vender", cuentas: ["integrante"], ancho: "celular", abre: "[data-maquinas]", nombre: "Vender (Trujillo, celular) · cobro con tarjeta y «¿Con qué máquina?»", preparar: secuencia(cobroCelular, clicRol("button", /^Tarjeta$/i), marcarIzipay), limpiar: quitarAsesora },
  { id: "dinero.deposito-maquina", ruta: "/finanzas/dinero", cuentas: FIN, abre: '[data-guia="fin-dinero.mov-lotes"]', nombre: "Cuentas y dinero · «Depósito de la máquina» con los días que cubre", preparar: secuencia(clicRol("button", /Registrar movimiento/i), elegirOpcion(/^Qué pasó/i, /Depósito de la máquina/i), elegirOpcion(/^De$/, /Vendemás/i)) },
  { id: "configuracion.maquina-tarifa", ruta: "/configuracion", cuentas: ["admin"], abre: "[role=dialog]", nombre: "Configuración ▸ Cuentas y cobros · «Tarifa de Izipay»", preparar: secuencia(clicPestana(/Cuentas y cobros/i), clicRol("button", /Editar la tarifa de Izipay/i)) },
);

export const escenariosDe = (ruta, cuentaClave, celular = false) =>
  ESCENARIOS.filter(
    (e) => e.ruta === ruta && (!e.cuentas || e.cuentas.includes(cuentaClave)) && (!e.ancho || (e.ancho === "celular") === celular),
  );
