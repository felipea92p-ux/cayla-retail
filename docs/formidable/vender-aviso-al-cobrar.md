# Formidable · Ventas ▸ Vender: el aviso al cobrar y la tuerca de impresión   (`/vender`)

- **Fecha / SHA:** 2026-11-25 · `ae90beb1b` (rama `claude/fusion-2011-functionality-4d813d`, PR #2016) · **Dispositivo que manda:** escritorio (la caja) y 375 px (el celular del piso, PL-105)
- **Pregunta que debería resolver (1 frase):** «¿salió la boleta, cuánto vuelto entrego y cómo sigo?»; y en la tuerca: «¿dónde sale la boleta de este equipo?»  · **Protagonista:** el dinero (el vuelto) y la boleta
- **Veredicto en una línea:** «Se entiende en 5 s qué pasó y qué entregar; tropieza con tres palabras: "tuerca", "Reimprimir" y "en cola".»

Medido en el **banco propio** (`supabase_db_cayla-imprime`, base y cuentas del seed, servidor de la rama en `localhost:3047`), con cobros reales en
Tienda Lima (computadora, Felipe) y Tienda Trujillo (celular, Micaela), la impresión simulada (`window.print`) y la cola de la caja de verdad
(`retail.impresiones`). Prueba ciega: **un solo agente** (Opus, sobre 5 capturas del banco; el primer intento con Sonnet lo frenó un filtro de la
API, `reasoning_extraction`, y se relanzó con otro modelo como dice `prueba-ciega.md`). **Sin agente escéptico:** cada hallazgo se contrastó con el
código y con el banco (columna «Veredicto»).

## Notas (0–10)
| Eje | Nota | Evidencia |
|---|---|---|
| 1 Sin manual | 8 | [Observado] ciega: completó las 3 tareas (1, 1 y 2–3 toques); la 2 «a medias»: supo que la boleta no estaba impresa y dónde, pero no cómo enterarse cuando salga · real: sin probar |
| 2 Una pregunta, una respuesta | 9 | [Medido] un título, un número, el vuelto y un botón negro; «Reimprimir» secundario |
| 3 Simplicidad profunda | 8 | [Observado] «Sigue en la cola de la caja» + «Sale apenas la computadora de la caja esté prendida» se entendió como veredicto |
| 4 Lenguaje de tienda | 6 | [Observado] «tuerca» no la entendió (la adivinó por el ícono); dudó si «Reimprimir» saca una copia o una boleta nueva; «1 en cola», ¿mía o de otra persona? |
| 5 Contenido primero | 9 | [Observado] el vuelto, lo primero que leyó y verificó (200 − 79,90 = 120,10) |
| 6 Lo difícil, a un toque | 8 | [Opinión] no hay nada que explicar detrás de un «?»; la frase de la tuerca dice a dónde va la boleta |
| 7 Perdonar antes que preguntar | 8 | [Observado] temió perder el vuelto con un Enter sin querer; [Medido] el vuelto también lo mostró la hoja de cobro antes de confirmar |
| 8 Quitar antes de agregar | 9 | [Medido] de la hoja «Venta registrada» se quitaron subtotal, IGV, pagos, líneas, cliente y estado SUNAT (ADR-0670 act. b) |
| 9 De punta a punta | 7 | [Medido] «No salió», «No se pudo mandar a la caja» y «Sigue en la cola» existen y se ven a 375 px; [Observado] no sabe cuánto tardará la caja |
| **Leyes (promedio)** | **8,0** | ciega ✓ · real sin probar |
| **Oficio visual** | **8** | [Medido] `medir-oficio.js` a 1440, 1024 y 375: lo que falla es de la pantalla de detrás o de piezas decididas (el `<Interruptor>` de 38 × 22, la letra de 9,5 px de las baldosas); el aviso y la hoja de la tuerca, sin fallas propias. `/milimetro`: 0 graves · 0 medias · 0 leves de la rama. `tacto:medir /vender`: todo en 44 px o más. `tema:auditar`: 0 hallazgos solo en oscuro |

## Hallazgos de la prueba ciega
| # | Hallazgo | Veredicto | Por qué |
|---|---|---|---|
| H1 | «tuerca» no se entiende («La tuerca de Vender avisa cuando salga») | CONFIRMADO | [código] `AvisoAlCobrar.tsx`: la palabra es nuestra; en pantalla el botón dice «Va a la caja» |
| H2 | «Reimprimir»: ¿copia o boleta nueva? | CONFIRMADO | [código] imprime la MISMA boleta (`ImpresionAlCobrar` con el mismo recibo); la regla «Imprimir» de `/unificar` pide «Imprimir» + qué |
| H3 | «1 en cola»: ¿mía o de otra persona? | MATIZADO | [código] `colaDeLaCaja.ts` cuenta solo las de ESTE equipo; la duda es real, el dato es correcto |
| H4 | Un Enter sin querer pierde el vuelto antes de contarlo | MATIZADO | Enter es el camino rápido que se pidió; el vuelto ya se vio en la hoja de cobro |
| H5 | «Imprimir solo al cobrar»: podría apagarlo creyendo que deja de imprimir aquí | MATIZADO | apagarlo devuelve la hoja «Venta registrada», no deja sin boleta; nombre heredado del 2026-11-16 |
| H6 | La línea de abajo, tapada por la «N» | REFUTADO | es el indicador de Next en desarrollo; no existe en producción |
| H7 | «Nada con stock en Tienda Trujillo» confunde | REFUTADO | dato del banco (stock de prueba agotado), no de la pieza |
| H8 | La ventanita «Primera vez aquí» tapa Cobrar | REFUTADO para este PR | es la invitación a la guía de Vender, de antes |

## Los 3 cambios de mayor impacto (hechos con el OK de Felipe, 2026-11-25)
1. **«La tuerca de Vender avisa cuando salga» → «Arriba verás "1 en cola" hasta que salga».** Ley 4 (H1). Se verifica repitiendo la ciega sobre la
   captura del celular. Esfuerzo S. Decide Felipe (presentación).
2. **«Reimprimir» → «Imprimir otra copia».** Ley 4 (H2) y la regla `accion.imprimir` («Imprimir» + qué). Se verifica con la ciega y con
   `lib/guias.test.ts` (la huella cambia). Esfuerzo S. Decide Felipe.
3. **«1 en cola» → «1 tuya en cola»** (y «2 tuyas en cola»). Ley 4 (H3). Esfuerzo S. Decide Felipe.

**Lo que sobra (ley 8):** nada a la vista en el aviso; la línea «Enter abre una venta nueva» podría irse si la caja ya lo sabe de memoria.
**Lo que Felipe no pidió y importa más:** probarlo en Trujillo con la Mac de la caja dormida: es el caso de las 3 boletas que esperaron de 40 a 53
minutos el 2026-11-24, y la ciega no supo cuánto esperar.

## Antes de decir «listo»
- **Concurrencia:** `/chaos` (misma fecha, semilla 2016): doble clic y doble toque en «Confirmar cobro» → 1 venta, 1 impresión o 1 pedida; ráfaga de
  5 «Reimprimir» → 1 impresión; doble «Reintentar» → 1 pedida.
- **Caída externa:** con la red cortada al pedir a la caja, el aviso dice «No se pudo mandar a la caja» con «Reintentar»; si la base guardó y la
  respuesta se perdió, «Reintentar» no duplica (la base devuelve la misma pedida).
- **Persona sin contexto:** ciega ✓ (Opus); colaboradora real: sin probar.

## Historial
| Fecha | SHA | Leyes | Oficio | Qué cambió |
|---|---|---|---|---|
| 2026-11-25 | `ae90beb1b` | 8,0 | 8 | primera medición, en el banco propio |
| 2026-11-25 | (este commit) | 8,0 (sin repetir la ciega) | 8 | los 3 cambios de texto hechos con el OK de Felipe: «Arriba verás "1 tuya en cola" hasta que salga», «Imprimir otra copia» y «1 tuya en cola»; vistos en el navegador a 1440 y 375 px (`docs/maquetas/impresion-vender-2026-11/implementado/7` a `9`). La guía de Vender tampoco dice «tuerca» |
