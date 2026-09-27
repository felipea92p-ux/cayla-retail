# ADR-0235 · Un ajuste no es la primera carga de una prenda

- **Fecha:** 2026-09-26 · **Estado:** Aprobado por Felipe («Sí, mandar al stock inicial»).
- **Producción:** dos migraciones, **las dos aplicadas el 2026-09-26** en el orden correcto:
  `20260927153100_cargar_stock_inicial_de_prenda_existente.sql` (antes de la web) y
  `20260927153200_ajuste_no_es_primera_carga.sql` (después de que Vercel publicara la web del PR #496, 20:22 UTC). Cada una
  con ensayo revertido sobre los datos reales y verificada por huella (ver «Verificación»).
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

### Dónde va el candado: primero quién, después qué

```
DECIDÍ: justo antes de escribir (`insert into movimientos`), después de los candados de permiso y de ubicación y de saber
        quién firma (`fn_actor_persona_id`). A quien no puede ajustar le sale el mensaje de permiso; a una terminal sin
        responsable presente, «Elige quién hace esta operación»; solo quien puede hacer la operación se entera de si la
        prenda tiene historia en la tienda.
DESCARTÉ: anclarlo antes de `v_sub := …`, donde lo dejó la primera versión (la misma ancla que 20260926000400): quedaba
        antes del responsable y una terminal sin nadie elegido recibía «esta prenda no tiene historia» en vez de
        «elige quién». Lo detectó el CI (`pruebas:terminales`, 3 casos; `pruebas:candado-lider`, 2).
SE ROMPE SI: un parche futuro mueve `fn_actor_persona_id` debajo del `insert`, o inserta otro «qué» antes del
        responsable. Lo vigila `pruebas:ajuste-no-es-primera-carga` (verificación de orden sobre la definición viva).
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

- **Producción (2026-09-26):** ensayo de `153200` en una transacción que se deshizo sola, sobre Tienda TRU y con sesión de
  Admin: el ajuste de una prenda sin historia salió `P0001 · ajuste_sin_historia`; el de una prenda con historia y una
  entrada normal pasaron. Aplicada después: `md5(prosrc)` de `registrar_movimiento` = `3c3c83f8…`, el mismo del ensayo y
  de la base local; una sola versión, un solo candado, `security definer`, `anon` sin EXECUTE. `cargar_stock_inicial`:
  `7e2a2d28…`, igual a la local.
- `pnpm pruebas:ajuste-no-es-primera-carga` (20 verificaciones, ROLLBACK): el candado rechaza y no deja nada, va después
  de saber quién firma, el parche anterior sigue puesto, la carga inicial entra como entrada firmada (al almacén o al
  piso con su bajada), todas o ninguna, y después un ajuste de verdad pasa.
- `pruebas:terminales` (75) y `pruebas:candado-lider` (22): donde un ajuste debe pasar, o llegar hasta el «stock
  negativo», la prueba le da antes historia a la prenda (una carga inicial en el almacén): la siembra no tiene
  movimientos de `BLU-EMMA-NEG-M` en Trujillo. «Sin responsable» y «responsable ausente» van sin historia y prueban el
  orden. **La primera vez pasaron en local y fallaron en CI:** la base local tenía un ajuste suelto de esa prenda en
  Trujillo (de otra prueba a mano) que la base limpia de CI no tiene. Se volvieron a correr en local con una prenda sin
  historia (copias temporales, como CI) y dieron 75/75 y 22/22.
- Siguen en verde `bajada_al_piso` (51), `reposicion_piso_cerrada` (10), `actor_firma_las_operaciones` (30),
  `alta_con_stock_inicial` (28), `terminales_sin_persona` (55) y `roles` (70).
- `lib/ajuste-reglas.test.ts` (20). En el navegador: Existencias ▸ Ajustar «Vestido Antonella» en Lima marca S y L como
  «Nueva en esta tienda · entra como stock inicial» y deja M (que llegó por el Traslado 3) como ajuste.

## Actualización 2026-09-26 (noche) — sin «Bajada al piso», la carga inicial entra al almacén

**Problema.** `cargar_stock_inicial` con «al piso» llama a `bajar_al_piso`, que pide el módulo «Bajada al piso». Pero
se puede entrar con `fn_puede_ajustar_inventario()`, que acepta a quien ve Existencias, Conteos o Traslados. La
integrante de la siembra está justo en ese caso: ajusta stock y su rol no tiene «Bajada al piso». Si elegía «Piso de
venta» en «Ajustar» con una prenda nueva en la tienda, al confirmar recibía `bajada_sin_modulo`. No había conflicto de
git que lo avisara. Lo encontró el análisis `/pantalla` de Existencias (`docs/pantallas/inventario.md`, tarea #2).

**Decidí.** Lo mismo que ya decidió ADR-0212 para «Nuevo producto»: «colgadas en el piso» es una bajada y pide su
módulo. Quien no lo tiene no queda trabado con un error:
- sus prendas nuevas entran al almacén (`cargaInicialAlPiso`, `lib/ajuste-reglas.ts`);
- la fila lo dice antes de confirmar: «Nueva en esta tienda · entra al almacén: tu rol no baja prendas al piso»
  (`textoPrendaNueva`).

Quién puede bajar lo decide la página en el servidor (`veModulo(persona, "bajada_piso")`) y se lo pasa al modal
(`puedeBajarAlPiso`) desde las tres pantallas que lo abren: Existencias, y Productos en sus dos vistas. **La base no
cambia.**

**Descarté.** Que `cargar_stock_inicial` bajara al piso sin pedir el módulo, por una puerta interna. Era la propuesta
inicial del análisis. Contradecía ADR-0212: la misma prenda nueva pediría el módulo al crearla y no al cargarla desde
«Ajustar», y quedarían dos reglas para una misma operación.

**Se rompe si** alguien abre «Ajustar» desde una pantalla nueva y le pasa `puedeBajarAlPiso` sin preguntar el módulo. La
base igual lo frena (`bajada_sin_modulo`) y no deja nada a medias. La prop es obligatoria, así que `tsc` obliga a
decidirla en cada pantalla.

**Verificación.** Caso 7 nuevo en `scripts/pruebas/ajuste_no_es_primera_carga.mjs`: la integrante carga al almacén; al
piso, la base la frena y no deja ni la entrada; 25/25 en local. `lib/ajuste-reglas.test.ts` suma 3 casos (23 en total).
En el navegador, con la cuenta de líder, que sí tiene el módulo, el texto sigue siendo «entra como stock inicial». Falta
verlo con la cuenta de integrante.
