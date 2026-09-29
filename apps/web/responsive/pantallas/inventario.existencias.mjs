// Pantalla registrada: Inventario ▸ Existencias — ver `responsive/README.md`.
//
// Cubre, en un solo registro, los cuatro tipos de UI que pide la primera validación del motor:
// tarjetas (Prioridades de hoy), tabla/listado (Por prenda y Por talla), filtros (buscador +
// combos, incluido el botón "Filtros" del celular) e interacción (el cajón de la prenda).

/** @type {import('./registro.mjs').Pantalla} */
const pantallaExistencias = {
  id: "inventario.existencias",
  nombre: "Existencias",
  modulo: "inventario",
  ruta: "/inventario",
  // Matriz completa: es la pantalla de referencia de la primera corrida.
  viewports: "matriz",
  escenarios: [
    {
      id: "por-prenda",
      nombre: "Por prenda (inicial)",
      // Sin preparar(): valida el estado con el que carga la ruta.
    },
    {
      id: "por-talla",
      nombre: "Por talla",
      async preparar(pagina) {
        await pagina.getByRole("button", { name: "Por talla", exact: true }).click();
        await pagina.waitForTimeout(200);
      },
    },
    {
      id: "filtros-movil",
      nombre: "Filtros (botón del celular)",
      async preparar(pagina) {
        // El botón "Filtros" que pliega los combos en celular (InventarioPanel.tsx) solo
        // existe/se ve por debajo de cierto ancho: si no está visible, el escenario no hace
        // nada y queda equivalente al inicial en escritorio — no es un fallo.
        const boton = pagina.getByRole("button", { name: "Filtros", exact: true });
        if (await boton.isVisible().catch(() => false)) {
          await boton.click();
          await pagina.waitForTimeout(200);
        }
      },
    },
    {
      id: "busqueda",
      nombre: "Buscador con resultados filtrados",
      async preparar(pagina) {
        await pagina.locator('input[placeholder^="Buscar prenda"]').fill("Pantalón");
        await pagina.waitForTimeout(300); // el filtro es en vivo, sin botón "Buscar"
      },
    },
    {
      id: "cajon-abierto",
      nombre: "Cajón de la prenda abierto",
      async preparar(pagina) {
        // Acotado a <main>: el mismo prefijo de aria-label ("Abrir ") también lo usa el botón
        // de hamburguesa del AppShell ("Abrir menú"), fuera de <main> — sin acotar, `.first()`
        // en celular abre el menú lateral en vez de la fila de la prenda.
        await pagina.locator('main [aria-label^="Abrir "]').first().click();
        await pagina.waitForTimeout(400); // anim-cajon (ADR-0136): la hoja sube y crece
      },
    },
  ],
};

export default pantallaExistencias;
