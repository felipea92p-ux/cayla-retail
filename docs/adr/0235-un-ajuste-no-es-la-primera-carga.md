# ADR-0235 · Un ajuste no es la primera carga de una prenda

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe («Sí, mandar al stock inicial»).
- **Producción:** dos migraciones, **ninguna aplicada**: `20260927153100_cargar_stock_inicial_de_prenda_existente.sql`
  (antes de la web) y `20260927153200_ajuste_no_es_primera_carga.sql` (DESPUÉS de la web). Esperan el OK de Felipe.
- **Complementa:** ADR-0212 (stock inicial de un producto nuevo), ADR-0143 (candado de líder del ajuste), ADR-0208
  (Frescura: el piso no sube solo), ADR-0234 (Movimientos leído desde la tienda).

## Problema

En la primera semana real de Tienda TRU (producción, solo lectura, 2026-09-26) hubo 41 ajustes que sumaron stock (+107
prendas). En **34** de ellos era el **primer movimiento de esa prenda en la tienda**: «Ajuste · reposición» (26, con la
nota «dasdasd» en 20) y «Ajuste · conteo físico» (8) usados como puerta de entrada. Consecuencias:

- Movimientos los muestra para siempre como correcciones (sobrantes), que en una revisión parecen mercadería sin papeles.
- Ninguna lectura puede separar una carga de una corrección de verdad: «Ajustes» deja de ser una señal.
- Nada impedía que se repitiera al abrir AQP y LIM.

ADR-0212 creó el stock inicial solo para productos NUEVOS y dejó anotado que a los que ya existían «les falta la pantalla».

## Decisión

```
DECIDÍ: la base rechaza un ajuste (`registrar_movimiento`, tipo `ajuste`) que sería el PRIMER movimiento de una prenda en
        esa ubicación (hint `ajuste_sin_historia`, con un mensaje que dice qué hacer). La otra puerta es
        `cargar_stock_inicial`: entrada «carga_inicial» al almacén —todas o ninguna— y, si están colgadas, su bajada al
        piso en la misma transacción. Ajustar stock lo hace solo: marca «Nueva en esta tienda · entra como stock inicial»
        y guarda esas líneas por la puerta nueva; las demás, como ajuste de siempre.
DESCARTÉ: (a) solo avisar en pantalla (el problema podía repetirse por cualquier otro camino); (b) un botón aparte de
        «Stock inicial» en Existencias (una decisión más para quien no conoce el sistema: el modal ya sabe qué prenda es
        nueva en la tienda); (c) reescribir `registrar_movimiento` desde un archivo (borraría los parches en vivo de
        20260922200000, 20260923100000 y 20260926000400).
SE ROMPE SI: alguien recrea `registrar_movimiento` desde 20260921120000 (se va el candado junto con los otros parches), o
        aparece otra puerta de ajuste que no pasa por esa función.
```

### Quién puede cargar el stock inicial de una prenda que ya existe

```
DECIDÍ: quien puede crear productos (`fn_puede_editar_catalogo`, la regla de ADR-0212) O quien puede ajustar stock
        (`fn_puede_ajustar_inventario`, ADR-0143).
DESCARTÉ: solo la regla de ADR-0212, porque quien hoy cargaba por «Ajuste · reposición» (la terminal administrativa, por
        ejemplo) habría perdido la posibilidad en vez de cambiar de puerta.
SE ROMPE SI: se usa para mercadería que LLEGA de un proveedor (entraría sin costo ni documento). Es el mismo riesgo que
        ADR-0212 dejó anotado: la puerta es para el paso al sistema y hay que cerrarla cuando termine.
```

## Lo que queda abierto

- **Un conteo formal** (`cerrar_conteo`) todavía puede dejar como «Ajuste · Conteo» la primera cantidad de una prenda
  que la tienda nunca tuvo. No se tocó a propósito: es un conteo con número y trazable, y cambiarlo toca el núcleo del
  conteo. Si se quiere cerrar, `cerrar_conteo` debería escribir esas líneas como «carga_inicial».
- **Cerrar la carga inicial** cuando termine el paso de las tiendas al sistema (pendiente heredado de ADR-0212).
- Lo histórico no cambia: los 34 ajustes de TRU siguen siendo ajustes (el historial no se edita).

## Cómo se despliega

1. `20260927153100` (crea `cargar_stock_inicial`; sin políticas ni `alter`).
2. La web (Ajustar stock ofrece el stock inicial).
3. `20260927153200` (el candado). Si se pega antes que la web, Ajustar stock rechaza la primera carga y todavía no ofrece
   la otra puerta.

## Verificación

- `pnpm pruebas:ajuste-no-es-primera-carga` (19 verificaciones, ROLLBACK): el candado rechaza y no deja nada, el parche
  anterior sigue puesto, la carga inicial entra como entrada firmada (al almacén o al piso con su bajada), todas o
  ninguna, y después un ajuste de verdad pasa. Siguen en verde `bajada_al_piso` (51), `candado_lider_caja_y_ajuste` (22),
  `reposicion_piso_cerrada` (10), `actor_firma_las_operaciones` (30) y `terminales_por_tienda`.
- `lib/ajuste-reglas.test.ts` (20). En el navegador: Existencias ▸ Ajustar «Vestido Antonella» en Lima marca S y L como
  «Nueva en esta tienda · entra como stock inicial» y deja M (que llegó por el Traslado 3) como ajuste.
