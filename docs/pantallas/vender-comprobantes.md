# Pantalla — Comprobantes (`/vender/comprobantes`)

> Modo: completo · Fecha: 2026-09-26 · Rol/sede: líder (Tienda TRU) en las capturas; se juzga también como **integrante en celular** (pedido de Felipe: la mayoría la usará desde el teléfono) · Datos: real (producción `retail`, consultas de solo lectura hechas por Claude el 2026-09-26)
> SHA analizado: `2227a9fd` (`origin/main`) — si esos archivos cambian después, este análisis está vencido
> Archivos: `app/(app)/vender/comprobantes/{layout,page}.tsx` + `emitidos/`, `por-reintentar/`, `proformas/` · `components/{FacturacionShell,FacturacionCabecera,FacturacionPestanas,SeriesPanel,ComprobantesPanel,ComprobantesTarjetas,ColaSunatPanel,ProformasPanel,ProformasTarjetas,NuevaProformaModal,BarridoColaSunat,SelectorMesFacturacion}.tsx` · `lib/{comprobantes,proformas,facturacion-comprobantes-reglas,facturacion-busqueda,transmitir-comprobante,transmision-reglas,useTransmitir}.ts` · API `app/api/lucode/{emitir,reintentar,anular,consultar-anulacion}` · RPC `registrar_serie_comprobante`, `archivar_serie_comprobante`, `marcar_comprobante_no_emitido`, `anular_comprobante`, `fn_comprobantes_cola_reintento`, `fn_tomar_comprobantes_para_reintento`, `crear_proforma`, `marcar_proforma_cobrada` · tablas `comprobantes`, `series_comprobantes`, `proformas`
> Otra sesión tocándola: no (ninguna fila activa de `docs/SESIONES-ACTIVAS.md` sobre esta ruta al 2026-09-26)
> **Re-análisis:** el del 2026-09-22 (SHA `8845770`) está **vencido**: desde entonces cambiaron 13 archivos de la pantalla (+931/−529 líneas; `ComprobantesPanel.tsx` y `ProformasPanel.tsx` se rehicieron y se quitó «Emitir comprobante» manual).

## 0 · Veredicto
El motor está bien (el envío sale solo al cobrar, hay cola y hay candados). La pantalla, en cambio, está **aislada**: no enlaza a la venta, ni a la clienta, ni a Posventa, ni a Apartados. En celular es una tabla apilada pensada para el líder en escritorio. Y hoy **se contradice**: 3 boletas llevan 2 h 30 sin un solo intento de envío, y aun así «Por reintentar» dice «todo llegó a SUNAT».
**Cumple su finalidad:** 6,3/10 · **Relevancia:** 7,4/10 — Soporte

## 1 · Finalidad declarada
"Que cada venta se declare sola a SUNAT al cobrar; que lo que no llegó quede en una cola visible que se reintenta y avisa; y que quien opera vea qué series tiene cada tienda y en qué número va." Fuente: ADR-0165 / D-60 (`docs/BACKLOG.md`, cabecera de `20260922151500_comprobantes_cola_de_reintento.sql`).
¿Coinciden docs y pantalla? **En el motor sí; en el uso diario, no del todo.** La finalidad escrita es de supervisión (líder). Pero el menú la pone bajo Ventas, y el permiso `facturar` llega a la integrante con solo ver el módulo (`lib/modulos.ts:186`). La colaboradora la abre para **encontrar el comprobante de una clienta y reenviárselo**, cobrar una proforma o saber si una boleta llegó. Ninguna decisión escrita cubre ese uso, y eso ya es un hallazgo.

## 2 · Objeción
1. **Tres boletas sin enviar, invisibles justo donde deberían verse.** `[producción]` B004-000030, -031 y -032 están en `estado='pendiente'` con `intentos_transmision=0`. Llevan hasta 2 h 30 así, y su `proximo_reintento_at` se corre 5 min hacia adelante una y otra vez. O sea: el barrido las **toma** (`fn_tomar_comprobantes_para_reintento` acepta un `pendiente` de más de 2 min, `20260924113817_sunat_reintento_por_cron.sql:84-86`), pero el envío nunca llega a contar un intento. Además, `fn_comprobantes_cola_reintento` solo lista `pendiente_reintento`. Por eso la pestaña «Por reintentar» dice «Nada en espera: todo llegó a SUNAT» `[visto]` mientras la cabecera dice «3 Por enviar a SUNAT» `[visto]` (`getResumenPorEnviar` sí cuenta los `pendiente`, `lib/comprobantes.ts:139`). Dos de las tres no tienen venta: `venta_id` nulo `[producción]`. La causa exacta es `[no verificable]` sin los logs de `/api/lucode/reintentar`. **Trade-off de dejarlo:** hoy es sandbox y no hay daño legal. El día de SUNAT real, una boleta que nunca sale y que ninguna vista marca como atascada es justo el comprobante que se pierde (principio 9).
2. **La pantalla no conecta con nada de lo nuevo.** `[código]` Hacia fuera solo hay dos enlaces: `/vender?proforma=` (`ProformasPanel.tsx:206`) y el aviso a `por-reintentar`. Lo demás falla así:
   - La fila de Emitidos no trae `venta_id` (`lib/comprobantes.ts:26`), aunque la columna existe.
   - La clienta es texto plano (`ComprobantesPanel.tsx:346`).
   - La nota de crédito no enlaza a su devolución, aunque `devoluciones.nota_credito_id` existe.
   - El WhatsApp va a `wa.me/?text=` **sin número** (`facturacion-comprobantes-reglas.ts:213`), aunque `clientas.telefono_whatsapp` existe (`lib/clientas-reglas.ts:21`).

   Resultado: cuando la clienta vuelve con su boleta, la colaboradora tiene que copiar el número a mano en Cambios o Devoluciones.
3. **En celular, la vista por defecto es la que menos sirve a la colaboradora.** `[código]` La ruta base es **Series**, que es configuración, y casi todo lo que se puede hacer ahí es del líder (`esLider` en `SeriesPanel.tsx:123,160,176`). A 375 px son 9 tarjetas en una columna (`grid-cols-1`, `:142`) antes de llegar a algo útil. En Emitidos, cada fila apila 4 enlaces de texto chicos (PDF · WhatsApp · XML · CDR) de ~20 px de alto, bajo el mínimo táctil de 44 px `[inferido de ComprobantesPanel.tsx:98-120]`.

## 3 · Lo que está bien y no se toca
- El envío sale solo al cobrar, *fire-and-forget*, con `keepalive` y `x-espera: no`: el cobro nunca espera a SUNAT `[código lib/envio-sunat.ts]`.
- La cola se reserva sin carrera (`for update of c skip locked`) `[código 20260924113817…sql:91]`, y una venta anulada nunca se transmite (`v.estado <> 'anulada'`, `:80`).
- Una serie se archiva, no se borra; un índice garantiza una sola serie activa por tienda y tipo `[código 20260922234100…sql]`.
- «Cobrar» una proforma no convierte en el sitio: la lleva al Punto de Venta como carrito, y al cobrar la marca `convertida` con su `venta_id` `[código vender/page.tsx:113-124; PuntoDeVenta.tsx:1220]`. Es el patrón correcto: una sola puerta de venta.
- Las filas usan `@container` (apiladas bajo 640 px, 4 columnas, 5 desde 900 px) y las pestañas se desplazan en horizontal centrando la activa `[código ComprobantesPanel.tsx:135,284; FacturacionPestanas.tsx:52-59]`. La base responsive existe; lo que falta es decidir qué va primero.
- El chip «Pruebas: se envía al sandbox» y la guía «El día de pasar a la SUNAT real» `[visto]`.
- Anular y Liberar son del líder, con responsable y candado en la RPC `[código ComprobantesPanel.tsx:46,538]`.

## 4 · Las seis dimensiones
| Dimensión | Puntaje | Hallazgo principal | Evidencia |
|---|---|---|---|
| Estética | 7,5 | Coherente con ADR-0169/0220; en celular, enlaces de fila chicos, y las cifras cambian de lugar entre pestañas | `[visto capturas 1, 7, 9]` |
| Lógica de negocio | 6,0 | Boletas pendientes que nunca se intentan; proforma vencida que sigue `vigente` en la base; «32 números usados» cuando existen 7 | `[producción]` |
| Arquitectura | 7,0 | Cola y candados sólidos; el resumen y la cola usan dos definiciones distintas de «por enviar» | `[código lib/comprobantes.ts:139 vs fn_comprobantes_cola_reintento]` |
| Funciones | 6,0 | Faltan: abrir la venta, WhatsApp al número, ir a Cambio o Devolución, NC ↔ devolución | `[código]` |
| Utilidad | 5,5 | Una devolución cuesta 6+ toques y copiar un número a mano | `[inferido]` |
| Conexión con el ERP | 5,5 | Muchas pantallas enlazan hacia acá, pero desde acá no se vuelve a ninguna | `[código lib/caja-tablero.ts:65; lib/inicio-avisos.ts:87]` |

### Estética (7,5)
(a) Usa los tokens del ERP, sin hex sueltos, y el rojo solo en «Ver PDF» `[visto]`. Las cifras «3 Por enviar / 2 Proformas vigentes» quedan bajo la frase en Series y Emitidos, pero a la derecha en Por reintentar y Proformas `[visto capturas 1, 7 vs 9, 10]`: el mismo dato cambia de lugar según la pestaña. (c) Los enlaces PDF/WhatsApp/XML/CDR van a 12–13 px y sin caja, bajo los 44 px táctiles en celular `[inferido]`. En el modal «Nueva serie», «Próximo número» queda pegado al texto de ayuda de arriba, sin aire `[visto captura 3]`.

### Lógica de negocio (6,0)
- Boletas pendientes que nunca se intentan (ver Objeción 1) `[producción]`. Ninguna D-nn dice cuánto puede esperar una boleta antes de escalar, y el aviso de «más de 1 hora» solo mira la cola, no los `pendiente`.
- `[producción]` Las 3 proformas figuran como `vigente` en la base, aunque la pantalla muestra una como «Vencida» por su fecha. Es una deuda ya anotada en BACKLOG (hueco de proformas vencidas).
- `[producción]` En B004, `siguiente_numero=33` pero existen solo 7 comprobantes (números 2, 3 y 28 al 32). La tarjeta dice «32 números usados» `[visto]` porque cuenta el contador, no lo emitido (`SeriesPanel.tsx:157`). Los huecos 4–27 salieron de pruebas en una serie de sandbox que se va a archivar, pero el texto engaña. En SUNAT real, un hueco en el correlativo hay que explicarlo.
- Referente (de memoria, `[no verificable]`): en Shopify POS y Lightspeed, el recibo vive **dentro de la orden**. Desde ahí se reenvía al contacto de la clienta y se inicia la devolución. Pasa el filtro de escala: es el caso diario de 3 tiendas.

### Arquitectura (7,0)
«Por enviar» tiene dos definiciones. El resumen cuenta `pendiente + pendiente_reintento + rechazado`; la cola, solo `pendiente_reintento`. De esa diferencia sale la contradicción que se ve en pantalla. Volumen `[producción]`: 11 comprobantes en total y 7 ventas en 30 días. Con 3 tiendas × ~15 ventas/día serían ~16 k comprobantes en 3 años; `getComprobantesMes` ya pagina, así que alcanza. Caída externa: si Lucode no responde, el comprobante queda `pendiente` y no se pierde. **Pero si nunca pasa a `pendiente_reintento`, hoy ningún lugar avisa que está atascado.**

### Funciones (6,0)
- **Existen y funcionan:** series, archivar, liberar, anular, reintentar, PDF/XML/CDR, proformas cobradas por el POS, duplicar e imprimir.
- **A medias:** WhatsApp abre la app sin destinataria `[código facturacion-comprobantes-reglas.ts:213]`.
- **Faltan:**
  - Abrir la venta: `DetalleVentaModal` ya existe y lo usan Historial y Caja (`components/DetalleVentaModal.tsx:28`).
  - «Cambio» y «Devolución» desde un comprobante aceptado: `/cambios?q=` y `/devoluciones?q=` ya aceptan una búsqueda (`app/(app)/cambios/page.tsx:19`).
  - Ver la NC de un comprobante y su devolución.
  - «Apartar» desde una proforma.
  - Buscar fuera del mes cargado.
- **Sobra (para la integrante):** Series como pantalla de entrada.

### Utilidad (5,5)
Escenario: sábado, 17:00, Tienda TRU. Una clienta vuelve con una blusa de talla equivocada y dice «me mandaron la boleta al WhatsApp». La colaboradora, desde su celular:
1. Menú → Comprobantes. Aterriza en **Series**: 9 tarjetas que no le sirven. Duda.
2. Toca «Emitidos», baja y busca por nombre. La búsqueda solo cubre el mes cargado: si la compra fue en agosto, primero tiene que tocar «← Agosto».
3. Encuentra la boleta. No hay «Cambio» ni «Devolución», así que copia B004-000029 a mano.
4. Menú → Posventa → Cambios, y pega el número.

En total son 6+ toques y un copiado. Si la clienta pide «mándamela otra vez», WhatsApp se abre sin su número. El fallo es del diseño, no de la colaboradora.

### Conexión con el ERP (5,5)
Ver §6.

## 5 · Relevancia
| Criterio | Peso | Puntaje | Por qué (una línea) |
|---|---|---|---|
| Gestión (directo + indirecto) | ×2 | 7 | Da validez legal a cada venta; Impuestos e Inicio leen de acá |
| Dinero y stock que toca | ×1 | 8 | Cada sol vendido pasa por un comprobante; no mueve stock |
| Frecuencia y personas que la usan | ×1 | 6 | Con el envío automático se abre para buscar, reenviar y cobrar proformas, no en cada venta |
| Qué se detiene si falla | ×1 | 9 | Sin serie activa no se cobra con boleta; sin cola visible, SUNAT no recibe |

Relevancia = (14 + 8 + 6 + 9) / 5 = **7,4**.

## 6 · Conexión con el ERP
- **Aguas arriba:** Punto de Venta (emite y envía al cobrar), Devoluciones (emite la NC sola si SUNAT aceptó el original), Proformas.
- **Aguas abajo:** Impuestos (`ImpuestosPanel.tsx:338`), Caja (`caja-tablero.ts:65`) e Inicio (`inicio-avisos.ts:87`) enlazan **hacia** acá. Desde acá no se vuelve a ninguna de ellas.
- **Vecinos sin puente:** Historial (la misma venta vista desde otro lado), Cambios, Devoluciones, Apartados, Clientas.
- **Externos:** Lucode/SUNAT. Si caen, el comprobante queda `pendiente`, el cobro no se detiene y el cron y el barrido reintentan. El hueco: un `pendiente` que el barrido toma pero no intenta enviar no aparece en la cola.

## 7 · Las 12 tareas, por importancia

### #1 · Corregir — Una boleta que no salió siempre se ve, y se sabe por qué
- **Dónde:** `fn_comprobantes_cola_reintento` (incluir los `pendiente` de más de 2 min); diagnóstico de por qué `/api/lucode/reintentar` las toma sin intentarlas (B004-030/031/032, `intentos=0`); `ColaSunatPanel.tsx`.
- **Por qué en este puesto:** es el único defecto con consecuencia legal, y hoy la pantalla se contradice a la vista.
- **Cómo lo verificas tú:** con «3 Por enviar» en la cabecera, «Por reintentar» muestra esas 3 con su motivo; y después de corregirlo, `intentos_transmision` de los `pendiente` deja de estar en 0.
- **Esfuerzo / dependencias:** M · ninguna. Toca una RPC de producción: se confirma con Felipe antes de pegarla.

### #2 · Conectar — Cada comprobante abre su venta
- **Dónde:** `lib/comprobantes.ts:26` (traer `venta_id`, sede y vendedora); `ComprobantesPanel.tsx` abre `DetalleVentaModal`, que ya existe.
- **Por qué en este puesto:** es el puente base; de él dependen #3, #4 y #7.
- **Cómo lo verificas tú:** al tocar B004-000029 se abre la hoja con las prendas, el pago, la vendedora y la sede.
- **Esfuerzo / dependencias:** M · ninguna.

### #3 · Conectar — «Cambio» y «Devolución» desde el comprobante
- **Dónde:** en las acciones de la fila (solo para aceptados con venta), un `Link` a `/cambios?q=<serie-número>` y otro a `/devoluciones?q=<serie-número>`.
- **Por qué en este puesto:** elimina el copiado a mano; es lo que más tiempo ahorra en tienda.
- **Cómo lo verificas tú:** «Cambio» en B004-000029 llega a Cambios con esa venta ya encontrada.
- **Esfuerzo / dependencias:** S · mejor después de #2.

### #4 · Mejorar — WhatsApp a la clienta, no a nadie
- **Dónde:** `enlaceWhatsApp` (`facturacion-comprobantes-reglas.ts:213`) usa `clientas.telefono_whatsapp`. Si no hay número, lo pide en la hoja y ofrece guardarlo.
- **Por qué en este puesto:** reenviar la boleta es lo que más hace la colaboradora en esta pantalla.
- **Cómo lo verificas tú:** en una boleta de una clienta con teléfono, el enlace queda `wa.me/51…?text=…`.
- **Esfuerzo / dependencias:** S–M · después de #2.

### #5 · Reconstruir — Emitidos en celular: tarjeta tocable + hoja de acciones
- **Dónde:** `ComprobantesPanel.tsx` bajo 640 px. La fila queda en número + clienta + monto + chip, y un toque abre una hoja (`<Modal>`) con Ver PDF, WhatsApp, Venta, Cambio, Devolución y Anular. XML y CDR pasan a «Más».
- **Por qué en este puesto:** Felipe pide celular primero, y hoy cada fila tiene 4 enlaces de 20 px.
- **Cómo lo verificas tú:** a 375 px, cada fila mide ≥ 64 px y cada control ≥ 44 px, con captura en el PR.
- **Esfuerzo / dependencias:** M · después de #2–#4.
- **DECIDÍ:** una hoja de acciones por comprobante. **DESCARTÉ:** botones en línea, porque con 6 acciones la fila pasa de 3 líneas a 375 px. **SE ROMPE SI:** Anular aparece en la hoja de una integrante; la hoja filtra con `accionesDelComprobante` y `esLider`, igual que hoy.

### #6 · Replantear — ¿Con qué vista abre Comprobantes quien no es líder?
- **Dónde:** `vender/comprobantes/page.tsx`, `FacturacionPestanas.tsx`.
- **Por qué en este puesto:** es la estrategia alternativa de §8, y decide Felipe.
- **DECIDÍ:** proponer que la integrante entre en «Hoy» (los comprobantes del día de su sede) y que Series quede para el líder. **DESCARTÉ:** quitar Series del menú, porque el líder la necesita para pasar a SUNAT real. **SE ROMPE SI:** una tienda se queda sin serie de boleta y la integrante no se entera. Por eso el aviso «Sin serie de boleta» se mantiene sobre «Hoy».
- **Esfuerzo / dependencias:** S (la decisión) + M (construirla).

### #7 · Conectar — Nota de crédito ↔ devolución ↔ boleta original
- **Dónde:** la lectura de Emitidos con `devoluciones.nota_credito_id`. La boleta original muestra «Tiene NC…», y la NC abre su devolución.
- **Por qué en este puesto:** evita devolver dos veces la misma boleta.
- **Cómo lo verificas tú:** tras una devolución aprobada, la boleta original lleva el chip. `[producción]` Hoy hay 0 devoluciones, así que se prueba en local.
- **Esfuerzo / dependencias:** M · después de #2.

### #8 · Conectar — Proforma → Apartar, y proforma cobrada → su boleta
- **Dónde:** `ProformasPanel.tsx`: «Apartar» junto a «Cobrar». Apartados hoy acepta `?prendas=` y habría que sumarle `?proforma=`.
- **Por qué en este puesto:** la clienta que cotizó a veces separa con abono.
- **Cómo lo verificas tú:** «Apartar» abre Apartados con las prendas y la clienta de la proforma.
- **Esfuerzo / dependencias:** M · decide Felipe si una proforma se puede apartar.

### #9 · Corregir — Estado real de las proformas vencidas
- **Dónde:** `proformas.estado` sigue en `vigente` aunque la proforma venció (`[producción]` 3/3).
- **Por qué en este puesto:** la cifra de la cabecera y los reportes leen la base, no la fecha.
- **Cómo lo verificas tú:** `select estado, count(*) from retail.proformas group by 1` muestra `vencida`.
- **Esfuerzo / dependencias:** S.

### #10 · Corregir — «Va en el 33» en vez de «32 números usados»
- **Dónde:** `SeriesPanel.tsx:157`.
- **Por qué en este puesto:** el texto dice 32 y existen 7 `[producción]`.
- **Cómo lo verificas tú:** B004 muestra «7 emitidos · va en el 33».
- **Esfuerzo / dependencias:** S.

### #11 · Mejorar — Buscar fuera del mes cargado (bajo valor / opcional)
- **Dónde:** `lib/facturacion-busqueda.ts`, que hoy filtra en memoria solo el mes cargado.
- **Por qué en este puesto:** cubre a la clienta de agosto; con el volumen de hoy pasa poco.
- **Cómo lo verificas tú:** buscar «B004-000002» desde setiembre lo encuentra.
- **Esfuerzo / dependencias:** M.

### #12 · Mejorar — Cifras siempre en el mismo lugar; `@container` en Por reintentar (bajo valor)
- **Dónde:** `FacturacionCabecera.tsx`, `ColaSunatPanel.tsx:81`.
- **Por qué en este puesto:** coherencia visual entre pestañas.
- **Cómo lo verificas tú:** las 4 pestañas, capturadas al mismo ancho, muestran las cifras en el mismo sitio.
- **Esfuerzo / dependencias:** S.

## 8 · Estrategia alternativa
**Comprobantes como «la boleta de la clienta», no como «las series de la tienda».** La colaboradora abre en «Hoy»: sus comprobantes del día, con un buscador por clienta, DNI o número arriba, y cada comprobante lleva a Venta, WhatsApp, Cambio y Devolución. Series, Por reintentar y el paso a SUNAT real quedan como tablero del líder.
- **Ganas:** la pantalla sirve al trabajo diario desde el teléfono, y Posventa y Clientas quedan a un toque.
- **Pagas:** dos entradas según el rol, o sea más casos que probar en `pruebas:roles`.

Decide Felipe (tarea #6).

## 9 · Referentes de ERP y futuro
`[no verificable]`, de memoria:
- En Shopify POS, el recibo se reenvía desde la orden al contacto guardado, y la devolución se inicia desde la orden. Pasa el filtro de escala: son las tareas #3 y #4.
- Alertas al líder por correo o WhatsApp cuando una boleta lleva X horas sin salir: queda para el futuro. Hoy basta con el aviso en Inicio.

## 10 · Fuera de esta pantalla
**Dos de las tres boletas atascadas no tienen venta** (`venta_id` nulo, `[producción]`), y el emisor manual se quitó el 22/09. Hay que averiguar qué camino crea hoy boletas sin venta. Un comprobante sin venta no aparece en Historial ni en Caja: es dinero declarado que nadie concilia.

## 11 · Líneas propuestas para BACKLOG.md
- [ ] `[pantalla:vender-comprobantes]` #1 Boletas pendientes sin intento: causa raíz + visibles en Por reintentar — M
- [ ] `[pantalla:vender-comprobantes]` #2 Cada comprobante abre su venta (`DetalleVentaModal`) — M
- [ ] `[pantalla:vender-comprobantes]` #3 «Cambio» / «Devolución» desde el comprobante — S
- [ ] `[pantalla:vender-comprobantes]` #4 WhatsApp al número de la clienta — S–M
- [ ] `[pantalla:vender-comprobantes]` #5 Emitidos en celular: tarjeta tocable + hoja de acciones — M
- [ ] `[pantalla:vender-comprobantes]` #6 Vista de entrada para quien no es líder (decisión) — S+M
- [ ] `[pantalla:vender-comprobantes]` #7 NC ↔ devolución ↔ boleta original — M
- [ ] `[pantalla:vender-comprobantes]` #8 Proforma → Apartar; proforma cobrada → su boleta — M
- [ ] `[pantalla:vender-comprobantes]` #9 Proformas vencidas con su estado real — S
- [ ] `[pantalla:vender-comprobantes]` #10 «Va en el N» en vez de «números usados» — S
- [ ] `[pantalla:vender-comprobantes]` #11 Buscar fuera del mes cargado — M (opcional)
- [ ] `[pantalla:vender-comprobantes]` #12 Cifras fijas + `@container` en Por reintentar — S (bajo valor)
- [ ] `[pantalla:vender-comprobantes]` Fuera: qué flujo crea boletas sin venta — S (diagnóstico)

## Inventario de elementos
| Zona | Elemento | Qué hace | Veredicto | Evidencia |
|---|---|---|---|---|
| Cabecera | Chip «Pruebas: sandbox» | Evita confundir prueba con real | bien | `[visto]` |
| Cabecera | Cifras Por enviar / Proformas | Resumen | ajustar (cambian de lugar según la pestaña) | `[visto 1 vs 9]` |
| Pestañas | Series · Emitidos · Por reintentar · Proformas | Navegación | ajustar (entrada según rol, #6) | `[código FacturacionPestanas.tsx]` |
| Series | Tarjeta de serie | Estado y próximo número | ajustar («números usados», #10) | `[código SeriesPanel.tsx:157]` |
| Series | Tarjeta punteada «Sin serie de…» | Acceso directo a registrar | bien | `[visto]` |
| Series | Modal Nueva serie | Registrar | bien (falta aire entre campos) | `[visto 3–6]` |
| Emitidos | 4 tarjetas del mes | Resumen | bien | `[visto 7]` |
| Emitidos | Fila | Número, clienta, total, estado | falta: venta, sede, acciones de posventa | `[código lib/comprobantes.ts:26]` |
| Emitidos | WhatsApp | Compartir | ajustar (sin número, #4) | `[código …reglas.ts:213]` |
| Por reintentar | Vacío «todo llegó» | Estado de la cola | **corregir** (#1) | `[visto 9 + producción]` |
| Proformas | Cobrar | Lleva al POS con el carrito | bien | `[código ProformasPanel.tsx:206]` |
| Proformas | «Formato anterior» | Proforma sin prendas | ajustar (sin acciones) | `[visto 10]` |
| Proformas | Modal Nueva proforma | Crear | bien | `[visto 11]` |

## Historial
| Fecha | Modo | Cumplimiento | Relevancia | Tareas cerradas de las 12 anteriores |
|---|---|---|---|---|
| 2026-09-22 | completo | 8,0 | 8,8 | — (primer análisis) |
| 2026-09-26 | completo | 6,3 | 7,4 | #2 cerrada (se quitó el emisor manual con el texto fantasma); #4 cerrada (`getComprobantesMes` pagina); #10 parcial (filas con `@container`). El resto quedó vencido con el rediseño. La baja de puntaje refleja el lente nuevo (celular + conexión con las pantallas nuevas) y el atasco visto en producción, no una regresión del código. |
