## Auditoría de Mis compras (2026-10-27) — pendiente
**Antes de pegar la migración `20261027231000`:** esperar el CI de Postgres (las pruebas nuevas no se corrieron localmente: Docker no respondió). Después de pegarla, refrescar el volcado (hay una función nueva, `fn_ronda_compras_candado`). Detalle en `docs/adr/0543-mis-compras-candados-de-la-auditoria-2026-10-27.md`.

**Decisiones de Felipe (dinero y permisos), sin hacer a propósito:**
- H4: un gasto mal tecleado no se puede corregir (Compras lo pasa tal cual; plata y compras sí se corrigen al confirmar o completar). ¿`p_monto` en `revisar_gasto_compra`?
- H5: el estado `anulado` de `compra_papeles` y `compra_gastos` se lee en 8 funciones y nadie lo escribe; una compra, gasto o plata anotada por error no tiene salida. ¿Se crean `anular_compra_rapida` / `anular_gasto_rapido` (y su pantalla), o «anotado = inmutable» queda escrito?
- H6: con «devuelvo S/ 100» ya cerrado, esos S/ 100 siguen en «Tienes para comprar» hasta que Compras los recibe.
- H7: si Compras baja el monto de un papel (S/ 100 → S/ 80), el celular de la compradora y los libros dejan de coincidir.
- H8: ¿los costos se anotan con o sin IGV? Pregunta de negocio; una factura puede salir siempre «No cuadra» por el 18 %.
- H9: quien tiene `ordenes_compra` o `fondos` puede leer todo el bucket `retail-gastos-viaje` (vouchers y papeles de otras compradoras y sedes).
- H12: «Falta mandar → no se puede cerrar la ronda» es solo de la pantalla; la RPC cierra con prendas sin mandar.
- H24: `fn_revisar_compras` y `fn_plata_por_confirmar` no se filtran por sede (¿`fondos` es de la central?).
- `devolver_fondo`: no devuelve más que lo entregado con movimiento; hoy el saldo inicial («Ya tenía») cuenta.
- H15/H18/H19/H20/H23: bajos; ver el informe y el ADR.

**Vínculos pendientes de producto:**
- «Pendientes de campaña» (ADR-0530) se confirman en `/compras/ordenes`, que no tiene entrada de menú desde ADR-0480: ¿se mudan a Mis compras o se devuelve «Órdenes» al menú?
- «Anular envío» vive solo en el detalle de la orden: Mis envíos muestra «Anulado» pero no tiene el botón. «Gasto del viaje» (Órdenes) duplica «Gasté en otra cosa»; «Tu fondo ▸ Rendir» convive con «Cerrar mi ronda».
- Compras no recibe aviso fuera de su pantalla de que hay plata, compras o gastos por revisar (Inicio y número en el menú).
- Los botones de confirmar plata «Ya tenía» se ofrecen a quien no es líder (la base ahora lo rechaza con una frase clara): falta que la pantalla lo sepa (`SedeActiva` no trae el rol).
- `filaPlata` (`lib/revisar-compras-reglas.ts`) dice «sin foto» aunque la foto exista y no se pudo firmar (`fotoNoAbrio`).

**Diseño pendiente:**
- «Rondas anteriores» queda antes que «Cerrar mi ronda» en el orden de Tab en celular (mover «Cerrar» después en celular es decisión de Felipe).
- B7: tres versiones del cuadro de foto grande (PlataPorConfirmar, GastosPorRevisar, PapelesPorCompletar); unificarlas cambia alturas de pantallas que ya pasaron `/formidable`.
- B14: `lg:top-40` de «Tu compra» deja ~3 px de solape; no se pudo medir.
- Helpers `numero`/`texto`/`normalizar` repetidos en ~81 archivos de `lib` (convención del repo).
- `/formidable` (prueba ciega y colaboradora real), `/chaos` y `/multi-view-responsive` sobre el módulo; correr `guias:recorrer` y `tema:auditar` (escenarios nuevos) con una base local.
- Los textos del `ya_estaba` de «Terminé de comprar hoy»: la web lo trata como éxito sin avisar que ya estaba cerrada.
