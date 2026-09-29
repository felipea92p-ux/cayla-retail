// Pantalla registrada: Inventario ▸ Conteo (rediseño 2026-09-29, ADR-0277).
//
// Tres escenarios: el Inicio (formulario para abrir, o la tarjeta «en curso» si ya hay un conteo abierto), Contar y Revisar.
// Los dos últimos necesitan un conteo abierto: si no hay uno, ABREN uno de la primera sububicación (almacén) en la base
// LOCAL y lo dejan abierto; si ya hay uno, lo reutilizan. Para limpiarlo: «Cancelar conteo» en la pantalla, o
// `anular_conteo` desde psql. Nunca corras este gate contra una base que no sea la local.
//
// Un conteo real trae hasta ~1.100 variantes, así que la pantalla de Contar es la más sensible al ancho: cuatro columnas
// (Talla · Debe haber · Contaste · Estado) que siguen legibles a 320 px. Por eso usa la matriz completa de viewports.

/** Entra a la pantalla de Contar desde `/inventario/conteo`: sigue el conteo abierto o abre uno de almacén. */
async function entrarAlConteo(pagina) {
  const seguir = pagina.getByRole("link", { name: "Seguir contando" });
  if ((await seguir.count()) > 0) {
    await seguir.first().click();
  } else {
    await pagina.getByRole("radio", { name: /Almacén de tienda|Piso de venta/ }).first().click();
    await pagina.getByRole("button", { name: "Empezar conteo" }).click();
  }
  await pagina.waitForURL(/\/inventario\/conteo\/[0-9a-f-]{36}$/);
  await pagina.waitForSelector('input[aria-label^="Contaste"]');
}

/** @type {import('./registro.mjs').Pantalla} */
const pantallaConteo = {
  id: "inventario.conteo",
  nombre: "Conteo",
  modulo: "inventario",
  ruta: "/inventario/conteo",
  viewports: "matriz",
  escenarios: [
    { id: "inicio", nombre: "Inicio (formulario o conteo en curso)" },
    {
      id: "contar",
      nombre: "Contar (abre un conteo de almacén si no hay uno)",
      async preparar(pagina) {
        await entrarAlConteo(pagina);
      },
    },
    {
      id: "revisar",
      nombre: "Revisar conteo",
      async preparar(pagina) {
        await entrarAlConteo(pagina);
        await pagina.getByRole("button", { name: "Revisar conteo" }).click();
        await pagina.waitForURL(/\/revisar$/);
        await pagina.getByRole("heading", { name: "Revisar conteo" }).waitFor();
      },
    },
  ],
};

export default pantallaConteo;
