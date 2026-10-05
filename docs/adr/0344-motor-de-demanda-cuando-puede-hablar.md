# ADR-0344 — Motor de demanda, etapa 0: el sistema solo recomienda en una sede cuyos datos dicen la verdad

- Fecha: 2026-10-05
- Estado: aceptado. Felipe aprobó el diseño y fijó el umbral, la falta de historia y quién decide (2026-10-05).
- Diseño completo e investigación (empresas, código, datos de producción): `docs/investigacion/2026-10-05-algoritmo-de-inventario.md`.
- Migración `20261005210000_motor_demanda_preparacion.sql`: una función de lectura. **No está en producción.**

## Problema

Felipe preguntó si hace falta un «algoritmo de inventario» que recomiende a tienda, atención al cliente y compras. La
investigación concluyó lo siguiente:

- CAYLA ya tiene varias piezas de lógica de decisión: el motor del piso, Frescura, Análisis y la cantidad sugerida de
  Producción. Cada una usa su propia vara, y dos piezas no las usa ninguna pantalla (`planDeReposicion` y la señal para el
  Taller).
- Los datos todavía no alcanzan para recomendar. El 2026-10-05 había 6 días de ventas en el ERP, y el 82 % de las unidades
  vendidas eran «venta sin registrar». Solo TRU tenía su stock cargado.
- Una sugerencia por prenda o por talla hecha sobre eso sería ruido.

Las empresas que lo hacen bien pusieron primero la verdad del dato: Target descubrió que la mitad de sus quiebres eran
invisibles para el sistema, y Zara cambió a RFID antes de optimizar.

## Decisión

1. **Habrá un solo motor de demanda en cuatro capas:** verdad → demanda corregida → agrupación por categoría × talla × familia
   de color × sede → decisiones. Cada etapa se abre cuando los datos cumplen una condición medible, no en una fecha. Este ADR
   cubre la **etapa 0**: decir, sede por sede, si el motor ya puede hablar.
2. **El motor habla en una tienda solo si cumple las tres condiciones:**
   - **Ventas con su prenda:** 14 días seguidos sin ningún día con venta bajo el 90 % de unidades identificadas. El umbral y
     los días los fijó Felipe.
   - **Piso cuadrado:** hay un cuadre del piso (`fn_ultimo_cuadre_piso`).
   - **Almacén contado:** el almacén tuvo su conteo de arranque desde el último cuadre (`fn_conteo_arranque_pendiente` del
     almacén entero).
3. **Cómo se cuenta la racha:**
   - Solo cuentan los días cerrados: hoy se informa aparte, porque todavía no termina.
   - Un día sin ventas no corta la racha (la tienda pudo cerrar).
   - La racha no empieza antes de la primera venta de la sede en el ERP.
   - Una venta regularizada después cuenta en el día en que se cobró. Por eso la racha se recalcula en cada lectura y nunca
     se congela.
4. **La base cuenta y la web decide:**
   - `fn_motor_demanda_preparacion(p_ubicacion_id default null)` devuelve, por tienda, las unidades vendidas e identificadas por
     día de Lima (45 días), la primera venta, el último cuadre y si el almacén está contado. Usa los mismos filtros que el motor
     del piso: venta completada, sin ventas de prueba y sin liquidaciones de dañadas.
   - La regla vive en `lib/motor-demanda-reglas.ts`, con su prueba. Una prueba exige que la ventana de 45 días sea la misma en
     la regla y en la migración.
5. **Quién lo ve:**
   - Sin sede, la lectura pide el módulo `cayla_global`, y se muestra en CAYLA Global ▸ Salud del negocio, en la sección
     «¿El sistema ya puede recomendar?».
   - Con sede, también la lee quien opera esa sede. Así la usará Inventario ▸ Tareas (ADR-0345, otra sesión) en su columna
     «Sugerencias», con `fraseDelMotor`.
6. **Quién decide cada recomendación futura:** el encargado de sede, la persona de Compras o el líder. Decide quien ve el
   módulo donde vive el botón de esa recomendación (ADR-0161, ADR-0306), y cada decisión firma con `fn_actor_persona_id(true)`
   para medir después quién acierta. No se codifica un rol por tipo de recomendación.

## Alternativas descartadas

- **Pronosticar ya, con lo que hay.** Con una venta por variante y el 82 % sin identificar, el pronóstico aprendería ruido y el
  sistema perdería la confianza de la tienda el primer día.
- **Comprar un software de asignación (Nextail, Blue Yonder).** Topitop compró la suite de JDA en 2014 y no hay resultados
  publicados: el software no arregla datos inexactos.
- **Un porcentaje promedio de 14 días en vez de una racha.** Un solo día muy bueno taparía varios malos. La racha exige
  disciplina sostenida, que es lo que Felipe pidió.
- **Guardar la racha en una tabla.** La regularización cambia días pasados, así que cualquier foto guardada quedaría vieja.
  Calcularla en cada lectura es barato: unas 5 mil líneas.

## Qué no hace

- No recomienda nada todavía. Las etapas 1 a 5 están en la investigación y en `docs/backlog/2026-10-05-inventory-algorithm-business-ba82b4.md`.
- No cambia ninguna función existente ni toca Existencias, Análisis ni `piso-plan.ts`.

## Cómo se verificó

- `pnpm pruebas:motor-demanda`: 12 de 12. Cubre las puertas, el día de Lima, que no cuenten anuladas, de prueba, de otra sede,
  viejas ni liquidaciones, la venta regularizada, el cuadre de su sede, el conteo de arranque y que salgan solo tiendas activas.
- `vitest lib/motor-demanda-reglas.test.ts`: 19 de 19, incluido el caso real de TRU del 30-sep al 5-oct (58 de 161 unidades
  con su prenda).
- En el navegador, en local: CAYLA Global muestra una tarjeta por tienda con su veredicto, las tres condiciones y la racha en
  14 marcas.
