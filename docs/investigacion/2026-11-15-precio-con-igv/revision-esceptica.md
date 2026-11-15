# Revisión escéptica del plan (2026-11-15)

REVISIÓN ESCÉPTICA DEL PLAN «Fijar precio con la cuenta única», leída en origin/main 6465b4942 y en la maqueta sin commit docs/maquetas/precio-sugerido-2026-11/index.html

## 1. Qué comprobé en el código (archivo:línea)

1. **El plan lo describe bien.** `supabase/migrations/20261106005000_costo_sin_igv_con_factura.sql:42-58` define `fn_costo_de_entrada`. Divide entre (1 + IGV) cuando la línea tiene papel factura o una compra factura vigente. La única que la llama es `fn_recepcion_entrar`, por un reemplazo anclado en las líneas 64-66.
2. **El plan lo describe bien, pero sobra la medición 2 de A0.** `apps/web/lib/margen-a-la-vista.ts:60` es `facturaDelEnvio`, y el «RUC ⇒ factura» está en la línea 62. En cambio `NuevoProductoForm.tsx:585-586,1336` usa `conFacturaAlta` solo para mostrar el margen: el alta no divide nada al guardar.
3. **Funciones de `orden-compra-precio-ayuda.ts`, bien ubicadas.** `conRebajaCts` está en :195, `margenPorMilCts` en :200, `aguantaCts` en :207, `costoRealCtsDe` en :226, `cuentaDeLinea` en :238, `IGV = 1.18` en :32 y `REBAJA_FUERTE_PCT = 35` en :35. Además, en :215 ya existe `precioMinimoCts`, otro piso «con 35 % de rebaja». El plan no lo nombra y es una vara más que hay que borrar.
4. **`pisoDePrecio` y `pideRevisarAlRecibir`, bien ubicadas.** `precio-propuesto-reglas.ts:35-40` tiene el piso «precio × 0.70 ≥ costo». En :118-120, `pideRevisarAlRecibir` marca `costo_cambio` si costo ≠ costoAntes, y en :120 basta 1 céntimo de diferencia.
5. **El candado de banda en la base no es el que el plan supone.** En `20261013170000_recepcion_un_solo_camino_de_cierre.sql:149` compara el costo ESCRITO (con IGV) contra `vr.costo` y `vr.precio` (el precio base, no el de la sede). Lo puede confirmar solo quien cumple `fn_ve_costos_al_recibir()` (:153); el aviso sale con el hint `recepcion_costo_atipico_sin_permiso`, no con `costo_atipico_sin_lider`. Y `fn_costo_fuera_de_banda` (20260930120000:49-66) ya trae `mayor_que_precio` (costo ≥ precio) y la banda 2× / ⅔.
6. **Tienen razón.** El CHECK de la IA está en `20261110203000_precio_propuesto_con_ia.sql:80` (`precio_propuesto * 0.70 >= costo - 0.005`) y `margen_bajo` en :380.
7. **Un costo de Taller entra SIN IGV, y el plan no lo trata.** `20261015040000_orden_insumo_recepcion_funciones.sql:69,290` guarda el costo de los insumos sin IGV. Toda prenda del Taller entra con costo sin IGV. Eso choca con la decisión 2, «una sola cuenta para TODAS las prendas».
8. **Corregir un costo pide escribirlo sin IGV.** `components/historial-prenda/CorregirCostoModal.tsx:135` muestra el pie «por prenda, sin IGV». Con la decisión 3, ese camino también tiene que pedir el monto con IGV.
9. **El escáner de A3 tal como está escrito falla con falsos positivos.** Tal como está escrito («falla si nombra `costo`») marca en rojo comentarios que ya existen: `PuntoDeVenta.tsx:2713` y `estilos/vidrio/vender.css:66`.
10. **Los PR abiertos que chocan siguen abiertos.** #1874 toca la recepción y el costo. #1880 toca la fusión y el precio por sede.

## 2. Correcciones al plan

**Orden y estados intermedios peores**

1. **Acortar la ventana de costos mezclados.**
   - Mientras no llega A11, la base sigue dividiendo cada recepción con factura. Todo lo que lea el costo GUARDADO (A4 «distinto al anterior», A7 «Pagaste más», A8 costo sugerido de la categoría, A9 Catálogo, A10 Campañas, la banda) mezcla dos bases.
   - A7 es peor de lo que dice el plan. Una reposición con factura al MISMO costo real (escribe 36, guardado 30.51) dispara «Pagaste S/ 5.49 más que antes» aunque el costo no cambió. No es que «exagere un 18 %»: inventa una subida. Lo mismo pasa con `pideRevisarAlRecibir:120`, que pide revisar en cada reposición con factura.
   - Corrección: mientras A11 no esté, `fn_precio_referencia` devuelve el costo anterior en la base del papel (×1.18 si su entrada fue con factura), con el campo `base_anterior: 'papel'`. El aviso «Pagaste más» y el `costo_cambio` de A7 salen recién después de A11, o con ese costo ya corregido.
2. **La pregunta al contador va en A0, no en A11.**
   - A11 es la que bloquea todo lo demás (el techo, las bandas limpias). A0 entrega una nota de una página al contador con dos opciones:
     - (i) la del plan: la 201 por el TOTAL y la contrapartida «IGV recuperado de mercadería» contra el costo de ventas del mes;
     - (ii) el libro sigue NETO según NIC 2, y `fn_costo_variante_al` toma el costo de gestión y le saca el IGV solo si su papel fue factura. El libro no cambia ni una cifra.
   - Ojo con (i): deja el inventario 201 inflado por el IGV de lo que todavía no se vendió, y baja el costo de ventas del mes de la COMPRA, no del de la venta. Es probable que el contador no lo acepte.
   - (ii) desacopla P1 de una cuenta nueva y permite adelantar P1 a justo después de A2. Pero distingue la factura por prenda dentro del libro, y la decisión 2 lo prohíbe para la cuenta de gestión. Lo decide Felipe con el contador; yo no lo cambio.
   - Recomiendo pedir la respuesta en A0 y subir A11 a la posición 3 en cuanto llegue.
3. **Publicar A11 en una sola ventana, web incluida.** Los textos de `CorregirCostoModal` («sin IGV» → «con IGV, el total del papel») y `CostoPrenda` salen en la MISMA ventana que P1. Si no, alguien que corrige un costo después de P1 lo escribe sin IGV y queda dividido a mano.
4. **A11 sube costos de verdad.** P5 multiplica ×1.18 los costos de 48 variantes. Una rebaja de campaña que hoy pasa puede, tras P5, dejar `precio × (1 − descuento) < costo`. Entonces `registrar_venta` (`venta_descuento_bajo_costo`) la rechaza en la caja a mitad de campaña, y `p_costo >= p_precio` (20261005220000:236) rechaza el plan de campaña.
   - Antes de P5: una medición de solo lectura de qué prendas con campaña activa o precio de sede quedan bajo el costo nuevo.
   - Felipe decide si se avisa a la sede o si P5 espera a que cierre la campaña.
   - P5 se fecha hoy y no toca meses cerrados (el Cierre de mes ya cerró octubre).
5. **Reservas de números.** El ADR se reserva en A0. Cada migración se reserva AL EMPEZAR su actividad, como dice la regla de «Números y PR». No las ~9 de una sola vez semanas antes.

**Decisiones que el plan contradice u olvida**

6. **Las prendas del Taller** (verificación 7). La decisión 2 dice «TODAS las prendas». A0 agrega:
   - una medición de cuántas prendas del Taller hay y con qué costo;
   - una pregunta a Felipe: el costo de una prenda del Taller ¿se lleva a «con IGV» (los insumos con factura ×1.18) o se queda como está?
   Si se queda, la Blusa del Taller muestra el piso un 18 % bajo para siempre. A11 o A14 lo implementa según la respuesta.
7. **Quitar las preguntas (a) y (b) de A0: ya están decididas.**
   - (a): la decisión 9 dice «hasta que LA PERSONA confirma», y la 11 dice «quien puede fijar precio ve el costo». Confirma quien recibe.
   - Pero eso es un cambio de permiso de una función que ya existe: `fn_ve_costos_al_recibir()` (verificación 5). A3 la redefine («puede fijar precio en esta hoja») en vez de crear otra puerta paralela. Así `fn_recepcion_entrar:153` deja de rechazar a la terminal que recibe. Ese cambio va con OK de Felipe en A3, no como pregunta abierta.
   - (b): la decisión 7 ya da vuelta lo del 2026-10-11 para FIJAR precio y para armar la rebaja (decisión 8). Lo único que sigue abierto es la caja (`venta_descuento_bajo_costo`), que está fuera de este plan. Se anota en el backlog, no se pregunta.
8. **«Precio ≤ costo» no es un costo dudoso.** La maqueta aprobada (`avisosDeCosto` en :234) solo tiene tres dudas: anterior, sin IGV y banda. «El precio no cubre lo que pagaste» es un aviso rojo que NO apaga el sugerido; el sugerido es justamente el arreglo.
   - A4 lo saca de `dudasDeCosto` y `puedeSugerir`.
   - Al guardar, una sola confirmación: la de «Pierdes» (A5). Nunca dos hojas por lo mismo.
   - La regla de la base `mayor_que_precio` (20260930120000:62) también pasa por esa confirmación. Hoy es otro candado de costo atípico.
9. **Una sola definición de la banda 2× / ⅔.** `fn_costo_dudoso` LLAMA a `fn_costo_fuera_de_banda` para el caso «anterior» y suma «sin IGV» y «banda de la categoría». No reescribe la banda: dos definiciones de lo mismo rompen la integridad conceptual.
10. **Precio por sede (decisión 6).** El candado de la base compara contra `vr.precio` (el precio base). A4 y A5 comparan contra el precio de la sede que recibe (`fn_precio_en_sede`), igual que la web.
11. **Decisión 4, segunda mitad.** «Se quita la idea de anotar factura en el proveedor»: A2 la tacha en el backlog y el ADR, y borra lo que la sostenga, como `lib/marcas.ts:17` si queda huérfano.
12. **Decisión 12, «la IA siempre dentro de piso y techo».** `aplicar_precio_propuesto` vuelve a calcular el piso con el costo ACTUAL al momento de aplicar (A13). Una propuesta vieja, hecha bajo el piso de 30 % o con un costo anterior, no se aplica bajo el piso nuevo. El CHECK `NOT VALID` solo vigila las filas nuevas.
13. **Hay otra vara más.** A15 borra `precioMinimoCts` (`orden-compra-precio-ayuda.ts:215`), un piso «con 35 % de rebaja» que existe aparte, y el `git grep` final la incluye.
14. **Medición 2 de A0.** Se reemplaza por la medición de prendas del Taller (corrección 6) y por esta: ¿la recepción precarga el costo desde `variantes.costo` en alguna línea con orden? Si lo hace, la base lo dividiría DOS veces.

**Concurrencia**

15. **Confirmar un costo dudoso confirma un MONTO, no un «sí» suelto.**
    - Hoy `confirma_costo` es booleano (`recepcion-conteo-reglas.ts:1656`). La integrante confirma 440, después corrige a 4400 y la confirmación sigue en `true`.
    - A4 manda `confirma_costo: <monto>` y la base exige que sea igual al costo escrito.
    - En la web, editar el costo borra la confirmación; la maqueta ya lo hace con `costoConfirmado`.
16. **Dos personas fijando precio a la vez.**
    - `poner_precio_sede` y `cambiar_precio_en_recepcion` hoy dejan que gane el último que guarda. El veredicto se calculó contra otro precio u otro costo.
    - A5 agrega `p_precio_antes` (bloqueo optimista). Si cambió, rechaza con «Otra persona lo dejó en S/ X: mira la cuenta de nuevo».
    - «Pierdes» se evalúa en la base, con la fila de la variante bloqueada (`for update`) y el costo vigente de ese momento. Así un cierre de recepción que cambia el costo entre la hoja y el guardado no deja pasar una pérdida sin confirmar.
    - Va con su ataque en `/chaos`: dos pestañas y dos cuentas.
17. **A11, P5 contra una recepción que cierra en medio.**
    - P5 bloquea las variantes que corrige.
    - Marca cada fila con su `costo_correcciones` y salta las que ya tienen esa marca: la idempotencia es por fila, no por la lista.
    - El orden es P6 → P1 → P5. Con P1 primero, una recepción que entra durante la ventana ya no calza con la huella «escrito ≠ entrado».

**Cuando algo externo no responde (escribirlo en A3, A6 y A12)**

18. **Si `fn_precio_referencia` no responde, la hoja no se queda vacía.**
    - Dibuja la cuenta, el piso y el veredicto con lo escrito; eso no necesita la base.
    - Calla «anterior», «banda» y «techo» con una línea: «No pude comparar con lo de antes».
    - Deja guardar, porque el guardián real es la base. `fn_recepcion_entrar` sigue revisando la banda al cerrar.
19. **Si la IA no responde, nada se bloquea.** Se muestra el texto de `textoSinPropuesta` y el piso (y el techo) siguen visibles. Ningún guardado espera a la IA.
20. **Si el cron de Frescura se cae** (A12), el techo queda en `referencia_vieja` o `sin_referencia` con su motivo, como ya dice el plan, y la hoja muestra solo el piso.

**Que se pueda verificar por sí sola**

21. **El escáner de A3 mira datos, no palabras.**
    - Falla si una pantalla de cara al cliente importa `cuenta-de-precio`, `CuentaDelPrecio`, `getCostosVariantes` o `fn_precio_referencia`, o si un `.select(...)` pide la columna `costo`.
    - Se suma una prueba en Postgres: el JSON de las RPC que leen Vender, la etiqueta y la tienda no trae ninguna clave `costo`.
    - La tienda (`apps/tienda`) puede leer con service_role. Por eso el escáner también la recorre: la prueba de permisos de anon y authenticated no la cubre.
22. **A2 sin A6 tiene un estado intermedio raro.** El tono ámbar cambia de significado («menos de 30 %» pasa a «bajo el piso») antes de que exista la pieza. Ese ámbar cae en muchas más prendas, y el texto «menos de 30 %» queda mintiendo hasta A6. A2 cambia el texto de `LineaMargen` en el mismo PR a «Aguanta poca rebaja · sube a S/ piso».
23. **La definición del piso, escrita sin ambigüedad.** «20 % sobre lo tuyo» significa un margen del 20 % sobre el precio rebajado sin IGV, no un recargo del 20 % sobre el costo. Es lo que da ≈ costo × 2.27 y lo que hace `margen()`/`piso()` de la maqueta (:208). Con un recargo saldría ×2.18. La prueba fija los dos valores para que nadie lo «arregle».
24. **El costo con descuento de la orden.** «Usar S/ total» y «escribió sin IGV» usan el costo NETO de la línea, después de `descuentoPct`, que `cuentaDeLinea` ya maneja.

## 3. El plan corregido

**A0 · ADR, una reserva, mediciones y preguntas** (S, solo documentos)
- **Archivos:**
  - Reservar el ADR con `pnpm reservar adr`. Las migraciones se reservan al empezar cada actividad.
  - Commit de la maqueta.
  - `docs/SESIONES-ACTIVAS.md`, la bitácora y el backlog del día.
- **Mediciones de solo lectura en producción:**
  1. Cuántas prendas caen en ámbar con el piso ×2.27.
  2. Las prendas del Taller y su costo (sin IGV).
  3. Si alguna línea con orden precarga el costo desde `variantes.costo` (riesgo de dividir dos veces).
  4. El nombre del CHECK de `precio_propuestas`.
  5. `pg_get_functiondef` de las funciones a anclar: `fn_recepcion_entrar`, `recibir_lote`, `cambiar_precio_en_recepcion`, `poner_precio_sede`, `validar_precios_en_recepcion`, `aplicar_precio_propuesto` y `registrar_venta` (esta solo para leerla).
  6. Si #1369 está en producción.
  7. ADR-0393 en producción, para borrar `HojaPrenda`.
  8. Las prendas con campaña activa o precio de sede que quedarían bajo el costo ×1.18.
- **Preguntas:**
  - Al contador, con la nota de las dos opciones de libro (corrección 2).
  - A Felipe: (c) si el costo vacío sigue permitido en Nuevo producto; (d) el peor veredicto entre las combinaciones; (e) Frescura; y la del Taller (corrección 6).
  - (a) y (b) ya están decididas y no se preguntan.
- **Antes de empezar:** que se fusione #1874.
- **Espera OK de Felipe:** sí, del ADR.

**A1 · Refactor neutro: la cuenta en un solo módulo** (S, igual que el plan)
- `lib/cuenta-de-precio.ts` en céntimos, con `conRebajaCts`, `margenPorMilCts`, `aguantaCts`, `precioMinimoCts`, `cuentaDeLinea`, `redondearA90` e `IGV`.
- Las pruebas no cambian de valor. Knip.
- No espera OK.

**A2 · Una sola cuenta, fuera «RUC ⇒ factura»** (M)
- Como el plan, más:
  - el texto ámbar nuevo en `LineaMargen`, en el mismo PR;
  - el piso con su prueba de definición (×2.27 y no ×2.18);
  - la decisión 4 completa: tachar la factura del proveedor del backlog y borrar el `ruc` si queda huérfano.
- `pideRevisarAlRecibir` queda sin `conFactura`, pero el disparo `costo_cambio` queda APAGADO en las líneas con factura hasta A11.
- Se escribe para Dynamic: «queda como tarea allá».
- /milimetro auditar, /guia, /abrir-pr. No espera OK.

**A3 · Quien fija el precio ve el costo; el cliente nunca** (M, SQL)
- `fn_precio_referencia` v1:
  - el costo anterior en la base del papel (×1.18 si su entrada fue con factura, hasta A11), con `base_anterior`;
  - el subtotal NETO sin IGV de la línea de orden;
  - la banda p10–p90 de la categoría, o la de CAYLA;
  - `fuera_de_motores`;
  - `techo: null`.
- Se redefine `fn_ve_costos_al_recibir()` como «puede fijar precio en esta hoja» (decisión 11), en vez de crear otra puerta.
- La web dice qué pasa si la RPC no responde (corrección 18).
- El escáner mira datos y RPC (corrección 21), más su prueba de Postgres sobre las claves del JSON.
- Va en una parte, sin políticas.
- **Espera OK de Felipe:** sí, por el permiso y el SQL.

**A4 · Candados de costo** (M/L, SQL en dos partes)
- `dudasDeCosto` con tres dudas: anterior, sin IGV (sobre el neto) y banda. «Precio ≤ costo» queda fuera: es un aviso rojo que no apaga el sugerido.
- `fn_costo_dudoso` llama a `fn_costo_fuera_de_banda`.
- La confirmación es por MONTO (`confirma_costo: numeric`), y editar el costo la borra.
- La comparación es contra el precio de la sede.
- Las anclas salen de la definición viva y se ensayan en un lote que termina en excepción.
- /focus, /milimetro, /chaos (doble clic, recargar, dos pestañas, confirmar 440 y escribir 4400), /abrir-pr.
- **Espera OK de Felipe:** sí.

**A5 · «Pierdes» pide confirmar, no prohíbe** (M, SQL)
- Las cuatro funciones del plan más `mayor_que_precio` de la recepción pasan a `p_confirma_perdida`.
- `p_precio_antes` como bloqueo optimista.
- «Pierdes» se evalúa con la variante bloqueada y el costo vigente.
- Una sola hoja de confirmación por guardado.
- Va después de #1880.
- Se publica el SQL ANTES que la web.
- La caja queda fuera, anotada en el backlog.
- /chaos con dos cuentas a la vez.
- **Espera OK de Felipe:** sí.

**A6 · La pieza `<CuentaDelPrecio>` en la hoja de Recibir** (L)
- Como el plan.
- Se agrega por escrito la regla para cuando algo no responde: sin IA o sin referencia, piso y cuenta igual; nada espera a la IA.
- `revisarPrecioDeLaIA` queda acotada entre el piso nuevo y el techo.
- /milimetro diseñar antes del código y auditar al final; /unificar (Felipe elige mirando); /focus, /sugerir, /guia, /formidable, /chaos; 375 px.
- **Espera OK de Felipe:** sí.

**A7 · Recibir: la tabla del cierre y la Vitrina** (M)
- El chip y «Te quedan» por fila, el peor veredicto entre combinaciones, y borrar `HojaPrenda` según A0.
- El aviso «Pagaste S/ X más» y el `costo_cambio` NO salen aquí: pasan a A7b.
- No espera OK.

**A8 · Nuevo producto** (M)
- Como el plan.
- «Pierdes» no cuenta como falta; un costo dudoso sí.
- **Espera:** la pregunta (c).

**A9 · Catálogo: precio de la ficha y por sede** (M)
- Como el plan, con `p_precio_antes`.
- Si no hay costo, la barra se calla.

**A10 · Campañas** (M)
- Como el plan.
- Un costo sin permiso es nulo, nunca 0.

**A11 · La base guarda con IGV y se corrige ×1.18** (L, SQL)
- Sube a la posición 3 apenas responda el contador.
- Va en UNA ventana, en este orden:
  1. P6, la opción de libro que elija el contador.
  2. P1, más la guardia y quitar el `execute` de `recibir_compras`.
  3. La web de `CorregirCostoModal` y `CostoPrenda`, «con IGV».
  4. P5: fechado hoy, sin tocar meses cerrados, con las variantes bloqueadas, idempotente por fila con su `costo_correcciones`, sin tocar `venta_items`, y con el camino de vuelta escrito.
- Antes de P5: la medición 8 de A0 y la decisión de Felipe sobre las campañas activas.
- El Taller se lleva según la respuesta a la corrección 6.
- /rigor, /ultra-criterio, /abrir-pr.
- **Espera OK de Felipe y del contador:** sí, de los dos.

**A7b · Reposición: «Pagaste S/ X más»** (S)
- Va después de A11.
- `subioElCosto` (el caso 2 de la maqueta) y vuelve a encender `costo_cambio`.
- `fn_precio_referencia` deja de usar `base_anterior`.
- /chaos.

**A12 · El techo de las parecidas** (L, SQL)
- Va después de A11.
- Como el plan: `referencia_vieja` y `sin_referencia` con su motivo, mínimo 3 parecidas, y el techo de una sede solo para quien la opera.
- Se avisa a la sesión de Frescura.
- **Espera OK de Felipe:** sí.

**A13 · Unificar Productos, Revisar precios y la IA en la base** (M, SQL en tres partes)
- Como el plan.
- Además, `aplicar_precio_propuesto` vuelve a calcular el piso con el costo actual (corrección 12).
- La prueba cruzada TS↔SQL del piso.
- **Espera OK de Felipe:** sí.

**A14 · Las varas que responden otra pregunta** (M)
- Como el plan: misma cuenta, cada una con su umbral; Finanzas no se toca.
- **Espera OK de Felipe:** sí, de los umbrales.

**A15 · Cierre** (S)
- La fila nueva en «Una función, una pieza» de `CLAUDE.md`, el ADR al día, la deuda de knip.
- Borrar `precioMinimoCts` y lo que quede sin uso.
- El `git grep "/ 1.18\|\* 0.7\|0\.70\|conFactura\|precioMinimoCts"` en `apps/web/lib` solo puede dar `cuenta-de-precio.ts`.

**Orden final:** A0 → A1 → A2 → (A11 si el contador ya respondió) → A3 → A4 → A5 → A6 → A7 → A8 → A9 → A10 → A11 (si no subió antes) → A7b → A12 → A13 → A14 → A15.

DECIDÍ: dejar la publicación de A11 donde está, pero mover la pregunta al contador a A0 y aislar en A7b lo que no aguanta costos mezclados.
DESCARTÉ: pegar P1 solo al principio, porque el IGV se cuenta dos veces en el libro desde la primera factura vendida. También descarté seguir con «Pagaste más» antes de A11, porque inventa una subida en cada reposición con factura.
SE ROMPE SI: el contador elige la opción (i) y la 201 muestra el inventario con el IGV de lo que no se vendió, o si P5 se pega con una campaña activa que deja prendas bajo el nuevo costo y la caja rechaza ventas a mitad de día.

OBJECIÓN: la decisión 9 pone «precio ≤ costo» entre los candados que no dejan sugerir, pero la maqueta aprobada lo muestra como un aviso que sí deja sugerir. Seguí la maqueta, y conviene que Felipe lo confirme en una línea.
LO QUE NO PIDIÓ: las prendas del Taller entran con costo sin IGV (`20261015040000:69,290`). Sin una decisión ahí, «una sola cuenta para todas las prendas» queda incumplida para siempre en todo lo que fabrica CAYLA.