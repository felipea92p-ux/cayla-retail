## 📦 Recibir lo que mandó Compras · corrida de `/flujo-de-negocio` y «faltaron» de Mis envíos (2026-11-12) — rama `claude/mis-envios-faltaron-reales`

Caso: `docs/flujos/recibir/con-aviso-de-compras.md` (aprobado por Felipe el 2026-11-12). Informe completo, fuera de git:
`.flujo-de-negocio/informes/con-aviso-de-compras-ef26a8a0.md` (en el worktree donde se corrió).

- [x] **«Mis envíos» decía «faltaron 10» con 1 faltante.** `fn_mis_envios` lee lo que faltó y sobró de `despacho_diferencias_vigentes` y «contadas» es
  todo lo contado (migración `20261112154000`); la pantalla dice «faltó 1 · 2 de más».
- [x] **PEGADA (2026-11-12): `20261112154000` está en producción.** Con el OK de Felipe, después de fusionar el PR #1793: el archivo subido al SQL
  Editor con su huella SHA-256 comprobada (39acfeec…), «Success». Verificado en solo lectura: la función lee `faltaron`, `sobraron` y `despacho_conteos`,
  sigue `security definer`, la ejecutan `authenticated` y no `anon`. Hoy ningún envío recibido de producción contó más de lo que entró al stock: la
  corrección rige para los próximos.

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

## 📦 Las 11 notas de Felipe al recibir ENV-001660 (2026-11-12, ADR-0649) — rama `claude/mis-envios-faltaron-reales`

- [x] Hojas al centro en Recibir · Etiquetas vuelve al envío · «Llevar al stock» a la par · tabla de tallas con Tab, − y +, total, 0 centrado y «Llenar todas
  con» · carta de colores de claro a oscuro · mezclas en la misma carta · contador lado a lado · «Lo que anotó Compras» · pie sin Anterior/Siguiente · hoja
  del envío por proveedor · «Revisa y cierra» rediseñada · el paso del precio que se saltaba · «60 de 119» desfasado.
- [ ] **El dial del contador no hidrata igual:** las rayas del aro (`components/recepcion-conteo/Dial.tsx`, coordenadas con `Math.cos`) salen con otro
  redondeo en el servidor y en el navegador («A tree hydrated but some attributes…»). Redondear las coordenadas a 2 decimales en los dos lados.
- [ ] **`HojasAlCentro` solo en Recibir.** Felipe: «es un problema que tienen la mayoría de modales». Llevarlo al marco cuando se decida pantalla por pantalla.
- [ ] **Dynamic:** tarea de `Modal.tsx` + `HojasAlCentro.tsx` (el contexto que recentra la hoja); `recibir-mesa.css` se mira.
- [ ] **A 1440×900 con la lista abierta** todavía hay que bajar ~90 px para ver «¿Pasó algo con esta prenda?». En la pantalla de Felipe cabe.
- [ ] Vender, Caja y Bajar al piso siguen `pendiente` en la guía de foco (deuda de antes; esta rama solo les tocó una `key` y el `?envio=`).
