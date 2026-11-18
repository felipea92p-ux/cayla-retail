# Plan técnico «Fijar precio con la cuenta única» (2026-11-15)

Borrador del planificador. Las correcciones del escéptico (`revision-esceptica.md`) mandan sobre este texto.

PLAN DE CONSTRUCCIÓN: «Fijar precio con la cuenta única» (estilo /construir)
Leído en origin/main 6465b4942 y en la maqueta docs/maquetas/precio-sugerido-2026-11/index.html (sin commit, solo en este worktree). La maqueta define las reglas: `piso()` en :208, `techo()` en :210, `avisosDeCosto()` en :234 y el veredicto en :247-307.

Cómo leer el orden. Pediste: primero lo que está mal hoy, después los candados, después Recibir, después los otros tres frentes, después la base y al final unificar. Lo respeté con una excepción que manda la dependencia. El **techo** («Sugerido» por las parecidas) va DESPUÉS de corregir los costos ×1.18, porque su ventana de costo ±25 % no aguanta costos mezclados que difieren un 18 %. Hasta entonces, los cuatro frentes funcionan en el modo «sin datos» de la maqueta: piso, más la IA como segunda opinión.

---

## A0 · ADR, reservas, mediciones y preguntas: tamaño S, solo documentos
- **Para el negocio:** las 13 decisiones quedan escritas y nadie más toma estos números ni estos archivos.
- **Archivos:**
  - ADR nuevo con `pnpm reservar adr` (la última reserva en el remoto es adr-0667).
  - Reservar al empezar, con `pnpm reservar migracion`, las ~9 migraciones de A3, A4, A5, A11, A12 y A13.
  - Commit de `docs/maquetas/precio-sugerido-2026-11/`.
  - Una fila en `docs/SESIONES-ACTIVAS.md`.
  - `docs/bitacora/` y `docs/backlog/` del día.
- **Mediciones de solo lectura en producción, para el ADR:**
  1. Cuántas prendas pasan a ámbar con el piso nuevo, que es ≈ costo × 2.27. Hoy el ámbar está en «< 45 %».
  2. Si alguna alta de Nuevo producto con proveedor con RUC guardó el costo dividido (`NuevoProductoForm.tsx:585`).
  3. El nombre real del CHECK de `precio_propuestas`, con `pg_constraint`.
  4. `pg_get_functiondef` de `fn_recepcion_entrar`, `recibir_lote`, `cambiar_precio_en_recepcion`, `poner_precio_sede` y `validar_precios_en_recepcion`. Las anclas salen de ahí, nunca del repo: `fn_recepcion_entrar` ya tiene 5 parches vivos.
  5. Si las migraciones de #1369 (20261026180000 y 210000) están en producción.
  6. Si producción tiene ADR-0393 en todas partes, para poder borrar el camino viejo `HojaPrenda`.
- **Antes de A4/A5, Felipe tiene que contestar:**
  - (a) Quién confirma un costo dudoso. Hoy la base exige ver el dinero de Compras (`costo_atipico_sin_lider`). Recomiendo que confirme quien recibe, firmado con `fn_actor_persona_id(true)`.
  - (b) A5 da vuelta su decisión del 2026-10-11 («nadie baja del costo»). Hay que decidir si la caja (`venta_descuento_bajo_costo`) y el plan de campaña (`p_costo >= p_precio`, 20261005220000:236) se alinean o se quedan como están.
  - (c) Si el costo vacío sigue permitido en Nuevo producto.
  - (d) Cuando hay celdas con costo propio, si se muestra el peor veredicto (lo recomiendo) o el de arriba.
  - (e) Si la sesión vieja de Frescura (ADR-0208) sigue viva.
- **Antes de empezar:** que se fusione #1874 (toca `CerrarEnvio.tsx` y `recepcion-conteo-reglas.ts`).
- **Espera OK de Felipe:** sí, que apruebe el ADR.
- **Se rompe si:** dos sesiones reservan el mismo número a mano. La reserva en el remoto lo impide.

## A1 · Refactor neutro: la cuenta vive en un solo módulo (S)
- **Para el negocio:** nada cambia a la vista. Es el terreno para cambiar la cuenta en un solo lugar (Beck).
- **Archivos:**
  - Nuevo `apps/web/lib/cuenta-de-precio.ts`, en céntimos enteros.
  - Ahí se mudan `conRebajaCts`, `margenPorMilCts`, `aguantaCts` y `cuentaDeLinea`, que hoy están en `apps/web/lib/orden-compra-precio-ayuda.ts:195`, `:200`, `:207` y `:238`.
  - También se mudan `redondearA90` (`precio-propuesto-reglas.ts:23-32`) y la constante `IGV`.
  - `orden-compra-precio-ayuda.ts` y `margen-a-la-vista.ts:35` pasan a importar del módulo nuevo. Ese módulo nunca recibe `conFactura`, salvo el paso de transición que reproduce el comportamiento de hoy.
- **Migración:** no.
- **Pruebas:**
  - `lib/cuenta-de-precio.test.ts` reproduce `cuentaDeLinea(…, false, …)` al céntimo.
  - Las 65 aserciones de `orden-compra-precio-ayuda.test.ts` siguen verdes sin tocarlas.
  - `pnpm knip` y `pnpm knip:produccion`.
- **Cómo verifica Felipe:** no hay nada que ver. El PR muestra que ninguna prueba cambió de valor.
- **Riesgo:** bajo.
- **Skills:** /abrir-pr.
- **Espera OK:** no.
- **Se rompe si:** el módulo nuevo redondea distinto que el viejo en un céntimo. La prueba lo atrapa.

## A2 · Una sola cuenta: fuera «tiene RUC ⇒ factura» (M). Es lo que hoy está MAL
- **Para el negocio:** toda prenda se mide igual, con «Te quedan = precio ÷ 1.18 − lo que pagaste», y la Vitrina deja de mostrar como ganancia lo que en realidad se pierde.
- **Archivos:**
  - `margen-a-la-vista.ts`: `margenALaVista(costo, precio)` sin `conFactura`, y se borra `facturaDelEnvio` (:60).
  - En `cuenta-de-precio.ts` se agregan `teQuedan`, `conRebaja` (35 %, hacia abajo al S/ 0.10, ADR-0403), `pisoDePrecio` (el menor precio terminado en .90 que con 35 % de rebaja deja 20 %) y un `veredicto` de 3 tonos: pierdes, poca rebaja y buen precio. El tono pizarra llega en A12.
  - Se borran `costoRealCtsDe` y `conFactura` (`orden-compra-precio-ayuda.ts:226`), y el aviso «sin-factura».
  - `components/ui/LineaMargen.tsx:17,22`: se borran `FacturaDelMargen` y `useFacturaDelMargen`, y el texto pasa a «Te quedan S/ X».
  - `lib/recepcion-envio.ts:248` (`facturaDeLaCompra`) y `recibir/envio/[id]/page.tsx:88,110`.
  - `lib/marcas.ts:17` (el `ruc`, si queda huérfano).
  - `NuevoProductoForm.tsx:585-588,1336`.
  - `recepcion-vitrina-reglas.ts:31` (`caraDeVitrina` usa `teQuedan`; hoy resta `precio − costo` a secas).
  - `precio-propuesto-reglas.ts:115` (`pideRevisarAlRecibir`).
  - `PrecioDePrenda.tsx:96` y `CerrarEnvio.tsx:130,825`.
- **Migración:** no. La base sigue dividiendo hasta A11. Lo que se muestra queda correcto con la decisión 2, porque lo escrito es el total del papel.
- **Pruebas:**
  - `cuenta-de-precio.test.ts` con los 5 casos de la maqueta. Ejemplo: la Blusa Emma con costo S/ 36 tiene piso S/ 81.90, y a S/ 40 da «Pierdes».
  - Se reescriben `margen-a-la-vista.test.ts:44-55`, el `conFactura=true` de `orden-compra-precio-ayuda.test.ts` (reescribir, no «arreglar») y `recepcion-vitrina-reglas.test.ts`, que gana una prueba de margen.
  - knip.
- **Cómo verifica Felipe:** en Recibir, con un envío de un proveedor con RUC, el mismo costo y el mismo precio dan la misma cifra que con uno sin RUC. En Nuevo producto, elegir un proveedor con RUC ya no cambia el margen. En la Vitrina, una prenda a S/ 40 con costo S/ 36 dice «Pierdes».
- **Riesgo:** medio. El ámbar sale en más prendas: hay que publicarlo con la medición de A0. `LineaMargen` está en `components/ui/`, que Dynamic «mira»: el PR dice «queda como tarea allá».
- **Skills:** /milimetro auditar (cambian textos y tonos); /guia (cambian los textos de «30 %» de Recibir; la huella se acepta después de recorrer); /abrir-pr.
- **Espera OK:** no. Es la decisión 4, ya tomada, y no toca dinero guardado.
- **Se rompe si:** una pantalla sigue llamando la cuenta vieja con factura. Knip y la prueba de A1 lo marcan. También queda un caso conocido: el costo vigente leído de la base de las 9 prendas con factura (48 variantes) se ve un 18 % bajo hasta A11.

## A3 · Quien fija el precio ve el costo; el cliente nunca (M)
- **Para el negocio:** la terminal que recibe ve «Antes pagabas S/ X» bajo el costo. Vender, el ticket, la etiqueta y la tienda web siguen sin el costo, y una prueba lo vigila.
- **Archivos:**
  - RPC nueva `retail.fn_precio_referencia(p_ubicacion_id uuid, p_items jsonb)` en su v1, security definer y stable. La puerta es «puede fijar precio en esa hoja»: Recibir, Productos o Campañas. Por prenda devuelve el costo vigente, el subtotal sin IGV de su línea de orden, la banda p10–p90 de costo de su categoría (desde 5 prendas; si no hay, la de CAYLA) y `fuera_de_motores` (`fn_categoria_entra_a_motores`). Viene con `techo: null` y el motivo `sin_referencia`.
  - El prefijo `fn_` ya es de lectura (`espera-reglas.ts:58`).
  - Web: `CerrarEnvio.tsx:186,612` y `RecibirContando.tsx:357` leen esta RPC en vez de depender de `veDinero`.
  - `lib/costo-no-llega-al-cliente.test.ts`: un escáner que recorre `vender/`, `PuntoDeVenta*`, `LineaDelTicket`, `TicketPorSede`, `CambioTicket`, `vender/comprobantes` (`itemsParaLucode`), las etiquetas de precio (página y dos rutas api), `rotulos`, `VitrinaModeloHoja` y todo `apps/tienda`. Falla si alguno alcanza `cuenta-de-precio`, `CuentaDelPrecio`, `getCostosVariantes` o `fn_precio_referencia`, o si nombra `costo`.
- **Migración:** sí, una parte (crear la función y los grants; sin políticas ni `alter`). Se pega antes que la web.
- **Pruebas:**
  - Postgres: anon y authenticated no leen `variantes.costo`; la RPC le responde a la terminal de Recibir y rechaza a quien no ve Recibir, Productos ni Campañas. Va en una tanda de `scripts/ci/pruebas-postgres.mjs`.
  - `pnpm pruebas:roles-cobertura`.
  - `pnpm datos:comparar` después de pegar.
- **Cómo verifica Felipe:** entra como terminal de TRU a Recibir y ve «Antes pagabas S/ …» en una reposición. Abre Vender y la etiqueta y busca «costo»: no aparece.
- **Riesgo:** medio, porque es un cambio de permisos. Una terminal de Vender con Productos ve el costo en Catálogo, pero nunca en las pantallas de cara al cliente. La prueba vigila pantallas, no cuentas.
- **Skills:** /abrir-pr (con la sección «SQL para producción»).
- **Espera OK de Felipe:** sí, por los permisos y el SQL en producción.
- **Se rompe si:** alguien importa `cuenta-de-precio` en el ticket para «mostrar el ahorro». El escáner lo rechaza.

## A4 · Candados de costo (M/L). Es lo que más protege
- **Para el negocio:** un 440 escrito por 44, o el monto sin IGV, ya no sugiere un precio ni se guarda hasta que la persona dice «Sí, pagué S/ X» o toca «Usar S/ total».
- **Archivos:**
  - `cuenta-de-precio.ts`: `dudasDeCosto` con cuatro casos: «muy distinto al anterior» (>2× o <2/3, la misma banda de `fn_costo_fuera_de_banda`, 20260930120000:49), «escribió sin IGV» (±2 % del subtotal sin IGV de la orden), «fuera de banda» (<p10/2 o >p90×2) y «el precio no cubre el costo». Se agrega `puedeSugerir`.
  - Web: bajo el campo Costo de `PrecioDePrenda.tsx:184-217`, un `<Aviso tono="atencion">` con «Sí, pagué» y «Usar S/ …». Mientras el costo esté dudoso no hay barra ni sugerido.
  - `faltaParaCerrar` (`recepcion-conteo-reglas.ts`) suma «costo por confirmar».
  - El «Sí» viaja como `confirmaCosto` (`CerrarEnvio.tsx:564`).
  - Base: función nueva `fn_costo_dudoso(costo, vigente, precio, categoria_id, orden_compra_item_id)`. No se cambia la firma de `fn_costo_fuera_de_banda`, porque la usan 5 caminos.
- **Migración:** sí, en dos partes.
  - P3a: la función pura.
  - P3b: reemplazos anclados en `fn_recepcion_entrar` (junto a la llamada a `fn_costo_fuera_de_banda`) y en `recibir_lote` (20260930122000:5-27), confirmando con el `p_confirma_costo` que ya existe.
  - Cada una con `lock_timeout '3s'`, idempotente, sin `select … into` dentro de un texto entre comillas (ADR-0288).
  - El ancla sale de la definición viva.
- **Pruebas:**
  - `cuenta-de-precio.test.ts`: el caso 4 de la maqueta (S/ 18.50 contra 21.83) y la banda.
  - `recepcion-conteo-reglas.test.ts`: la web y la base dicen lo mismo, para que no se repita el error que originó #1874.
  - Suite de Postgres con los 4 candados más el «Sí» y una bolsa de S/ 0 (fuera de motores, sin candado de banda). Un caso en `pnpm pruebas:motores-familias-apagadas`.
- **Cómo verifica Felipe:** en Recibir escribe 18.50 en una prenda cuya orden dice 21.83: sale «¿Escribiste el monto sin impuesto?» y «Usar S/ 21.83». Escribe 440 en una blusa: sale «Las blusas te cuestan entre…» y no hay sugerido. Toca «Sí, pagué» y aparece todo.
- **Riesgo:** medio.
  - La banda se arma con costos todavía mezclados, pero su tolerancia es ×2 y /2 y el sesgo es del 18 %: no cambia ningún veredicto de banda (lo medí con los números de la maqueta).
  - `fn_recepcion_entrar` es la puerta única al stock. Un ancla mal sacada rompe Recibir entero, así que se ensaya en un lote que termina en excepción.
- **Skills:** /focus (el costo dudoso es «falta» del campo precio); /milimetro auditar; /chaos (doble clic en «Sí, pagué», recargar entre «Sí» y cerrar, dos pestañas); /abrir-pr.
- **Espera OK de Felipe:** sí. Es stock y costos, SQL en producción, y la pregunta (a) de A0.
- **Se rompe si:** la web deja cerrar con «Sí» y la base no recibe `confirmaCosto`. Vuelve un «Falta» sin dónde escribirlo.

## A5 · «Pierdes» pide confirmar, no prohíbe (M)
- **Para el negocio:** una liquidación a propósito se puede dejar en pérdida, pero solo con «¿Lo dejas así? · Cambiar el precio / Sí, dejarlo».
- **Archivos (base):** reemplazos anclados en
  - `cambiar_precio_en_recepcion` (20261024225000:67,141);
  - el de combinación (20261028234000:203);
  - `poner_precio_sede` (20261011110000:81 y 20261028232000:148);
  - `validar_precios_en_recepcion`.
  Pasan de `raise` a pedir `p_confirma_perdida`, comparando con `precio/1.18 < costo`.
- **Archivos (web):** `ConfirmarPrecios` (`CerrarEnvio.tsx:1397`) y `PrecioSedeModal.tsx:131` con el `<Modal>` de confirmar (`pie-acciones`, botón negro). `lib/error-escritura.ts` gana el texto nuevo.
- **Migración:** sí, una parte (solo `create or replace` por reemplazo anclado). Sale **después** de que se fusione #1880, que toca `fn_precio_en_sede`; las anclas se sacan de la definición viva.
- **Pruebas:** Postgres: sin confirmación rechaza; con confirmación guarda y deja quién lo hizo. Prueba de reglas de la confirmación en la web.
- **Cómo verifica Felipe:** pone S/ 40 a una blusa de S/ 36, guarda, ve la hoja, toca «Sí, dejarlo» y el precio queda.
- **Riesgo:** medio. Si se publica la web antes que el SQL, «Sí, dejarlo» rebota cuando el precio está bajo el costo.
- **Skills:** /chaos (confirmar dos veces, Escape a mitad); /milimetro auditar; /abrir-pr.
- **Espera OK de Felipe:** sí. Es dinero y le da vuelta a su decisión del 2026-10-11.
- **Se rompe si:** queda alguna de las cuatro funciones sin parche y sigue prohibiendo. La suite recorre las cuatro.

## A6 · La pieza `<CuentaDelPrecio>` en la hoja de una prenda de Recibir (L)
- **Para el negocio:** la integrante ve la barra Prenda / SUNAT / Para ti, el chip, «Te quedan S/ X», «Con 35 % de rebaja te quedan S/ …», «No bajes de» con «Usar» y la IA como segunda opinión.
- **Archivos:**
  - Nuevo `components/ui/CuentaDelPrecio.tsx`, hecho con piezas que ya existen:
    - `BarraApilada` con alto 12 (no 28 como la maqueta) y `MuestraTramo`;
    - `Chip` en tonos rojo, ámbar y verde;
    - `Ayuda` con «De cada venta, 18 de cada 118 soles son de SUNAT»;
    - `btn-primario` y `btn-secundario`.
  - La clase del tramo rayado de SUNAT, hecha con `borde-control` y `sand`, con su versión oscura y su versión maciza en `vidrio/aguanta.css`.
  - Una familia nueva en `apps/web/unificar/familias.mjs`, con sus firmas.
  - `PrecioDePrenda.tsx:184-240` (la hoja con `sinNombre`).
  - `precio-propuesto-reglas.ts:71` (`revisarPrecioDeLaIA` queda acotada entre piso y techo; techo nulo por ahora) y `:35`, donde `pisoDePrecio` y `MARGEN_MINIMO` pasan al piso único.
  - `api/precio/proponer/route.ts:23` y el prompt de `precio-propuesto-ia.ts:50`.
  - `textoRevisarAlRecibir` («Menos de 30 %») se va.
- **Migración:** no.
- **Pruebas:** reglas de la pieza (qué tramos y qué frase en los 5 casos); `lib/unificar.test.ts`; `tema-tokens.test.ts` y `tema-colores.test.ts`; `vidrio-que-aguanta.test.ts`; `precio-propuesto-reglas.test.ts`.
- **Cómo verifica Felipe:** en Recibir abre una prenda nueva con costo S/ 36. Ve «No bajes de S/ 81.90» y «Usar». A S/ 89.90 la ve en verde con su línea de rebaja, en claro y en oscuro, con «Animaciones» apagado y encendido.
- **Riesgo:** medio. Es una pieza nueva del sistema y Dynamic la «mira» (el PR lo dice). Con el movimiento propio de la Vitrina (ADR-0575) no se suma otra animación.
- **Skills:** **/milimetro diseñar** antes del código y auditar al final; /unificar (familia nueva: Felipe la elige mirando); /focus; /sugerir (el pie «El total del papel, con todo. Sin flete»); /guia (pasos y `data-guia` nuevos de recepción, la huella después de `guias:recorrer`); /formidable; /chaos; /abrir-pr; 375 px.
- **Espera OK de Felipe:** sí, para elegir la pieza mirando.
- **Se rompe si:** otra pantalla dibuja su propia barra de margen. La firma de la familia en unificar lo rechaza.

## A7 · Recibir completo: tabla del cierre, Vitrina y reposición (M)
- **Para el negocio:** en la tabla, cada fila muestra el chip y «Te quedan». En reposición sale «Pagaste S/ X más que antes» con el nuevo sugerido.
- **Archivos:**
  - `CerrarEnvio.tsx:829-855,923`: el chip va en la celda y el detalle con la pieza.
  - `PrendaConCombinaciones.tsx:93-151,501`: con un solo costo, la pieza; con varios, el peor veredicto.
  - `LlevarAlStock.tsx:268`, `PreciosDeVenta.tsx:49`, `HacerAhora.tsx:562,706`.
  - `subioElCosto` en `cuenta-de-precio.ts`.
  - Se borra el camino viejo de `HojaPrenda.tsx:779` y de `page.tsx:109-121` si A0 confirmó ADR-0393 en producción; si no, ese camino usa la pieza.
- **Migración:** no.
- **Pruebas:** `recepcion-vitrina-reglas.test.ts`, `recepcion-conteo-reglas.test.ts` y la prueba de `subioElCosto` (el caso 2 de la maqueta: 36 → 44 con precio de hoy 82.90).
- **Cómo verifica Felipe:** un envío con una reposición del Pantalón Lino muestra «Pagaste S/ 8.00 más que antes» y que el precio de hoy ya no aguanta la rebaja. La Vitrina dice «Te quedan».
- **Riesgo:** bajo a medio. Hasta A11, en reposiciones de prendas con factura el aviso «Pagaste más» exagera un 18 %.
- **Skills:** /milimetro auditar, /guia, /chaos, /formidable, /abrir-pr.
- **Espera OK:** no.
- **Se rompe si:** `faltaParaCerrar` y `cerrar_conteo_envio` no coinciden.

## A8 · Nuevo producto (M)
- **Para el negocio:** el paso 4 «Costo y precio» lleva la misma pieza. Un costo dudoso es «falta»; «Pierdes» se confirma al tocar «Crear producto».
- **Archivos:**
  - `NuevoProductoForm.tsx:1311-1358`: el % grande se va y entra la pieza; el `Aviso` de error «pierdes» pasa a confirmación.
  - `alta-producto-guia.ts:137-143`: el costo dudoso entra a `problemasAlta`; «Pierdes» NO cuenta como falta.
  - `guias/pantallas/catalogo.ts:1808-1811` y la huella `productos.nuevo.json`.
  - El costo sugerido de la categoría (`alta-producto-datos.ts:150-164`) sigue igual, con el riesgo anotado.
- **Migración:** no.
- **Pruebas:** `alta-producto-guia.test.ts` (los 19 escenarios contra `problemasAlta`), `sugerir.test.ts` y `guias.test.ts`.
- **Cómo verifica Felipe:** crea una blusa con costo 36 y precio 40. La guía no se lo bloquea, pero al crear se le pregunta.
- **Riesgo:** medio. Si la guía cuenta «Pierdes» como falta, se convierte en un candado y contradice la decisión 7.
- **Skills:** /milimetro auditar, /focus, /sugerir, /guia, /formidable, /chaos, /abrir-pr; 375 px.
- **Espera OK de Felipe:** la pregunta (c) de A0.
- **Se rompe si:** el costo sugerido de la categoría trae costos divididos (hasta A11) y empuja el piso hacia abajo.

## A9 · Catálogo: editar el precio y el precio de una tienda (M)
- **Para el negocio:** al cambiar un precio en la ficha, en bloque o por sede, se ve la misma cuenta, con la regla de esa sede.
- **Archivos:**
  - `ProductoForm.tsx:1916-1993` (`CambiarEnBloque`, `PrecioAquiTerminal` y `PreciosPorSede`).
  - `PrecioSedeModal.tsx:131`.
  - `MatrizStockFicha.tsx:686-687`, cuya pestaña «Costos» pasa a «Te quedan S/» por celda.
  - `variantes-ficha-reglas.ts:704` (`margenDeFila`).
  - `veCosto` (`ProductoForm.tsx:468`) lee la RPC de A3.
  - Guía en `catalogo.ts:512,535,648` y la huella `productos.id.editar.json`.
- **Migración:** no.
- **Pruebas:** `variantes-ficha-reglas.test.ts` y `guias.test.ts`.
- **Cómo verifica Felipe:** en Editar producto ▸ «Cambiar en bloque» escribe un precio y ve la barra. En el precio de TRU ve la misma cuenta.
- **Riesgo:** bajo a medio. Choca leve con #1880 en `catalogo.ts`.
- **Skills:** /milimetro auditar, /guia, /chaos, /formidable, /abrir-pr.
- **Espera OK:** no.
- **Se rompe si:** quien edita la ficha no tiene costo. En ese caso la barra se calla, nunca muestra 0.

## A10 · Campañas: al armar una rebaja (M)
- **Para el negocio:** «Cuánto baja» dice cuántas prendas pierden y cuántas aguantan poca rebaja, y la etiqueta viva muestra «Te quedan» de su prenda de ejemplo.
- **Archivos:**
  - `etiqueta-campana.ts:347` y `EtiquetasLista.tsx:454,558-568` (`prendasBajoCosto` usa `conRebaja` con chip rojo o ámbar).
  - `EtiquetaDeCampana.tsx:57-76,171`.
  - `etiquetas-pantalla-datos.ts:165`: hoy un costo 0 sin permiso da un falso «Buen precio». Pasa a la RPC de A3 o se calla.
  - `tienda-web/campanas/[id]/page.tsx:78`.
  - Las huellas `productos.campanas.json` y `tienda-web.campanas.editor.json`.
- **Migración:** no.
- **Pruebas:** `campana-hoja` y `etiqueta-campana`; `lib/campana-hoja-movimiento.test.ts` (no se agrega movimiento, ADR-0488).
- **Cómo verifica Felipe:** arma un 50 % sobre Blusas y ve «3 pierden · 5 aguantan poca rebaja». Guarda y se le pide confirmar.
- **Riesgo:** bajo.
- **Skills:** /milimetro auditar, /guia, /chaos, /abrir-pr.
- **Espera OK:** no.
- **Se rompe si:** el costo llega en 0 a quien no ve el dinero y la barra miente. La regla exige costo nulo, nunca 0.

## A11 · La base guarda el costo CON IGV, el libro cuadra y se corrigen los costos viejos ×1.18 (L)
- **Para el negocio:** el costo guardado es lo que dice el papel. El crédito fiscal se suma aparte en el mes. Las prendas mal guardadas (medido hoy: 9 prendas, 48 variantes y S/ 267.87; crece con cada recepción con factura hasta este día) quedan corregidas con historia.
- **Migración:** sí, en TRES partes que se pegan en UNA ventana y en este orden:
  1. **P6 Finanzas.** Con factura, la mercadería entra a la 201 por el TOTAL (`completar_papel_compra` 20261023143000:240,384; `fn_mercaderia_pagada` 20261109231000:70). El IGV del papel va 4011 al debe contra una cuenta nueva «IGV recuperado de mercadería», que resta del costo de ventas del mes. Se arma como asiento derivado aparte, no dentro de `fn_asientos` (~36 mil caracteres, como `claure_fuera`). Lleva el asiento de transición por la revaluación de P5. `fn_costo_variante_al` (20260925130000:112) pasa a leer `fn_costo_historial_efectivo`.
  2. **P1.** `fn_costo_de_entrada` (20261106005000:42) pasa a devolver `p_costo` tal cual, con una guardia que se detiene si vuelve a encontrar la versión que divide. Se le quita el `execute` a `recibir_compras` (20260912231956:42), la segunda puerta.
  3. **P5.** Script de una vez, todo o nada, siguiendo el patrón de `pegar-en-produccion-costo-declarado-ultima-compra-2026-11-09.sql`. La huella es «escrito vs entrado» (`despacho_conteos`/`costos_prendas` contra `despacho_recibidos`), calculada en la ventana y no como lista fija. Por cada fila, una fila en `costo_correcciones` (20261026160000:69) con quién, cuándo y el motivo del ADR. Se recalculan las filas que vienen después (2 variantes) y se actualiza `variantes.costo`. `venta_items.costo_unitario` de las 12 vendidas NO se toca. Se ensaya en un lote que termina en excepción y el camino de vuelta (una corrección inversa) queda escrito antes.
- **Web:** `scripts/pruebas/costo_sin_igv.mjs` se invierte, y los textos de `CostoPrenda` y `CorregirCostoModal` cambian.
- **Pruebas:** Postgres:
  - una recepción con factura cuadra la 201 después de vender (sin el «−18 sin causa»);
  - P1 sin P6 hace fallar la prueba de cuadre;
  - P5 es idempotente;
  - la guardia de P1.
- **Cómo verifica Felipe:** el Balance cuadra (ADR-0619). El Historial ▸ Costo de una de las 9 prendas muestra la corrección con su motivo. El contador ve la cuenta nueva en el mes.
- **Riesgo:** ALTO. Es el orden de publicación.
- **Skills:** /rigor (dinero), /ultra-criterio, /abrir-pr.
- **Espera OK de Felipe y del contador:** sí, de los dos: dinero, costos, SQL en producción y libro.
- **Se rompe si:** P1 se pega antes que P6. Desde la primera recepción con factura el IGV se cuenta dos veces (691 + 4011) y la 201 queda negativa. Por eso van en una ventana y la prueba lo vigila. Si el contador responde pronto, esta actividad sube a justo después de A5: cada día de espera suma filas a corregir.

## A12 · El techo: «Sugerido» por las parecidas que se venden rápido (L)
- **Para el negocio:** el sugerido sale de las prendas de la misma categoría, con costo ±25 %, que se venden más rápido que la mitad de su categoría. Si la categoría rota rápido se toma el p75 de sus precios; si rota lento, el p50. Primero se busca en la sede y, si no alcanza, en CAYLA. Nunca queda bajo el piso. Entra el tono pizarra «Más caro que las parecidas» (más de 10 % sobre el techo). Se prende en los cuatro frentes a la vez, porque la pieza es una sola.
- **Archivos:**
  - Tabla nueva `retail.precio_referencia`. Llave `(alcance, categoria_id)`, con `p50_dias_categoria`, `p50_dias_tienda`, `rota_rapido`, `rapidas jsonb`, `nivel` y `calculada_en`. RLS encendido sin políticas.
  - `guardar_precio_referencia`, solo para service_role, con candado consultivo y reemplazo entero, con el patrón de 20261008120000:94-183.
  - Una función pura nueva sobre `analizarSede` (`frescura-reglas.ts:1704`): rápida = `Rapidez.indice > 100` (:1191) con una vara de ≥ 10 ventas (:1525); el p50 de la tienda sale de Kaplan-Meier.
  - `frescura-vara-cayla.ts:195` y `api/inventario/frescura-vara-cayla/route.ts:39-60` lo guardan en la misma corrida del cron.
  - `fn_precio_referencia` suma el techo. Lee los precios en vivo con `fn_precio_en_sede` (20261031161000:124); por prenda la mediana, y entre prendas p75 o p50. El techo de una sede solo se entrega a quien la opera; si no, el de CAYLA. Mínimo 3 parecidas. Si el snapshot tiene más de 3 días, `referencia_vieja`.
  - `cuenta-de-precio.ts` suma `techoDeParecidas` y el tono pizarra.
  - La pantalla dice de dónde salió («de TRU», «de CAYLA», «sin parecidas que se vendan rápido»).
- **Migración:** sí, dos partes (tabla + `guardar_`; y la RPC extendida). Se pega antes que la web, y el cron después.
- **Pruebas:**
  - La función pura de rápidas y el p50 de la tienda, con su prueba.
  - Postgres de la RPC: un líder de otra sede recibe el techo de CAYLA; una bolsa sale `fuera_de_motores`.
  - Un caso en `pruebas:motores-familias-apagadas`.
  - El caso 1 de la maqueta: rota rápido y p75 de las parecidas da S/ 99.90.
- **Cómo verifica Felipe:** una Blusa nueva en TRU muestra «Sugerido S/ …, lo que pagan en TRU por blusas parecidas que se venden rápido». A un Kimono, categoría nueva, solo le sale el piso y la IA.
- **Riesgo:** medio. Al principio casi todo cae al respaldo de CAYLA: la mediana es de 5 prendas por categoría y hay solo mes y medio de ventas. Hay que avisar a la sesión de Frescura.
- **Skills:** /rigor (percentiles con poca muestra), /milimetro auditar, /guia, /abrir-pr. No va /chaos: es solo lectura.
- **Espera OK de Felipe:** sí, por el SQL en producción.
- **Se rompe si:** el cron no corre 3 días. El techo queda vacío, con su motivo, y no se inventa.

## A13 · Unificar Catálogo ▸ Productos, Revisar precios y la IA en la base (M)
- **Para el negocio:** el ámbar de la lista y «Revisar precios» dicen lo mismo que la hoja: «No aguanta una rebaja de 35 %».
- **Archivos:**
  - `productos-vista.ts:72,89-102`: se borra `UMBRAL_MARGEN_BAJO = 45` y queda cerrado ADR-0254.
  - `ProductosTabla.tsx:255,412,738,761`.
  - `alta-producto.ts:81,89`: `margenPorcentaje` y `nivelMargen` se borran.
  - `revisar-precios-reglas.ts:97` y `RevisarPreciosLista.tsx:34`.
  - `AplicarPrecioHoja.tsx:68`.
  - Guía de `catalogo.ts:25,396,404,531,1914,1935,1948`.
- **Migración:** sí, en tres partes.
  - Gemela SQL `retail.fn_piso_de_precio(numeric)`, immutable.
  - El CHECK de `precio_propuestas` (20261110203000:80), solo y `NOT VALID`, comparando con el piso guardado.
  - `fn_precios_a_revisar` (:305), `registrar_precio_propuesta` (:204) y `aplicar_precio_propuesto` (:431) usan la función.
- **Pruebas:** prueba cruzada TS↔SQL del piso, con costos de S/ 1 a S/ 500; `productos-vista.test.ts`; `revisar-precios-reglas.test.ts`; `scripts/pruebas/precio_propuesto.mjs`.
- **Cómo verifica Felipe:** la cantidad de prendas en ámbar coincide con la medición de A0.
- **Riesgo:** medio. La lista crece mucho y la gente puede aprender a ignorarla: publicarlo con la cifra medida.
- **Skills:** /milimetro auditar, /guia, /chaos (aplicar el precio propuesto), /abrir-pr.
- **Espera OK de Felipe:** sí, por el SQL.
- **Se rompe si:** la web y la base difieren en un céntimo y `registrar_precio_propuesta` rechaza. La prueba cruzada lo impide.

## A14 · Las varas que responden OTRA pregunta: misma cuenta, su propio umbral (M)
- **Para el negocio:** Proveedores, Producción, Análisis y el Plan de compra dejan de contar el IGV de la etiqueta como ganancia.
- **Archivos:**
  - `proveedor-prendas-reglas.ts:141,199` y `proveedor-analisis-reglas.ts:138`: Σ(ingreso/1.18) − Σ(costo).
  - `produccion-reglas.ts:34-59` (60/40).
  - `analisis-ficha.ts:75`: «Te quedan».
  - `plan-compra-reglas.ts:220-275`: `fraseDelMargen` usa `conRebaja`; en el cuantil, Cu = precio/1.18 − costo.
  - Finanzas NO se toca (`resultados-reglas`, `ganamos-reglas`, `equilibrio-mes`, `hojas-resumen`, `estados-ganancias`).
- **Migración:** no.
- **Pruebas:** las suites de cada regla y las del motor del plan de compra.
- **Cómo verifica Felipe:** compara el antes y el después de 3 proveedores y de una orden de taller.
- **Riesgo:** medio. Es un motor de decisión: el plan compra menos.
- **Skills:** /rigor, /abrir-pr.
- **Espera OK de Felipe:** sí, de los umbrales en la base nueva (Producción 52.8 % y 29.2 %, Proveedores ≈ 23 %, estrella ≈ 29 %) y del cambio del motor.
- **Se rompe si:** se re-basa la cuenta sin re-basar el umbral. De la noche a la mañana todos los proveedores salen con «Margen bajo».

## A15 · Cierre (S)
- **Archivos:** la fila nueva en la tabla «Una función, una pieza» de `CLAUDE.md`; la actualización del ADR; `knip:produccion` y la deuda; borrar lo que quede de `orden-compra-precio-ayuda.ts` sin uso; bitácora y backlog.
- **Skills:** /abrir-pr.
- **Se rompe si:** queda otra cuenta viva. `git grep "/ 1.18\|\* 0.7\|conFactura"` en `apps/web/lib` tiene que dar solo `cuenta-de-precio.ts`.

---

DECIDÍ: la web sale primero (A2) con la cuenta única, y la base guarda con IGV recién en A11, que lleva juntas Finanzas, el cambio de la base y la corrección.
DESCARTÉ: quitar la división de `fn_costo_de_entrada` al principio, como pide el orden «primero lo que está mal». Hacerlo sin el asiento nuevo cuenta el IGV dos veces en el libro y la 201 queda negativa desde la primera factura recibida. Es el «−18 sin causa» que originó 20261106005000.
SE ROMPE SI: el contador tarda semanas. Cada recepción con factura agrega filas divididas: P5 las encuentra por huella, pero el techo (A12) no puede encenderse.

OBJECIÓN:
- La decisión 7 («no prohíbe») choca con lo que la base hace hoy (prohíbe vender bajo el costo) y le da vuelta a su decisión del 2026-10-11. A5 necesita su OK explícito, y hay que decidir si la caja y el plan de campaña se alinean.
- La decisión 13 dice «una sola vara», pero Producción (costo directo), Proveedores (lo ya vendido) y Finanzas (contabilidad) responden otra pregunta. Usan la misma cuenta con su propio umbral, y Finanzas no se unifica.

LO QUE NO PIDIÓ: el orden de publicación es el riesgo mayor del plan. Quitar la división del costo es una línea, pero sin el asiento de «IGV recuperado de mercadería» el libro descuadra con cada prenda con factura vendida. Por eso A11 se pega en una ventana, en orden y con el contador, y conviene adelantarla en cuanto él responda.