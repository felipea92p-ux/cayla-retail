# ADR-0174 — Conteo físico: contar con pistola, a ciegas de verdad, y ningún conteo vacío cerrado

- **Fecha:** 2026-09-22
- **Estado:** aceptado (Felipe eligió en la demo `docs/maquetas/conteo-rediseno-2026-09/`: los dos modos con
  interruptor, «Vacío» + no se cierra, y la variante A de pendientes)
- **Relacionados:** ADR-0071 (conteos con historial), ADR-0136 (modales), ADR-0149 (loader), ADR-0161/0162
  (responsable), ADR-0169 (paleta oficial)

## Contexto

`/inventario/conteo` ya estaba en la paleta oficial (ADR-0169), pero solo en lo visual. Con las capturas de Felipe
de Tienda TRU (2026-09-22) aparecieron cuatro problemas de fondo:

1. **No era a ciegas.** Con un conteo abierto, la tarjeta «Diferencia hasta ahora» (y la fila del historial y el
   detalle del conteo abierto, con «sistema → físico») le decía a quien cuenta cuánto se alejaba del sistema.
2. **Un verde falso.** Los 4 conteos cerrados de TRU tienen 0 prendas y salían «Sin diferencias» en verde; el
   detalle decía «todas coinciden con el sistema». `cerrar_conteo` aceptaba cerrar un conteo vacío.
3. **Contar con pistola costaba 3 pasos por prenda** (escanear, escribir la cantidad, «Registrar»), con loader y
   aviso en cada uno.
4. **Abrir era opaco:** dos botones grises sin decir por qué, y un desplegable de 25 «Solo …».

## Decisión

- **Dos modos de anotar, con interruptor** (se recuerda en ese navegador): «Suma por escaneo» (cada lectura +1,
  se guarda sola; − / + y la cifra corrigen) y «Escribir cantidad» (como antes). `conteo_contar` sigue recibiendo
  la cantidad TOTAL: la suma se resuelve en la pantalla con lo ya anotado. Las lecturas se guardan **en fila**
  (`crearColaEnSerie`, `lib/conteo-reglas.ts`): cada una manda el total, y así la última en salir es la última
  en escribirse. En suma, las escrituras llevan `x-espera: no` (el loader tapando la pantalla en cada
  pistoletazo frenaría el conteo); el estado «Guardando… / ✓ Guardado / No se guardó» se ve al pie de la prenda.
  «Escribir cantidad» sí usa loader y aviso: es un botón que guarda.
  En suma, la pistola resuelve con su **Enter**, no a media escritura (evita contar `BLU-1` cuando venía `BLU-10`).
- **A ciegas de verdad.** Sin «Diferencia hasta ahora» con un conteo abierto; el historial dice «A ciegas hasta
  revisar»; el detalle de un conteo abierto no muestra su tabla. La diferencia se ve solo en «Revisar y cerrar».
  Y la cifra tampoco viaja: `getConteoAbierto` ya no lee `cantidad_sistema` (iba en los datos de la página aunque
  no se pintara).
- **Faltan por contar — variante A:** lista de QUÉ falta (prenda, SKU, talla, color) sin CUÁNTAS dice el sistema.
  Viaja al navegador ya sin la cifra (`pendientesSinCifras`), acotada al alcance del conteo (`pendientesEnAlcance`:
  `previsualizar_cierre_conteo` no conoce el alcance), ordenada como se recorre el rack (tallas XS→XL). El avance
  se calcula en vivo con lo anotado (`avanceEnVivo`), sin volver a la base en cada escaneo.
- **Conteo vacío:** «Vacío» (insignia neutra) en el historial y el detalle, fuera de la exactitud (ya lo estaba) y
  fuera de «Último conteo con prendas». **La base lo cierra:** `20260923120000_conteo_vacio_no_se_cierra.sql`
  hace que `cerrar_conteo` rechace un conteo sin `conteo_items` (P0001, hint `conteo_vacio`, «… cancélalo»);
  sigue abierto para contar o cancelar. Los 4 ya cerrados no se tocan.
- **Abrir en tres pasos** (dónde · qué · quién) con el botón que dice lo que abre o lo que falta; categorías con
  buscador en píldoras. Sin conteo abierto, la tarjeta del medio pasa de «Ninguno» a «Conviene contar primero»
  (la suma de `valor_en_riesgo` de las prendas sugeridas, a precio de venta, como la calcula `fn_prioridad_conteo`).
- **Revisar y cerrar en `<Modal>`** (ADR-0136) — antes dibujaba su propio `fixed inset-0`. Antes de abrirlo se
  termina de escribir la fila. Al cerrar, va al detalle del conteo recién cerrado.
- **Detalle:** abre en «Con diferencia» con «Todas» a un clic (`?ver=todas`) y suma la columna en soles por prenda.
- La página lee y dibujan `ConteoVista` / `ConteoDetalleVista` (Server Components sin datos propios), para poder
  verlas con datos de muestra sin base.

## Lo que no se hizo

- «Terminal · Almacén Trujillo» en lugar de «ESTACIÓN — Almacén Trujillo (no es persona)»: es un nombre en los
  datos que corrige la migración puente de terminales (PR #300), no la pantalla.
- La tarjeta del medio no es «valor sin contar» de toda la tienda: eso pediría una consulta nueva. Suma lo que ya
  trae `fn_prioridad_conteo` (hasta 20 prendas) y lo dice así.

## Costo

- Si una escritura en suma falla, la prenda vuelve a su última cifra confirmada y se dice «No se guardó»; no hay
  reintento automático (la siguiente lectura vuelve a mandar el total).
- Quien quería ver la diferencia a mitad de conteo ya no puede: tiene que ir a «Revisar y cerrar» (que no cierra).

## Verificación

- `lib/conteo-reglas.test.ts` (22 pruebas): vacío ≠ sin diferencias, pendientes sin cifra, orden de tallas, suma y
  escribir, cola en serie (orden, error que no frena, vaciar), alcance y avance en vivo.
- `pnpm pruebas:conteo-vacio` (en CI, `pruebas-postgres`): rechazo con hint, sigue abierto, se cancela, con
  prendas cierra igual, «ya está cerrado» va primero, re-ejecutable.
- Navegador (sin base local: los componentes reales en una ruta temporal, no commiteada, contra un PostgREST falso):
  abrir en tres pasos → contar 3 lecturas de la misma prenda (guardó 1, 2, 3 en orden, `x-espera: no`) → «+» →
  escribir 7 (con loader, firmado por la responsable) → revisar en el modal → detalle → vacío → 390 px sin
  desplazamiento lateral. Sin errores de consola. Capturas `implementado-*.png` junto a la maqueta.
