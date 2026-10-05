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

export const escenariosDe = (ruta, cuentaClave, celular = false) =>
  ESCENARIOS.filter(
    (e) => e.ruta === ruta && (!e.cuentas || e.cuentas.includes(cuentaClave)) && (!e.ancho || (e.ancho === "celular") === celular),
  );
