# Spike visual · Notas de crédito de compra (2026-09-19)

> **Estado: propuesta, sin implementar.** Nada de esto está en `apps/`, `supabase/` ni en producción. Este HTML es la referencia
> visual para que Felipe decida; lo que requiere migración está marcado abajo y se puede ver encendido dentro del propio HTML.

`notas-credito-vivo.html` — autocontenido (CSS y JS inline), ábrelo con doble clic. Datos inventados; «hoy» fijo en 18/09 para que cuadre
con el spike de Por pagar (mismos proveedores, mismo F001-000482). Único acceso a red: las dos fuentes de Google Fonts, igual que el spike
de Por pagar; sin red cae a las fuentes del sistema y todo funciona.

**Pedido de Felipe:** «Aplicar un módulo más para las notas de crédito, para no mezclarlas en Recepción de mercadería».
**Ruta propuesta:** `/compras/notas-credito` (hermana de `/compras/por-pagar`), solo líder (ADR-0126).

## Cómo mirarlo

Botones de la franja punteada de arriba: «Repetir la entrada», «Movimiento reducido», «Restablecer datos», **«Mostrar lo que requiere
migración»** (dibuja un borde ámbar y la etiqueta sobre cada pieza que la base de hoy no soporta), **«Ver Recepción (así queda)»** (la
comparación antes/después) y «Simular: nada por reclamar» (el estado vacío).

**Recorrido sugerido:** toca la fila de *Confecciones Sur Andino* (la única con el punto que late) → «Registrar nota» → escribe un monto de
más y mira el error con su salida («Usar S/ 330.40») → registra y mira cómo se reordena la pantalla → *Saldos a favor* → «De qué viene» →
«Pedir reembolso» → «Usar en un pago» → *Ver Recepción*.
Atajos: `/` buscar · `j` `k` (o ↑ ↓) moverse · `Enter` vista rápida · `N` nueva nota · `Esc` cierra lo de encima.

## Qué muestra

| # | Pantalla | Qué hace |
|---|---|---|
| 1 | **Tablero** | 4 cifras que cuentan (Por reclamar · Emitidas este mes · Saldo a favor total · Aplicado este mes); la barra de «Por reclamar» *es* el dato (3 tramos de antigüedad) y al tocarla filtra la lista; pestañas con pulgar deslizante (Por reclamar · Emitidas · Aplicadas · Todas); búsqueda con `/`; agrupar por urgencia o por proveedor (las filas se deslizan con FLIP); chip «Hace 19 días» con el punto que late **solo** en el reclamo más viejo (tope de rojo por pantalla). |
| 1b | **Vista rápida** (cajón) | Línea de vida de 4 puntos, «siguiente paso» sugerido según el caso (cierra las unidades que faltan / reclámala / ya van 19 días: llama), ↑ ↓ para recorrer la lista. |
| 2 | **Detalle** (modal ADR-0136) | Cabecera con estado, línea de tiempo vertical (faltante → reclamada → nota recibida → aplicada), prendas que la originan con costo + IGV, comprobante de origen con enlace, «qué pasará / qué pasó con el dinero» con barras, adjunto, mensaje listo para copiar al proveedor (con «Copiado» que se dibuja), historial que no se edita. |
| 3 | **Registrar nota** (modal) | Viene precargada desde una «nota pendiente» (o manual: proveedor + comprobante). Motivo, serie-número, fecha, monto, adjunto. Vista previa del **efecto** en vivo: «La nota baja lo que se debe de F001-000482 de S/ 3,923.60 a S/ 3,076.36», barra de reparto (baja la deuda / queda a tu favor), y antes → después de deuda, saldo a favor y crédito fiscal (IGV). Errores: serie faltante o repetida, fecha anterior al comprobante, monto que no cuadra (con botón «Usar S/ …»), «faltante» bloqueado con su porqué. Al registrar: «visto» que se dibuja y la pantalla reacciona (cifras cuentan, la fila sale de «Por reclamar», aviso con «Verla»). |
| 4 | **Saldos a favor** | Total por proveedor, de qué notas viene (libro con saldo corrido), «Usar en un pago» (modal que muestra qué verías en Por pagar; el saldo viene **apagado**: se sugiere, lo decide quien paga) y «Pedir reembolso» (monto, medio, referencia, fecha; el saldo baja en vivo). |
| 5 | **Vacíos, errores y Recepción** | «Nada por reclamar» (trazo que se dibuja), «Ninguna nota coincide con …», sin saldos. **Recepción sin la nota adentro**: solo la decisión de faltante y el chip «Se reclama en Notas de crédito ↗»; confirmar la recepción crea de verdad la nota pendiente en el módulo. Con el interruptor «Hoy» se ve la versión actual para comparar. |

Movimiento: entrada escalonada (≤ 40 ms de desfase, una sola vez), cifras que cuentan, pulgar deslizante, FLIP al filtrar/agrupar, cajón
que se desliza, modales con la regla de ADR-0136 (velo → hoja que sube 18 px y crece → cascada de 55 ms → salida de 220 ms; en móvil, hoja
desde el borde), barras que se llenan, «visto» que se dibuja, una sola animación en bucle (el punto de lo urgente y el hilo mientras la base
responde). Todo se apaga con `prefers-reduced-motion` (y con el botón del spike).

## Mapa pantalla → datos reales

Verificado contra `docs/datos/generado/DICCIONARIO-RETAIL.md`, `funciones-produccion.txt` y las migraciones `20260918215000` a `20260918220000`.

| Pieza de la pantalla | Tabla / columna / RPC que ya existe | Estado |
|---|---|---|
| «Por reclamar» (lista y cifra) | `compras_nota_pendiente(p_compra_ids uuid[])` → `unidades_cerradas`, `monto_esperado`, `resuelto`. Líneas: `compra_item_cierres` (`cantidad`, `motivo`, `nota`, `usuario_id`, `created_at`) × `compra_items.costo_unitario` | Existe, **pero** exige pasarle los ids: hay que conocerlos → **requiere función de lectura nueva** (ver abajo) |
| Antigüedad («Hace 12 días») | `compra_item_cierres.created_at` (fecha del cierre, hoy de Lima) | Existe |
| «Falta cerrar 12 uds» (bloqueada) | `compras.facturado_cantidad − recibido_cantidad − cerrado_cantidad`; regla `disponibilidadNota` en `lib/recepciones-reglas.ts` | Existe |
| Lista de notas registradas | `compra_notas_credito` (`serie_numero`, `fecha`, `subtotal`, `igv`, `monto`, `aplicado`, `motivo`, `nota`, `cierre_id`, `usuario_id`) | Existe. Hoy solo se lee **de a un comprobante** (`getNotasCreditoCompra`) → falta lectura transversal |
| Motivos de la nota | `faltante · devolucion · descuento · otro` (CHECK `compra_notas_credito_motivo_check`). «Precio» de Felipe = `descuento`. «Mercadería dañada» **no** es motivo de nota: es motivo del *cierre* (`danada`) y la nota va como `faltante` | Existe (se muestra «Descuento (precio)») |
| Registrar | `registrar_nota_credito_compra(p_compra_id, p_serie_numero, p_fecha, p_monto, p_motivo, p_nota, p_cierre_id)` — solo líder, reglas de `fn_insertar_nota_credito_compra` (una por faltante y comprobante, resuelto al 100 %, tope = cerrado a su costo con IGV + S/ 1, suma de notas ≤ total, fecha no futura ni anterior a la emisión, serie única por comprobante) | Existe. **La pantalla nunca manda `p_cierre_id` ni `p_nota`** (`DRIFT.md`); el spike tampoco los pide |
| Efecto («baja de X a Y», «quedan S/ … a favor») | `reparteNota` / `textoReparteNota` / `efectoCierre` (`lib/recepciones-reglas.ts`); la base guarda `aplicado = min(monto, saldo)` | Existe (reutilizar tal cual) |
| Crédito fiscal (IGV) del mes | `compras_resumen_extra` → `igvMes` (`lib/compras-indicadores.ts`) | Existe |
| Saldo a favor por proveedor | `fn_saldo_favor_proveedor(p_proveedor_id)` (suma de `proveedor_creditos`); en lista, `fn_proveedores().saldo_favor` | Existe. **Ojo: el libro se llama `proveedor_creditos`, no `libro_creditos`** |
| «De qué viene» (libro con saldo corrido) | `fn_proveedor_creditos(p_proveedor_id, p_limite)` → `tipo`, `monto`, `fecha`, `documento`, `nota_serie_numero`, `metodo`, `referencia` | Existe (ya lo usa la ficha del proveedor) |
| «Usar en un pago» | Enlace a `/compras/por-pagar?prov=<id>&marcar=1`; el descuento lo hace `registrar_pago_compras(..., p_credito)` desde «Pagar juntos» (commit `9f707bd6`: se sugiere, no viene marcado) | Existe |
| «Pedir reembolso» | `registrar_reembolso_proveedor(p_proveedor_id, p_monto, p_metodo, p_referencia, p_fecha, p_nota)` — solo líder, monto ≤ saldo, no mueve caja | Existe, pero **registra un reembolso que ya ocurrió**: no hay «pedido / pendiente» |
| «Aplicado este mes» | Σ `compra_notas_credito.aplicado` del mes + Σ `proveedor_creditos` (`tipo = 'aplicacion'`) del mes | Existe (calculable) |
| Permisos | `fn_puede_ver_dinero_de_compras()` (notas) y `fn_puede_registrar_compras()` (libro): hoy ambas = líder | Existe |

### Qué requiere migración (se ve en el HTML con «Mostrar lo que requiere migración»)

1. **Una función de lectura para el tablero** (`notas_credito_tablero()` o similar): devuelve, en una llamada, las notas pendientes de *todos* los
   comprobantes vigentes + las notas registradas con proveedor y comprobante. **Es una función de lectura, no cambia ninguna tabla**; con
   candado `fn_puede_ver_dinero_de_compras()` y `security definer` como `compras_nota_pendiente`. Sin ella el módulo no arranca.
2. **«Reclamada al proveedor»** (paso 2 de la línea de tiempo, «Marcar como reclamada», recordatorio a los 14 días): hoy no existe dónde guardarlo.
   Propuesta mínima: tabla `compra_nota_reclamos (id, compra_id, fecha, medio, nota, usuario_id, created_at)`, append-only como el resto del libro,
   RLS de lectura solo líder. Sin ella el módulo funciona igual, solo que sin ese paso.
3. **Adjunto de la nota**: `compra_adjuntos` cuelga del comprobante (`compra_id`), no de la nota. Propuesta: columna nullable `nota_credito_id`
   (+ misma ruta `<compra_id>/…`, mismo bucket `retail-compras-adjuntos`, mismos tipos y tope de 10 MB, que ya se validan). Sin ella, el adjunto se
   sube al comprobante y no se sabe de qué nota es.
4. *(Opcional, ver decisión D3)* `proveedor_creditos.nota_credito_origen_id` en los movimientos `aplicacion`/`reembolso`, para saber de cuál nota
   salió cada uso. Sin ella el spike **deduce** el estado «Aplicada» con orden de llegada (FIFO) por proveedor.
5. *(Opcional)* Estado «reembolso solicitado» si Felipe quiere que «Pedir» deje algo pendiente en vez de registrar lo ya recibido.

## Lo que hoy está mezclado en Recepción (y el módulo separa)

Verificado leyendo el código:

- `components/RecepcionEnvio.tsx` (líneas ~564–630 y ~1313) arma un `bloquesNota` por comprobante, valida serie y monto **antes de recibir**, y renderiza
  `NotaCreditoCierre` **dentro de la guía de recepción** (interruptor «Ya tengo la nota de crédito del proveedor», serie, fecha, monto, «Cómo quedan tus cuentas»).
- `components/NotaCreditoCierre.tsx` (210 líneas) trae consigo `igvMes`, `saldoFavorAntes`, `porRecibirAtrasadas` y el encadenado entre comprobantes del mismo proveedor:
  plomería de **dinero** dentro de una pantalla que también usa un colaborador de sede para contar.
- `recibir_envio(..., p_notas_credito jsonb, ...)` recibe las notas junto con el conteo; `EnvioRecibido.tsx` cuenta «N notas de crédito registradas».
  Una recepción que solo debía contar y cerrar termina escribiendo dinero (`compra_notas_credito`, `proveedor_creditos`) en la misma transacción.
- `components/AccionesFaltantes.tsx` (`BotonRegistrarNota`, `RegistrarNotaModal`) vive en el detalle del comprobante: una **segunda** puerta de entrada al mismo formulario.
- `lib/recepciones-reglas.ts` mezcla reglas de recepción (`cierresElegidos`, `sinDecidir`, `etiquetaConfirmar`) con reglas de dinero de la nota (`notaDelBloque`, `reparteNota`, `efectoCierre`).

**Cómo queda con el módulo:** Recepción conserva contar y decidir (`DecisionFaltanteFila`: «los espero» / No llegaron / Dañadas / Error del proveedor) y suma un chip que apunta al módulo.
El formulario de la nota vive en un solo lugar. `recibir_envio` puede seguir aceptando `p_notas_credito` (compatibilidad) pero la pantalla deja de enviarlo: **sin migración**.

## Cómo se conecta

- **Qué sale de Recepción:** `NotaCreditoCierre`, el estado `notas` de la guía, la validación de serie/monto, el contador «notas registradas» de `EnvioRecibido`, y `BotonRegistrarNota` del detalle (queda un enlace al módulo con el comprobante precargado).
- **Qué queda:** decidir qué pasó con lo que faltó (cierre append-only). Al confirmar, `cerrar_linea_compra` crea el cierre y `compras_nota_pendiente` empieza a devolver ese comprobante: **aparece solo en «Por reclamar»** (el spike lo demuestra al confirmar la recepción).
- **Con Por pagar:** la nota que baja una deuda ya se refleja en `compras.saldo`/`notas_credito` (no cambia). Lo que sobra queda a favor y Por pagar lo **sugiere** en «Pagar juntos» (`p_credito`); el módulo solo *lleva* ahí («Usar en un pago» → `?prov=…&marcar=1`). Regla de Felipe respetada: nunca se descuenta solo.
- **Con Proveedores:** la ficha ya muestra saldo a favor e historial (`SaldoFavorProveedor`, `SaldoFavorAcciones`); el módulo es la vista **transversal** de lo mismo. Conviene que ambas usen el mismo componente de libro.
- **Menú:** entrada «Notas de crédito» dentro del grupo Compras, junto a Por pagar (icono `receipt-text`), con un contador ámbar de «Por reclamar» como el de Por pagar.

## Decisiones que aún debe tomar Felipe (máx. 5)

**D1 · ¿Se puede registrar la nota desde Recepción, aunque sea opcional?**
- *Sí, dejar el interruptor:* **Ganas** un paso menos cuando el proveedor entrega la nota junto con la mercadería. **Pagas** seguir con dinero dentro de una pantalla que usan colaboradores, dos puertas al mismo formulario y `recibir_envio` acoplado a notas.
- *No, solo en el módulo:* **Ganas** un lugar único, Recepción más simple y limpia de dinero. **Pagas** un clic más cuando la nota llega en mano (mitigado: el chip lleva al módulo con el comprobante precargado).
- **Recomiendo: solo en el módulo.** Es lo que pediste, y el caso «nota en mano» es minoritario.

**D2 · ¿Guardamos el «reclamada al proveedor»?**
- *Sí (tabla `compra_nota_reclamos`):* **Ganas** saber a quién le falta llamar y el recordatorio a los 14 días; cierra el ciclo real. **Pagas** una tabla nueva y un botón más que hay que acordarse de apretar.
- *No:* **Ganas** cero migración de esquema. **Pagas** el módulo solo dice «hace N días», sin saber si ya reclamaste.
- **Recomiendo: sí, pero en una segunda fase.** Lanzar primero el tablero (solo función de lectura) y sumar el reclamo cuando lo uses una semana.

**D3 · ¿Cómo se sabe que una nota está «Aplicada»?**
- *Deducirlo (FIFO por proveedor, como el spike):* **Ganas** cero migración. **Pagas** que con varias notas y usos mezclados la nota que dice «aplicada» puede no ser la que realmente se usó (el total por proveedor siempre es exacto).
- *Guardar de cuál nota salió cada uso:* **Ganas** trazabilidad exacta. **Pagas** una columna nueva y cambiar `registrar_pago_compras` y `registrar_reembolso_proveedor`, dos funciones que mueven dinero.
- **Recomiendo: deducirlo.** Es solo una etiqueta; no toques las funciones de pago por una etiqueta.

**D4 · ¿A partir de cuántos días un reclamo es urgente?**
- *14 días (el spike):* **Ganas** un punto que late solo cuando importa. **Pagas** que sea un número puesto por mí, no por tu experiencia con cada proveedor.
- *Un plazo por proveedor (`plazo_credito_dias` u otro campo):* **Ganas** urgencia a la medida. **Pagas** un dato más que mantener.
- **Recomiendo: una constante (14) en `lib/nota-pendiente-reglas.ts`**, fácil de cambiar; el plazo por proveedor si algún día lo pides.

**D5 · ¿Dónde vive el adjunto de la nota?**
- *Columna `nota_credito_id` en `compra_adjuntos`:* **Ganas** el PDF ligado a su nota, con el bucket, los tipos y el tope de 10 MB que ya existen. **Pagas** una migración pequeña.
- *Adjuntarlo al comprobante como hoy:* **Ganas** cero migración. **Pagas** que un comprobante con dos notas tenga un cajón de archivos sin saber cuál es cuál.
- **Recomiendo: la columna.** Es chica y la evidencia de una nota es justo lo que se busca en una auditoría.

## Otros hallazgos del modelo actual (no son decisiones, son deuda)

- El libro se llama **`proveedor_creditos`**; el encargo hablaba de `libro_creditos`. Conviene que el ADR use el nombre real.
- Dos candados distintos para dinero de la misma familia: notas → `fn_puede_ver_dinero_de_compras()`; libro de saldo a favor → `fn_puede_registrar_compras()`. Hoy los dos son «líder»; si un día divergen, el módulo mostraría notas sin saldo o al revés.
- La regla del monto de la nota vive duplicada (TypeScript en `recepciones-reglas.ts` y SQL en `fn_insertar_nota_credito_compra`). El módulo la reutiliza tal cual; no agregar una tercera copia.
- `compra_notas_credito` no tiene `proveedor_id`: el proveedor se llega por `compra_id`. La función de lectura del tablero debe hacer ese `join`.
- En producción `compra_notas_credito` y `compra_item_cierres` tienen ~0 filas (diccionario): no hay datos reales que migrar.
- Vocabulario del ERP respetado: «colaborador/líder», «sede/tienda», «Taller Lima»; las series de las notas siguen el placeholder real del código (`FC01-000018`).

## Cómo se implementaría (estimación)

Sin dependencias nuevas. Cero cambios a las funciones de dinero existentes.
1. Migración de **lectura** (`notas_credito_tablero`) + `lib/notas-credito.ts` (servidor) y `lib/notas-credito-reglas.ts` (puro: tramos de antigüedad, «siguiente paso», FIFO de restos; testeable).
2. Ruta `app/(app)/compras/notas-credito/page.tsx` (+ `@modal` para el detalle/registro con `<ModalRuta>`), componentes: `NotasCreditoLista`, `NotaCreditoVistaRapida`, `RegistrarNotaModal` (mover el de `AccionesFaltantes.tsx`, sin cambios de lógica), `SaldosAFavorTablero` (reutiliza `SaldoFavorAcciones`).
3. Recepción: quitar `NotaCreditoCierre` y `bloquesNota`/`notas` de `RecepcionEnvio.tsx`, agregar el chip; `EnvioRecibido` deja de contar notas.
4. Menú lateral + contador «Por reclamar». ADR nuevo + actualizar `docs/ARQUITECTURA.md` y `docs/datos/modulos/09-compras-y-proveedores.md`.
5. Después, según D2 y D5: `compra_nota_reclamos` y `compra_adjuntos.nota_credito_id`.

## Cómo se verificó (2026-09-19)

Ejecutado en el navegador integrado (Chromium), con el HTML abierto por `file://`:
- **Sintaxis:** `node --check` sobre el script extraído: sin errores. Consola del navegador: sin mensajes ni errores en toda la sesión.
- **Recorrido real por DOM** (clics y teclas disparados sobre la página): abrir la vista rápida, «Registrar nota» precargada, monto de más (400 → error y botón «Usar S/ 330.40»), registrar; las cifras pasaron de S/ 1,819.56 → S/ 1,489.16 (por reclamar), S/ 1,416.00 → S/ 1,746.40 (emitidas), S/ 760.00 → S/ 1,090.40 (aplicado), las pestañas de 5/2/3/10 a 4/2/4/10 y la vista rápida se cerró sola al desaparecer su fila. Saldos a favor: reembolso de S/ 170 con error previo (500 > 420); el saldo de Sur bajó de S/ 420.00 a S/ 250.00 y el total de S/ 656.00 a S/ 486.00, con la fila nueva en el libro. «Usar en un pago»: el saldo viene apagado y al encenderlo «Transferirías» baja. Recepción: confirmar crea la nota pendiente en el módulo (Por reclamar sube a S/ 2,527.56) y el chip pasa a ser enlace.
- **Buscar, agrupar y pestañas:** «hilad» → 2 filas con resaltado, «zzz» → estado vacío, «Por proveedor» → 4 bandas ordenadas por monto por reclamar; el pulgar se reposiciona.
- **Atajos:** `/` enfoca la búsqueda, `j` `j` → `Enter` abre la vista rápida, ↓ navega, `Esc` la cierra, `N` abre el registro, `Esc` cierra el modal (el foco atrapado con Tab está programado, pero no lo probé).
- **Movimiento:** sin «reducido», el cambio de agrupación creó 5 animaciones FLIP en las filas; con «reducido» las duraciones computadas quedan en 1 ms (`0.001s`) y existe la regla `@media (prefers-reduced-motion: reduce)` equivalente.
- **Capturas mirando la pantalla:** escritorio 1360 px (tablero, vista rápida, registro, error de monto, éxito, detalle, saldos con libro abierto, reembolso, usar en un pago, Recepción así queda / hoy, estado vacío) y móvil 375 px (tablero, vista rápida, registro en hoja desde el borde, saldos). En 375 px `scrollWidth` = 375 (sin scroll horizontal). De ahí salieron seis arreglos: chip «Recibida» partido en el detalle, etiqueta de migración recortada en botones, viñeta «·» huérfana en móvil, cifras cortadas en la vista rápida móvil, pie del modal demasiado alto en móvil y franja del spike ocupando la pantalla del teléfono.

**Lo que NO pude verificar (deducido, no ejecutado):**
- `prefers-reduced-motion` real del sistema: el panel del navegador no permite emularlo; verifiqué el mismo camino con el botón «Movimiento reducido» (misma regla CSS y misma función `reducir()`).
- El movimiento *en curso* (velo, hoja que sube, cascada, barras que se llenan, punto que late): el panel del navegador estaba **oculto** y sus animaciones no avanzan, así que las capturas muestran el estado final o cuadros a medias. Comprobé por DOM que las animaciones se crean y que los estados finales son correctos; **conviene que Felipe lo mire en su navegador** para juzgar el ritmo.
- Un teléfono físico o el teclado en pantalla; la copia al portapapeles en `file://` (el HTML tiene un plan B con `execCommand`, no lo probé con un pegado real).
- Que el diseño se vea igual con las 4 sedes y decenas de proveedores: los datos son 4 proveedores y 10 notas.
