## 🧾 Un cambio con diferencia de precio emite sus comprobantes (2026-11-16) — decidido, sin construir; rama `claude/cambio-prendas-diferencia-precio-e926d7`

**El problema.** Hoy un cambio cobra o devuelve la diferencia (contra lo pagado, ADR-0380; el mismo modelo conserva su descuento,
ADR-0655), pero no emite ningún comprobante: la boleta original sigue diciendo la prenda y el monto de antes, y lo cobrado de más entra
sin documento. En producción, al 2026-11-16: 25 cambios desde el 2026-10-04, 13 con diferencia (11 cobraron S/ 209.70, 2 devolvieron
S/ 10.10), 24 sobre una boleta aceptada y 1 sobre una nota de venta. Las series de nota de crédito (BC04/BC05/BC06, FC04/FC05/FC06) ya
están activas y hay una nota de crédito aceptada por SUNAT.

**Por qué no se «anula» la boleta.** Una baja le dice a SUNAT que la venta nunca existió (ADR-0016, ADR-0065); en un cambio la venta sí
existió. Lo que corresponde es una nota de crédito sobre la boleta original y un comprobante nuevo por lo que se lleva.

### Decisiones de Felipe (2026-11-16, en el chat)

- [x] **Cuándo:** si la diferencia no es cero (más cara o más barata), se emiten comprobantes. Mismo precio, o el mismo modelo en otra
      talla o color sin diferencia: no se emite nada. El stock se mueve igual que hoy.
- [x] **Mismo modelo con una talla más cara** (2 de 631 modelos): si se cobra algo, también se emite.
- [x] **Lo que sobra cuando la nueva es más barata:** siempre se devuelve en dinero, como hoy. La nota de crédito es el papel que lo respalda.
- [x] **Quién:** cualquiera que vea Cambios, sin aprobación del líder (R-38).
- [x] **Boleta original aún no aceptada por SUNAT:** el cambio se hace al momento y el comprobante nuevo sale siempre al momento (SUNAT
      pide emitirlo al entregar); solo la nota de crédito espera a que SUNAT acepte la original (Felipe lo corrigió con la crítica).
- [x] **Compra original con nota de venta:** sale una nota de venta nueva por lo que se lleva, sin nota de crédito.
- [x] **Compra original con factura:** nota de crédito sobre la factura y factura nueva al mismo RUC.
- [x] **A nombre de quién:** la nota de crédito, siempre de quien compró (SUNAT). El comprobante nuevo se llena con el mismo cliente y se
      puede cambiar ahí mismo (un regalo).
- [x] **Metas:** la venta original queda con su asesora. Si la nueva es más cara, la diferencia la suma quien atiende el cambio; si es
      más barata, se le resta a quien hizo la venta original (Felipe lo corrigió al ver los 2 casos negativos reales).
- [x] **Cambios ya hechos:** se aplica desde que se publique. La lista de los 13 con diferencia se le entregó a Felipe para el contador
      (fuera del repo: es público).
- [x] **Volver a cambiar lo que se llevó en un cambio:** se podrá, dentro de los 15 días de la compra original. Hoy el sistema no lo
      permite en ningún caso (la línea queda agotada con el primer cambio): es una obra aparte.

### Diseño (técnico, del arquitecto)

- Los comprobantes **cuelgan del cambio**, no de una venta nueva (`comprobantes.cambio_id`). Así el camino del stock no se toca, la regla
  «una venta, un comprobante vivo» (INV-06) sigue cierta y las metas cuentan la diferencia sin restar a nadie.
- Regla única: `cambios.diferencia <> 0` → documentos. Nota de crédito por lo pagado de lo devuelto, con solo esos ítems (como
  ADR-0382); comprobante nuevo por todo lo que se lleva, a su precio de cambio. Comprobante nuevo − nota de crédito = diferencia.
- Se reservan en Postgres dentro del mismo guardado (o quedan «por emitir» hasta que la original esté aceptada); se transmiten por el
  envío y la cola que ya existen. Si Lucode no responde, el cambio no se pierde ni se deshace.

### Hecho (2026-11-16, commits locales, sin PR)

- [x] Base (partes 1 y 2): los documentos del cambio, candados de anular/liberar, `previsualizar_documentos_cambio`, la sonda.
      `pnpm pruebas:cambio-con-comprobantes` 20/20 (con mutante); 31 suites vecinas en verde en una base aislada (5 ajustadas).
- [x] Envío a SUNAT: `/api/lucode/emitir {cambio_id}` y el barrido que emite las notas pendientes.
- [x] Pantalla de Cambios: bloque «Comprobantes», cliente editable, ticket con los documentos reales y la boleta en la térmica.
- [x] Comprobantes: «Cambio de B001-…», sin Anular ni Liberar en lo que sale de un cambio.
- [x] Parte 3: INV-30, INV-22 sin falso positivo y `fn_diferencias_de_cambio` (sin conectar). `pnpm pruebas:cambio-con-comprobantes-vigia` 33/33.
- [x] Probado en el navegador contra la base aislada y el Lucode falso: boleta aceptada (nota 06 + boleta nueva al momento, los dos
      aceptados) y boleta sin aceptar a 375 px (boleta nueva al momento; la nota «Por emitir», la emitió el barrido al aceptarse la
      original). Vigía: INV-06, 07, 22 y 30 en verde. Web: 168 601 pruebas en verde.

### Pendiente

- [ ] **Felipe:** las dos reglas PROVISIONALES de metas (venta sin asesora; CAYLA y CLAURE en la misma sede) y conectar los ocho lectores
      de metas a `fn_diferencias_de_cambio` (Rendimiento es del plan de Dany: avisar).
- [ ] **Felipe:** `fn_claure_cambios` valora un cambio por varias del mismo modelo a precio de lista (anterior a este ADR, plata de CLAURE).
- [x] PR #1912 abierto (borrador). Probado en el sandbox real de Lucode desde local (la vista previa no tiene token): nota 07 de una
      prenda, nota 06 y nota de factura, con sus comprobantes nuevos: los nueve documentos ACEPTADO.
- [x] El `.env.local` con el token (el mismo de producción) se borró al terminar la prueba del sandbox.
- [x] `/milimetro` y `/chaos` en `/cambios` y `/vender/comprobantes` (2026-11-16). Arreglado: el foco con teclado de la hoja de opciones
      de Comprobantes y las dos carreras de gravedad 1 (liberar o anular la boleta mientras se guarda un cambio), con INV-30 ampliado.
- [x] Los tres de gravedad 2 de `/chaos` en Cambios (Felipe: «Sí, arréglalos»): sobre S/ 700 no pasa un documento de un solo carácter
      repetido; el nombre del padrón se borra al cambiar de DNI (también en Vender); el nombre tiene tope de 200 en la caja y en la base.
      Casos 23 y 24 de `pruebas:cambio-con-comprobantes`. Probado en el navegador con el padrón simulado; a 375 px no se volvió a mirar
      (no cambia el diseño).
- [x] `/milimetro`: el grave de Cambios es del sistema (etiquetas de 11 px en la hoja de vidrio a 4.47:1): anotado como propuesta a `/color`
      en `docs/milimetro/propuestas.md` (2026-11-17).
- [ ] `/milimetro`, tres medios de esta obra: dos «Enviar por WhatsApp», el nombre del campo en la guía, «Espera a SUNAT» contra «Por emitir».
- [ ] `/formidable` y `guias:recorrer`.
- [x] De #1910 (Felipe eligió esta rama): el papel de Vender con «CANCELADO» y la impresión sola con «Imprimir solo al cobrar».
- [x] CI, tanda 4 (`pruebas:redondeo-efectivo`): al volver a pegar 20261003130000 y 20261003135000, `REHACER_TOKEN` volvía a pegar la
      parte 2 del token, que ancla `registrar_cambio` con la firma que la parte 2 de este ADR borra. Ahora se ancla a la firma que haya
      (`registrar-venta-antes-de-precio-sede.mjs`). En un banco limpio con las tres partes: 90/90; sin el arreglo, los mismos 2 rojos del CI.
- [ ] **Contador:** confirmar la lectura legal (nota de crédito + comprobante nuevo); el SQL ya está en producción. Cerrar #1910 lo decide Felipe.
- [x] Pegado en producción el 2026-11-17 (Felipe lo pidió): versiones `20261117141105`, `20261117141259` y `20261117141607` (apply_migration),
      huellas comprobadas contra la base aislada. Desde ahí la base emite; la web de esta obra todavía no está publicada.
- [ ] Refrescar el volcado y correr `pnpm datos:generar:produccion` y `pnpm datos:comparar` (las tablas y funciones nuevas entran al diccionario).
- [x] Destrabado el check «SQL pegado» con #1918 (Felipe: #1912 primero, con puente): `20261117143000_puente_baja_de_comprobante_0673.sql`
      trae lo de ADR-0673 a esta rama; en producción no hace nada (no hace falta pegarlo).
- [ ] **#1918** tiene que anclar su revisión de sede antes de «¿está aceptado?» (se le pidió a su sesión el 2026-11-17): si no, una base nueva
      queda distinta de producción y volver a pegar su migración repite la revisión. Se fusiona después de #1912.
- [ ] Obra aparte: volver a cambiar lo que se llevó en un cambio (15 días desde la compra original).
