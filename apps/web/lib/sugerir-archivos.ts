// Registro de deuda de SUGERENCIAS (regla — CLAUDE.md «Sugerencias coherentes», ADR-0290, Felipe 2026-09-30).
//
// La regla: un ejemplo o texto de ayuda que la persona lee en un campo (placeholder, «Ej. …») tiene que ser coherente con lo que ya
// eligió antes. Uno escrito a mano en el JSX dice lo mismo elija lo que elija: si eligió «Casacas» y la caja de nombre le dice
// «Blusa Aurora», el sistema le está diciendo algo falso. Cómo se hace bien: skill `/sugerir` (.claude/skills/sugerir/SKILL.md).
//
// Cómo se vigila (`lib/sugerir.test.ts`, con el escáner `scripts/sugerir/escanear.mjs`): todo archivo de `components/` o `app/(app)/`
// con un ejemplo ESTÁTICO (literal en el JSX) tiene tres salidas, y ninguna es olvidarse:
//   1. derivarlo de la selección con lógica pura en `lib/sugerencias-<pantalla>.ts` (modelo: `lib/sugerencias-alta-producto.ts`);
//   2. si de verdad no depende de nada elegido antes, marcarlo en su línea con `// sugerir-fijo: <por qué>` (mínimo 10 caracteres);
//   3. estar en esta lista, que es la DEUDA de lo hecho antes de la regla. Un archivo NUEVO no puede entrar aquí.
//
// La lista solo baja: al arreglar un archivo, se borra de aquí y se baja `PENDIENTES_HOY` (la prueba exige la cuenta exacta, y también
// que un archivo listado siga teniendo el problema: así el tablero no miente ni en un sentido ni en el otro). `pnpm sugerir --todo` es
// el tablero completo; `/sugerir <ruta>` arregla una pantalla. La detección es por texto: un falso positivo (una frase que dice
// «por ejemplo») se resuelve con `sugerir-fijo`, no agregando el archivo a la deuda.

/** Cuántos archivos siguen con un ejemplo estático sin resolver. Baja a medida que se hacen; subir es romper la regla. */
export const PENDIENTES_HOY = 68;

/** Rutas relativas a `apps/web/`. */
export const ARCHIVOS_PENDIENTES: readonly string[] = [
  // ---- app/(app)/buscar/ ----
  "app/(app)/buscar/page.tsx",
  // ---- components/ ----
  "components/AbrirCajaFormV2.tsx",
  "components/ApartarModal.tsx",
  "components/BuscadorGlobal.tsx",
  "components/BuscadorHistorial.tsx",
  "components/CategoriasLista.tsx",
  "components/ClientaFichaModal.tsx",
  "components/ColaboradoresModales.tsx",
  "components/ColoresLista.tsx",
  "components/CompraDetallePanel.tsx",
  "components/CompraFormV2.tsx",
  "components/ComprobanteProduccionForm.tsx",
  "components/ComprobantesPanel.tsx",
  "components/ComprobantesProduccionPanel.tsx",
  "components/CotizacionesMaquilaPanel.tsx",
  "components/EditarMarcaModal.tsx",
  "components/EtiquetasLista.tsx",
  "components/FamiliasLista.tsx",
  "components/FiltrosCompras.tsx",
  "components/FiltrosMovimientos.tsx",
  "components/FiltrosProductos.tsx",
  "components/FiltrosRecibidas.tsx",
  "components/GastosFijosYActivos.tsx",
  "components/GastosPanel.tsx",
  "components/InsumoModales.tsx",
  "components/MarcasLista.tsx",
  "components/MediosDePago.tsx",
  "components/MovimientoCajaModal.tsx",
  "components/MovimientosLista.tsx",
  "components/NotasCreditoPanel.tsx",
  "components/NuevaOrdenProduccionForm.tsx",
  "components/NuevaProformaModal.tsx",
  "components/PagoPiezas.tsx",
  "components/PatronesLista.tsx",
  "components/PedirAOtraSedeModal.tsx",
  "components/PrendasDeEtiquetaModal.tsx",
  "components/ProductoForm.tsx",
  "components/ProveedorModal.tsx",
  "components/ProveedorProduccionModal.tsx",
  "components/ProveedoresProduccionPanel.tsx",
  "components/PuntoDeVentaTicket.tsx",
  "components/ReasignarReparto.tsx",
  "components/RecepcionEnvio.tsx",
  "components/RecepcionFormV2.tsx",
  "components/RecibirComprobanteModal.tsx",
  "components/RegistrarGastoModal.tsx",
  "components/RegistrarNotaCreditoModal.tsx",
  "components/RolesModales.tsx",
  "components/SaldoFavorAcciones.tsx",
  "components/SaldoFavorProveedor.tsx",
  "components/SalidasDeCaja.tsx",
  "components/SeriesPanel.tsx",
  "components/TallasLista.tsx",
  "components/TejidosLista.tsx",
  "components/TemporadasLista.tsx",
  "components/TerminalesModales.tsx",
  "components/TrasladoAnularModal.tsx",
  // ---- components/apartados/ ----
  "components/apartados/ApartarVista.tsx",
  "components/apartados/EntregarVista.tsx",
  "components/apartados/ModalesApartado.tsx",
  "components/apartados/TodosVista.tsx",
  // ---- components/finanzas/ ----
  "components/finanzas/ConfiguracionCuentas.tsx",
  "components/finanzas/CuentasDinero.tsx",
  "components/finanzas/EditarCuentaModal.tsx",
  "components/finanzas/SaldosArranqueModal.tsx",
  // ---- components/frescura/ ----
  "components/frescura/FrescuraPanel.tsx",
  // ---- components/punto-de-venta/ ----
  "components/punto-de-venta/ClientaDelTicket.tsx",
  "components/punto-de-venta/Esperas.tsx",
];
