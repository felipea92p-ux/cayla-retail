# Pantalla — Traslados (`/inventario/traslados`, `/inventario/mover`, `/inventario/traslados/[id]`)

> Modo: **recorrido de usabilidad como persona sin contexto** (no es el análisis de seis dimensiones de `/pantalla`) · Fecha: 2026-09-26 · Rol/sede: Felipe (Admin y Líder) parado en Tienda Trujillo para enviar y en Tienda Lima para recibir; 1366×768 y 375 px · Datos: **local** (siembra + el Traslado 3 creado en la prueba) y consultas de **solo lectura** en producción (`cayla-dynamic`, schema `retail`), corridas por Claude con la herramienta MCP.
> SHA analizado: `2227a9fd` (recorrido). Al escribir, `origin/main` es `42fb0320`: el único cambio en estos archivos es que «+ Nuevo traslado» pasó de `pie` a `acciones` en la cabecera (#494). Si `MoverMercaderiaFormV2.tsx`, `TrasladoDetallePanel.tsx`, `TrasladosLista.tsx`, `lib/traslados.ts` o `lib/traslados-reglas.ts` cambian, este análisis está vencido.
> Archivos: `app/(app)/inventario/traslados/page.tsx` · `traslados/[id]/page.tsx` · `inventario/mover/page.tsx` · `components/TrasladosPanel.tsx` · `TrasladosLista.tsx` · `TrasladoEstado.tsx` · `TrasladoDetallePanel.tsx` · `MoverMercaderiaFormV2.tsx` · `lib/traslados.ts` · `lib/traslados-reglas.ts` · RPC `iniciar_traslado`, `registrar_recepcion_traslado`, `confirmar_traslado`, `cerrar_traslado_con_diferencia`, `fn_traslado_lineas`, `fn_sububicacion_por_defecto`, `recibir_envio` · tablas `transferencias`, `transferencia_items`, `transferencia_recepciones`, `stock`, `movimientos`, `sububicaciones`.
> Otra sesión tocándola: no (`docs/SESIONES-ACTIVAS.md` sin filas vigentes sobre la ruta; la última fila de Inventario es del 22-09).
> Método: navegador del panel lateral con el criterio de Playwright (buscar por texto y rol, clics y teclado reales, comprobar en la base con `psql`). Sin verificador independiente. **No se probó con una integrante ni con una terminal** (no se puede iniciar sesión por otra persona): lo que verían se razona desde el código y va `[inferido]`.
> Etiquetas: `[visto]` en pantalla · `[código archivo:línea]` · `[local]` consulta a la base local · `[producción]` consulta de solo lectura · `[inferido]`.

## 0 · Veredicto
La pantalla se ve cuidada, pero el flujo falla justo donde una persona sin contexto más ayuda necesita: **cuando llega la caja** (el sistema dice que no hay nada que hacer) y **cuando quiere vender lo que llegó** (quedó en el almacén, no en el piso). Producción tiene 4 traslados, todos vacíos, del 16 y 17-09 `[producción]`: el módulo lleva cuatro rediseños (ADR-0068, 0105, 0173, 0175) sin un solo traslado real.

Recorrido hecho: Trujillo envió 2 Vestido Antonella M rosado + 1 Blusa Valentina S blanca a Lima (Traslado 3); Lima contó 2 + 0, lo registró con diferencia, el líder lo cerró y se intentó vender el vestido en Vender.

## 1 · Lo que rompe el día a día

1. **Recibir no deja la ropa lista para vender.** Al cerrar, el aviso dijo «2 prendas entraron al stock de Tienda Lima» `[visto]`; en Vender, el vestido respondió «está en el almacén… que la bajen en Inventario › Existencias › Reponer (aunque ya la tengas en la mano)» `[visto]`. Lo que llega por traslado entra a `almacen_tienda` y la venta descuenta de `piso_venta` `[código supabase/migrations/20260914230000_inventario_piso_almacen.sql:82-85]` `[local]`. Traslados nunca menciona ese paso. → Preguntar al confirmar «¿piso de venta o almacén?» o «Bajar todo al piso» en el mismo aviso (decisión 6.3).
2. **Con la caja en la mano, el sistema dice que no hay nada que hacer.** Inicio: «Al día… traslados por atender»; lista: «Nada requiere tu acción», «Por recibir hoy: 0», sin número en el menú; la fila solo ofrece «Ver detalle» `[visto]`. Un traslado recién es «por recibir» cuando pasa la hora que *estimó* quien lo envió `[código apps/web/lib/traslados-reglas.ts:78-90]`. → Todo traslado en camino hacia mi sede cuenta como «por recibir», y la fila lleva «Recibir».
3. **Si falta una prenda, no entra ninguna.** Con 2 de 3 contadas, los 2 vestidos que ya estaban en Lima quedaron fuera del stock hasta que un líder cerró `[visto]` `[local]`; `confirmar_traslado` solo aplica movimientos si todas las líneas coinciden `[código supabase/migrations/20260916150000_traslados_dos_fases.sql:256]` `[producción]` (misma lógica). Con 80 prendas y 1 faltante, la tienda no vende 79 hasta que aparezca un líder (decisión 6.1).
4. **Si te interrumpen mientras cuentas, pierdes lo contado.** Conté un vestido, recargué y la casilla volvió vacía `[visto]`: el conteo vive solo en el estado de React `[código apps/web/components/TrasladoDetallePanel.tsx:63]`. Recibir mercadería (`/recibir`) sí tiene cola sin conexión (ADR-0210). → Guardar el borrador de cada línea al contarla.
5. **Un envío equivocado no se puede cancelar.** Del lado de quien envía, el detalle no tiene un solo botón `[visto]`. No existe función para cancelar ni en el repo, ni en local, ni en producción `[código]` `[local]` `[producción]`, aunque Roles y accesos promete «Enviar, recibir, **cancelar** y cerrar con diferencia» `[código apps/web/lib/modulos.ts:58]` `[código supabase/migrations/20260923030000_roles_por_modulo.sql:91]`. Hoy, deshacer un error obliga a que la otra sede registre 0 y un líder lo dé por perdido: una pérdida falsa (decisión 6.4).

## 2 · Lo que hace mandar lo que no querías

6. **El formulario decide por ti.** Destino ya puesto en el primero de la lista («Taller») `[código apps/web/components/MoverMercaderiaFormV2.tsx:75]`, primera prenda ya elegida `[código :84]` y cada «+ Agregar línea» agrega otra «Blusa Valentina L» `[código :100]` `[visto]`. Si se te olvida una línea, esa blusa viaja. → Destino y prendas vacíos hasta que los elijas.
7. **El buscador de prendas no entiende cómo busca la gente.** «vestido rosado M» → «Nada coincide», y existe `[visto]`: el combo busca el texto pegado tal cual. El buscador por palabras (`lib/filtro-busqueda-especial.ts`) ya sirve en Existencias, Análisis y Movimientos, no aquí. Cada opción trae el código interno en medio y ninguna foto `[código :283]`.
8. **La cantidad cambia sola.** 9 donde había 5 → al salir del campo quedó en 5, sin aviso `[visto]` `[código :140-149]`. «stock 5» es solo lo del almacén, no lo colgado en el piso `[código apps/web/app/(app)/inventario/mover/page.tsx:52]`, y no lo dice. → Dejar el 9 y decir en rojo «solo hay 5 en el almacén de Trujillo».
9. **La fecha de llegada es obligatoria y no lo dice.** «Nota» dice «(opcional)»; la fecha, nada. El campo es un `datetime-local` («dd/mm/aaaa, --:-- -----»); si queda vacío, el aviso sale arriba a la derecha, lejos del campo `[visto]` `[código :158]`. Y de esa fecha adivinada depende el punto 2. → «Hoy / Mañana / Pasado mañana» con hora opcional.
10. **Envías a ciegas y sin papel.** No hay resumen antes de enviar; después, «3 unidades» sin número de traslado, sin lista y sin nada que imprimir para meter en la caja `[visto]` `[código :197-221]`. Quien recibe no tiene con qué comparar (y la guía de remisión de SUNAT sigue pendiente).

## 3 · Recibir

11. **«Coincide» invita a no contar.** Cada fila muestra lo enviado y un botón que lo copia de un toque `[código apps/web/components/TrasladoDetallePanel.tsx:578]`. ADR-0173 dice «se cuenta, no se asume»; el botón asume (decisión 6.2).
12. **El campo de escanear falla con quien no tiene pistola.** «vestido» → «No encontramos el código "vestido" en el catálogo», y está en el catálogo y en la caja `[visto]` `[código :284]`; el error rojo siguió en pantalla después de un escaneo bueno (`alEscanear` no lo borra, `:136`). Las sugerencias solo miran el `sku` legado `[código :86-91]` y el campo pide «escribe el SKU»: en producción **144 de 146** variantes no tienen `sku` `[producción]` y `fn_traslado_lineas` devuelve `va.sku` `[producción]`, así que bajo cada prenda el código saldría vacío `[inferido]`. En local se ve «VES-ANTO-ROS-M» mientras la etiqueta y Vender dicen «VES-0002-ROS-M» `[visto]`. Escanear la etiqueta completa sí funciona (el código de etiqueta está en `codigos_barras` para las 145 que lo tienen `[producción]`).
13. **Los botones se mueven mientras cuentas.** Cuando aparece la píldora «Coincide» en una fila, la columna se corre ~47 px (el «−» pasó de x≈965 a 918) y el clic cae en la casilla `[visto]`. → Anchos fijos de columna.
14. **Lo irreversible es lo único que no pide confirmación.** «Confirmar recepción» abre un modal; «Cerrar con esta diferencia», que da prendas por perdidas, se ejecuta al primer clic `[código :465]` `[visto]`. El texto dice «Las 1 que no llegaron…» `[código :448]`; el ejemplo del campo («Tienda LIM los encontró en su almacén», `:458`) contradice la acción; el modal de confirmar da totales pero no dice qué prenda falta `[código :495]`.
15. **Después de cerrar, la pérdida desaparece.** En la lista, el Traslado 3 sale «Completado» en verde y «Con diferencia: 0 casos — Todo coincide por ahora» `[visto]`; el detalle dice «Cerrado con diferencia» `[visto]`. La regla existe `[código apps/web/lib/traslados-reglas.ts:515]` y la lista no le pasa el dato `[código apps/web/components/TrasladosLista.tsx:210]`. Trujillo, que envió, no recibe aviso: el contador solo mira el destino `[código apps/web/lib/traslados.ts:249]`. La blusa perdida no queda como pérdida en `movimientos`: solo en la nota del traslado `[local]`.

## 4 · Orientarse

16. **«Nuevo traslado» te saca de Traslados.** Lleva a «Mover mercadería» (`/inventario/mover`) y el menú marca «Existencias» `[visto]`. En un solo flujo conviven traslado, mercadería, lote, línea, variante, SKU, «u.» y movimiento, y un mismo estado con varios nombres (Completado / Cerrados / Cerrado con diferencia). Subtítulos que hablan como programador: «no se edita el stock a mano» `[código mover/page.tsx:78]`. «Eres admin: no necesitas autorización» no dice para qué.
17. **Tarjetas que se contradicen y lista escondida.** En Trujillo, «Vienen en camino: 0 … · 1 sale de tu sede» junto a «Prendas en tránsito: 3», que eran salientes `[visto]`. A 375 px, el primer traslado aparece a 993 px, bajo el borde (812), detrás de cuatro tarjetas en cero `[visto]`. Buscar un traslado por el código de la etiqueta da 0; por el `sku` legado lo encuentra `[visto]` `[código apps/web/lib/traslados.ts:91]`.

## 5 · Lo que está bien y no se toca
- **Enviar es idempotente:** un token por intento; dos clics no descuentan dos veces (ADR-0190) `[código MoverMercaderiaFormV2.tsx:88-90]`.
- **El stock cuadra:** Trujillo bajó 5→3 y 5→4 al enviar; Lima subió +2 solo al cerrar `[local]`.
- **El detalle cuenta bien la historia:** recorrido en 4 pasos con quién y cuándo, tres cifras y «Tú ya hiciste tu parte» para quien envía `[visto]`.
- **El modal de confirmar dice la consecuencia** («nada entra al stock hasta que un líder lo revise») y el cierre exige nota `[visto]`.
- **Existencias ya muestra «En camino hacia acá»** `[código apps/web/components/InventarioPanel.tsx:637]`.
- **Celular sin desborde horizontal** a 375 px en lista y formulario `[visto]`.

## 6 · Decisiones de Felipe (no son de código)
1. **Todo o nada al recibir (§3).** Recomendación: entra lo que coincide; solo la línea con diferencia espera al líder. Ganas: la tienda vende lo que llegó bien. Pagas: un traslado queda «a medias» en la base.
2. **Conteo a ciegas (§11):** contar sin ver lo que dice la guía, como la encargada que cuenta la caja antes de mirar el papel. Recomendación: ocultar «Enviado» hasta terminar, con el escáner como camino rápido. Ganas: control real. Pagas: tiempo al recibir.
3. **Piso o almacén al recibir en tienda (§1).** Recomendación: preguntarlo al confirmar, con «piso» marcado.
4. **Quién anula un envío y hasta cuándo (§5).** Recomendación: quien envió o un líder, mientras nadie haya empezado a contar; anular devuelve el stock al origen con su movimiento.

## 7 · Objeción al método
Se probó como Admin/Líder: no se vivió el combo «Responsable» ni el candado de asistencia que ve una tienda real todos los días. Y quien construyó el sistema no puede olvidar lo que sabe. Esto aproxima; no reemplaza 15 minutos mirando a una integrante de TRU recibir una caja de verdad, sin ayudarla.

## 8 · Lo que no se pidió
**Hay dos puertas para recibir el mismo traslado:** este detalle y Compras › Recibir mercadería (`recibir_envio` → `confirmar_traslado`), con reglas distintas: una tiene cola sin conexión y la otra pierde el conteo; la segunda solo acepta el traslado si llega junto con algo de un proveedor `[código supabase/migrations/20260919121000_recibir_envio.sql:102]`. ADR-0113 se titula «una sola puerta para recibir». Cada arreglo de recepción de esta lista se haría dos veces, y quien recibe no sabe cuál usar.

## 9 · Descartado tras verificar (no son fallas de la app)
- La sede saltó sola de Lima a Trujillo dos veces: la cookie `cayla_ubicacion_activa` es de `localhost` y la pisaban otras sesiones abiertas en :3012/:3014. Al repetir, se mantuvo.
- A las 13:12 otra sesión cerró un conteo en Trujillo sobre la misma base local (ajustes −2 y −1): no es del traslado.
- El panel no escribe en un `datetime-local`; la fecha se puso por script (setter nativo + evento `input`).
- La cabecera en blanco de algunas capturas es del panel (dibuja con retraso); el `h1` estaba visible.
- El primer aviso «Indica cuándo esperas que llegue el traslado» sí salió: dura 8 s y la captura llegó tarde.

## 10 · Qué quedó y cómo repetirlo
- En la base **local** queda el Traslado 3 (Trujillo → Lima, cerrado con la blusa como faltante; los movimientos no se borran).
- Producción, solo lectura: `select count(*) filter (where coalesce(sku,'')='') from retail.variantes` (144 de 146) · cuerpo de `fn_traslado_lineas` (`va.sku`) · `confirmar_traslado` (`if v_distintas = 0`) · `pg_proc` sin función de cancelar · `retail.transferencias` (4 filas, 0 líneas).
