# Campañas y ofertas: casuística completa (2026-11-16) · pendientes

**Estado (2026-11-16, misma rama):** Felipe ordenó arreglarlo todo. Marcado [x] lo subsanado (ver ADR-0655, «Actualización 2026-11-16»);
lo que queda abierto está al final, en «Lo que sigue».

Revisión de punta a punta de Catálogo ▸ Campañas y ofertas (ADR-0655), sobre una **copia propia de la base local** (`cayla_ofertas`, con las 90
migraciones que le faltaban a la compartida, de 20261112153000 a 20261116020000) y leyendo el código de la web. Nada se escribió en la base
compartida ni en producción.

**Lo que ya está en verde:** las 16 suites de base del módulo (campana_reglas, campana_con_ofertas, campanas_por_sede, insignias_sin_descuento,
ofertas_de_grupo, caja_ofertas_de_grupo, apartados_ofertas_de_grupo, tienda_ofertas_de_grupo, monto_con_escalones, ofertas_por_insignia,
cambio_mismo_modelo, aviso_dos_ofertas, campana_redondeo, campanas_llave_unica, campanas_web, tienda_catalogo_version): **510 de 510**. La cuenta
en TypeScript (`lib/ofertas-de-grupo.ts`) coincide con la de la base en orden, reparto al céntimo, escalones y la regla A/B. La validación de la
hoja calza con los candados de la tabla. Un precio negativo es imposible (`venta_items_descuento_no_supera_precio`).

**Producción al 2026-11-16 (solo lectura):** las funciones de ofertas están todas; **ninguna oferta creada todavía** (0 filas en
`campana_reglas`), 18 campañas activas, 5 con descuento de siempre y 9 activas con su fecha ya vencida. El primer uso real será con las tres
tiendas y la web a la vez.

Gravedad: 1 dinero o stock que no cuadra · 2 dato malo en silencio · 3 error feo · 4 pantalla o texto que miente. Cómo se verificó:
**base** (caso corrido en `cayla_ofertas` con ROLLBACK) · **código** (leído, con archivo:línea).

## Gravedad 1 — dinero

- [x] **1. Una venta sin conexión se rechaza si la oferta cambió antes de subirla** (base + código). La caja cobró un 3x2 a las 10:00 sin red;
  a las 11:00 alguien retira o edita la oferta; al subir, `fn_ofertas_de_grupo` solo usa el DÍA de la venta (`fn_dia_de_la_venta`) y lee
  `estado = 'activa'`, la forma, el alcance y las cesiones de AHORA → «sin grupo» → `venta_grupo_no_coincide`. Igual con una oferta activada
  después de la venta el mismo día (`venta_grupo_omitido`), y con una venta de más de 3 días (vuelve a «hoy»; la firma acepta hasta 7). La plata
  está en el cajón y la prenda salió; el error dice «vuelve a abrir el cobro», que en una venta encolada no existe (`lib/error-escritura.ts:215`).
  Contradice la decisión 5 («una venta sin conexión vale con las ofertas de su hora»). Opciones: la caja manda el trato que usó (como el
  apartado guarda `separacion_ofertas_grupo`) y la base acepta ese trato si la oferta existía a esa hora (historial), o la venta encolada pasa a
  «para revisar» en vez de rechazarse. **Decide Felipe.**
- [x] **2. Un descuento a mano no le resta al monto que la prenda suma para llegar al escalón** (código: `ofertas-de-grupo.ts:101,118`;
  `fn_cuenta_de_grupos` usa `precio_unitario`). Prendas de lista S/ 400 con −35 % a mano pagan S/ 260, pero alcanzan «desde S/ 300» y además
  reciben su parte. Una rebaja de campaña sí las saca del monto (decisión 3); el descuento a mano no está decidido. **Decide Felipe:** ¿el monto
  se mide sobre lo que paga el cliente?
- [x] **3. Un descuento a mano menor que la campaña desaparece si la prenda va en su 3x2** (código: `vender-reglas.ts:504,547`;
  `ofertas-de-grupo.ts:327,339`; lo mismo en `ApartarVista.tsx:349`). Polo con −20 % de campaña en un 3x2 armado; la cajera pone 10 % «Cerrar la
  venta» → «prevalece la campaña» → la línea queda con razón `campana` → al ir en el grupo se le quita la rebaja → el 10 % no se aplica, sin
  aviso. El ADR dice que un descuento a mano se suma a la parte del grupo, y la base lo aceptaría.

## Gravedad 2 — dato malo en silencio

- [x] **4. Cesiones en ciclo de 3 apagan las tres ofertas** (base). A cede a B, B a C y C a A (cada par resuelto por separado, como lo hace el
  aviso «elige cuál queda»): el candado los da por buenos, y la caja no cobra NINGUNA de las tres (rebajas y 3x2 igual). `ceder_ofertas` y
  `elegir_oferta_que_queda` solo frenan el ciclo de dos. Arreglo: al ceder, frenar si la que gana ya cede, directa o indirectamente, a la que
  cede (recorrido de `campana_regla_cesiones`), o que la base resuelva el ciclo con un orden fijo.
- [x] **5. Acortar la campaña (fechas o tiendas) no revisa sus ofertas** (base). La oferta sigue diciendo «hasta el 6 dic» o «en Trujillo»
  cuando la campaña ya termina el 21 nov o ya no rige en Trujillo: deja de cobrar sin aviso y su texto miente. `guardar_campana_regla` lo frena
  al guardar la oferta, pero `actualizar_campana_etiqueta(_con_sedes)` no mira a sus ofertas. Arreglo: rechazar el cambio o recortar las
  ofertas y decirlo en la hoja de la campaña.

## Gravedad 3 — error feo

- [x] **6. La caja no frena un descuento a mano que, con la parte del grupo, pasa el precio** (código: `ofertas-de-grupo.ts:339`;
  `descuento-cuenta-reglas.ts:29`). «3 por S/ 30» en prendas de S/ 50 = 80 % de parte; con 35 % a mano llega a 115 % → salta
  `venta_items_descuento_no_supera_precio`, que `error-escritura.ts` no traduce: error genérico. Apartar sí tiene su candado con mensaje.
- [x] **7. Apartar no relee ofertas ni campañas** (código: `usePreciosEnVivo` solo en `PuntoDeVenta.tsx:943`; Apartar lee una vez,
  `vender/apartados/page.tsx:50`). Con la pantalla abierta, activar o terminar un 3x2 hace que `separar_prendas` rechace
  (`separacion_grupo_no_coincide`) hasta recargar; la hoja de la oferta dice «Valen desde ahora».

## Gravedad 4 — pantalla o texto que miente

- [x] **8. «Quedaría en» no cuenta el descuento a mano de una prenda con campaña que va en su grupo** (`descuento-cuenta-reglas.ts:50`): la
  vista previa muestra un total mayor que el que se cobra. Misma raíz que el 3.
- [x] **9. «Mientras no elijas, la caja cobra la que más le ahorra» es falso en varios pares** (`AvisoDosOfertas.tsx:57`, guía en
  `lib/guias/pantallas/catalogo.ts:1225`). Dos 3x2: gana el más antiguo; monto + rebaja: siempre la rebaja; monto + 3x2: el 3x2. Solo es
  cierto para rebaja + oferta de grupo y para dos rebajas.
- [x] **10. El ticket dice «lleva 0 más y se arma el grupo»** (base + código: `PieDeGrupo.tsx:10,23`; también la bolsa web,
  `apps/tienda/app/bolsa/page.tsx:243`). Tres polos con −40 % y un 3x2: gana la rebaja, el grupo devuelve ahorro 0 y faltan 0. También un
  «N por S/ X» que cuesta más que las prendas. Debería decir que su rebaja ahorra más, o nada.
- [x] **11. La hoja no avisa «por debajo del costo» en 3x2, «N por S/», «N.ª al X %» ni monto** (`OfertasHoja.tsx:379`). La rebaja sí avisa.
  Además un «2 por S/ 200» sobre prendas de S/ 50 se guarda y activa (base): no cobra de más (el ahorro se topa en 0) pero no sirve, y la hoja
  muestra «ahorra S/ 0.00» sin advertir.
- [x] **12. Topes distintos por forma** (base, **decide Felipe**). La rebaja y el monto en % topan en 70 %, pero un «10 x 1» (90 % menos) y «la
  2.ª al 100 %» se guardan y activan. Si el 70 % es un freno contra un dedazo, no frena a las otras formas.
- [x] **13. El pase dice «En qué prendas: Las eligen sus ofertas» (✓) aunque sus insignias estén todas desactivadas** (`SellosPantalla.tsx:718`):
  desde 20261114130000 esa oferta no rebaja nada.

## Sospechas de baja frecuencia (no confirmadas)

- [ ] **14.** La caja lee las prendas de una oferta con `fn_variantes_de_oferta_con_insignias` (filtra `v.activo`) y la base cobra con
  `fn_regla_alcanza_variante` (no filtra): una prenda desactivada con el ticket abierto daría `venta_grupo_omitido`.
- [ ] **15.** Cambio de talla del mismo modelo cuando la talla devuelta ya no está en el catálogo: la pantalla asume diferencia 0
  (`cambio-reemplazo-reglas.ts:148`) y la base compara contra el precio de hoy o de lista (`fn_precio_mismo_modelo`). Solo 2 de 631 modelos
  tienen tallas de distinto precio.
- [x] **16.** Dos personas activando a la vez dos ofertas que chocan: el candado es diferido y cada transacción no ve la otra; si las dos
  revisiones corren antes de que una confirme, las dos pasan. Ventana de milisegundos; no se probó.
- [x] **17.** Bolsas (familia fuera de motores, hasta S/ 5.90, 149 líneas vendidas) cuentan para llegar a un monto de toda la compra y reciben
  su parte. Coherente con ADR-0377 («el dinero no pregunta»), pero conviene que Felipe lo sepa.

## Lo que no se hizo

- **No se probó en el navegador.** La base local compartida está 91 migraciones atrás y no tiene nada de las ofertas; ponerla al día es
  `/actualizar-flujo` y lo ordena Felipe. Los casos de pantalla (8 a 13) están verificados leyendo el código.
- La copia `cayla_ofertas` sigue en el contenedor `supabase_db_cayla-retail`, por si se quiere repetir algo; se puede borrar.

## Lo que sigue

- [x] **Pegado en producción el 2026-11-16, con el OK de Felipe** (las 17 funciones verificadas idénticas a la copia local por su md5), en este orden: `20261116172000`, `20261116173000`, `20261116174000`, `20261116175000`,
  `20261116180000`. Ninguna mezcla políticas con `alter`; `174000` agrega una columna a `ventas` (la web la lee con reintento sin ella).
- [ ] **Apartados: el monto sobre lo que se paga.** `separar_prendas`, `editar_separacion`, `previsualizar_edicion_separacion` y
  `fn_grupos_de_separacion` arman sus líneas sin `descuento_manual`: un apartado con descuento a mano mide el monto a precio de lista (la
  caja ya no). Son cuatro funciones con reemplazos anclados y su prueba.
- [ ] **Una revisión de las ventas marcadas** «Oferta que cambió»: hoy se ven en el historial; si pasan seguido, un filtro o un aviso a Felipe.
- [ ] Caso 14 (sospecha): una prenda desactivada con el ticket abierto. Sin confirmar.
- [ ] Caso 15 (sospecha): cambio de talla del mismo modelo cuando la talla devuelta ya no está en el catálogo. Sin confirmar; 2 de 631 modelos.
- [ ] Encontrado al verificar: `fn_campanas_en_sede` con cesiones tardaba 11 s (arreglado en `20261116175000`). Mirar si otra lectura llama
  una regla prenda por prenda sobre todo el catálogo (`ofertas_de_monto_vigentes` y `ofertas_de_grupo_vigentes` midieron 47 y 34 ms).
