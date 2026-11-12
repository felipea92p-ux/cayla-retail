## 📦 Recibir lo que mandó Compras · corrida de `/flujo-de-negocio` y «faltaron» de Mis envíos (2026-11-12) — rama `claude/mis-envios-faltaron-reales`

Caso: `docs/flujos/recibir/con-aviso-de-compras.md` (aprobado por Felipe el 2026-11-12). Informe completo, fuera de git:
`.flujo-de-negocio/informes/con-aviso-de-compras-ef26a8a0.md` (en el worktree donde se corrió).

- [x] **«Mis envíos» decía «faltaron 10» con 1 faltante.** `fn_mis_envios` lee lo que faltó y sobró de `despacho_diferencias_vigentes` y «contadas» es
  todo lo contado (migración `20261112154000`); la pantalla dice «faltó 1 · 2 de más».
- [ ] **`20261112154000` no está en producción.** Una parte: solo `create or replace function` y sus permisos. Compatible en los dos órdenes de publicación.

### Decisiones de Felipe (reglas de negocio)

- [ ] **Lo que sobra en un envío de Compras exige costo para cerrar**, salvo «Regalo» (`lib/recepcion-conteo-reglas.ts:1063`). La colaboradora no
  lo sabe y tiene que inventarlo. Propuesta: una causa «Lo confirma Compras» que cierre y le deje a Compras el costo pendiente. Toca la base
  (`cerrar_conteo_envio`) y el dinero.
- [ ] **La dañada no se ve después de marcarla.** La base la manda a Cuarentena, pero la pantalla sigue diciendo «Llevar al stock · 6» y «6 ya están en
  el stock». Con la prenda «para después», «Llegó dañada» está apagado (ya anotado en el backlog de ADR-0645).
- [ ] **El Inicio no avisa que llegó un envío de Compras.** «Mercadería por recibir» cuenta solo facturas (`lib/inicio-avisos.ts:464`); con ENV-001652
  en camino, «Te toca» decía «Nada pendiente».
- [ ] Al cerrar, se crearon la compra de CAYLA SAC y un «Fondo · Felipe Alvarez» (`cuentas_dinero`, firmado por quien recibe) aunque la compra se marcó
  «Paga Compras». La de Textiles Andina, con todo «para después», no apareció en `compras`. Sin verificar si es el diseño.

### De una pantalla (se pueden hacer sin regla nueva)

- [ ] «Ya la tenemos» (Algo que no estaba en la guía): el buscador ordena pero no filtra, y el contador sigue en «13 prendas».
- [ ] Cambiar «¿Qué pasó?» de un sobrante borra lo escrito en «¿Qué pasó exactamente?».
- [ ] El botón que abre «Algo que no estaba en la guía» se llama «Agregar categoría».
- [ ] Crear una prenda al recibir muestra un paso «Precio» que «Seguir» se salta.
- [ ] El trayecto dice «Contando · 16 de 15» sin decir que faltó 1 y sobraron 2.
- [ ] La fila del envío en Recibir dice solo «CAYLA» de marca; el proveedor sin marca, que trae 10 de 15, no sale en el título.
- [ ] Mis compras: al cerrar el aviso de caja con «Más tarde», el clic pareció llegar a «Es una marca nueva», que estaba debajo. Visto una vez.

### Del laboratorio

- [ ] `scripts/flujo-de-negocio/espejo.mjs:251` se cae en un worktree: une con `join` la ruta absoluta que da `git rev-parse --git-path`. Usar
  `--path-format=absolute` (o `resolve`). La foto del 2026-11-12 se registró a mano con los mismos datos.
- [ ] Restaurar la base con `estado.mjs` no borra el borrador de Recibir que queda en el navegador: la segunda pasada abre en «Revisa y cierra».
- [ ] El marcaje de prueba va con el id de sede de Dynamic (`ubicaciones.sede_dynamic_id`), no con el de retail; el caso `sin-aviso` no lo dice.
- [ ] Levantar la web con `pnpm` de `~/.local/bin` reescribe `pnpm-lock.yaml` (quita `@pnpm/exe`).
