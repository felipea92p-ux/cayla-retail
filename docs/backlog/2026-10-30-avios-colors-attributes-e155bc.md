# Backlog — Avíos con su clase, su medida y sus colores (ADR-0580, 2026-10-30)

## POR PEGAR EN PRODUCCIÓN

- **`supabase/migrations/20261030144000_avios_clase_medida_y_quien_los_crea.sql`** — **DOS PARTES**, por separado y en orden,
  cada una entera. PARTE 1 = desde el primer `set lock_timeout` hasta «FIN DE LA PARTE 1»; PARTE 2 = la política de
  `avio_clases`, sola y al final (ADR-0195). Las dos son re-ejecutables.
  - **Antes de pegar, repetir la sonda:** `select count(*) from retail.insumos where tipo = 'avio';` debe seguir dando **0**.
    Con eso, `materiales_avio_con_clase` (que exige clase a todo avío) entra sin migrar una sola fila. Si ya hubiera avíos,
    hay que darles clase ANTES o el `alter` se detiene.
  - **No repegar nunca `20261028175000`:** producción tiene su texto viejo, sin la guardia «repegado_peligroso», y devolvería
    seis funciones a su versión anterior sin ningún error.
  - Prueba: `pnpm pruebas:materiales` (143 casos, grupo V nuevo).

## DECISIÓN PENDIENTE DE FELIPE (antes del primer botón)

**¿Un botón se mide en líneas o en milímetros?** Hoy `fn_medida_cuadra` admite las DOS para el comportamiento `pieza`, y la
unidad entra en la llave del índice único: «Botón nácar» 18 `linea` y «Botón nácar» 11.4 `milimetro` son dos fichas
legítimas del MISMO botón, con códigos, colores y stock separados. Se descubre tarde: Producción pide botones, una ficha
dice 0 y los 800 están en la otra. Lo encontró la revisión adversarial del 30-oct, antes de pegar el SQL.

- **Si se mide SOLO en líneas** (lo habitual en el rubro y mi recomendación): un `create or replace` de una línea en
  `retail.fn_medida_cuadra` (`when 'pieza' then p_unidad = 'linea'`), más quitar el milímetro de la nota de la clase Botón
  y de `COMPORTAMIENTOS` en `lib/avio-clases-reglas.ts`. **Con 0 avíos no migra ni una fila**; cada día que pase con avíos
  cargados lo encarece.
- **Si se quieren las dos**, hace falta una medida canónica (guardar milímetros siempre, mostrar líneas con
  `fn_medida_texto`) y que el índice use esa, no la escrita.

## LO QUE QUEDÓ FUERA, A PROPÓSITO

1. **La unidad de compra con factor** (gruesa de 144, ciento, millar, caja). Felipe lo dejó para después (decisión 2). **No se
   hace sola:** va junto con la conversión kilo→metro de la tela (actividad 4 de ADR-0554, nunca construida), en una función
   única que llamen las **cuatro** puertas que abren lotes (`recibir_insumo`, `recibir_orden_insumo`,
   `recibir_comprobante_produccion`, `encontre_tela`), porque hoy **ninguna** lee `unidad_compra`. El factor sin la conversión
   haría entrar «10 docenas» al libro como 10 unidades: un faltante de ×12 que nadie ve.
2. **Que «Nueva orden» proponga el avío del color de la prenda.** Ahora es posible por primera vez: `producto_avios` ya guarda
   el color de la PRENDA (`20261026152000`) y el avío ya tiene color propio. Es justo lo que ADR-0513 descartó diciendo
   «Insumos no tiene familia de avíos».
3. **Cerrar la puerta al avío suelto:** endurecer `insumos_insert_lider` a `with check (fn_es_lider() and material_id is not null)`.
   No entró porque hay **40 inserts de avío suelto en 13 suites** de `scripts/pruebas/` que corren como `postgres`; hay que
   revisarlas una por una. Una política solo ata a `authenticated`: el SQL Editor podría seguir creando un avío suelto, y eso
   es aceptable.
4. **Los avíos sueltos no se convierten en ficha.** `fn_materializar_insumos_sueltos` sigue siendo solo de telas, a propósito
   (y hay una prueba que lo exige). El día que existan avíos sueltos en producción, es una decisión aparte.
5. **El título del hilo se guarda como un número** (40), no como «40/2»: los cabos, si importan, van en el nombre. Si Felipe
   necesita distinguir 40/2 de 40/3 como dos fichas, hace falta una columna más.

## NO VERIFICADO (de esta obra)

- `/chaos` formal sobre «Nuevo avío» (es una hoja que GUARDA: la regla lo pide antes de darla por terminada).
- `/formidable` con una persona sin contexto.
- `pnpm --filter web tema:auditar` con escenarios para la hoja nueva y para la pestaña Atributos ▸ Avíos (hay que agregarlos a
  `tema/escenarios/registro.mjs`).
- `guias:recorrer`: las dos huellas se aceptaron tras revisar los pasos a mano, no tras un recorrido en el navegador.
- `pnpm datos:generar:produccion` y `datos:comparar` (piden el volcado de producción).
- A 375 px, la fila «Se cuenta en» con sus seis unidades queda apretada. Insumos es de escritorio por regla, pero si Felipe lo
  usa en el celular hay que mirarlo.
