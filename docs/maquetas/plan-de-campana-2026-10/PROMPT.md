# Prompt para construir Compras ▸ Plan de campaña

Pega todo lo que sigue en una sesión nueva de Claude Code, con la rama al día con `main`. Antes, abre la maqueta
(`spike.html` en esta carpeta) y dime qué eliges en las decisiones de la última tabla; las que no respondas se ejecutan como dice
la columna «Si no respondes».

---

```
/construir

Rediseña Compras ▸ Plan de campaña (`/compras/plan`, ADR-0349) como la maqueta aprobada y súmale: exportar la lista de compra,
un tope de inversión, el aviso de stock incompleto, referencias de ventas, dos formas de llenar el plan (Tabla y Paso a paso) y
varias campañas con selector. Antes de tocar código lee `CLAUDE.md` completo, `docs/adr/0349-plan-de-campana.md`,
`docs/maquetas/plan-de-campana-2026-10/spike.html` (ábrela y tócala: manda sobre este texto en lo visual) y su `README.md`.
Hoy la pantalla son `components/plan-compra/PlanCampana.tsx` (159 líneas) y `PlanCategoriaModal.tsx`; la cuenta vive en
`lib/plan-compra-reglas.ts` (con 45 pruebas) y la base en `20261005220000_plan_de_campana.sql` (solo existen `fn_plan_compra` y
`guardar_plan_compra_linea`).

## Qué se construye

1. BARRA DE RANGO por categoría (`<BarraRango>`): sustituye «flojo · normal · bueno» en texto. Verde = lo que ya hay, negro = lo que hay
   que comprar, banda clara = rango flojo–bueno, marca = normal; en «Durante» y «Después», un rombo con lo que se vendió sobre la misma
   escala. Debajo, «143 · **214** · 321». Es una pieza nueva, y las piezas nuevas se piden a Felipe antes de entrar a /unificar:
   déjala en `components/plan-compra/` con su `aria-label` completo («Flojo 143, normal 214…»). Entra una sola vez (ADR-0136).
2. CABECERA con `<EncabezadoPagina>` (ya la usa). En `acciones`: el selector de campaña (con `Desplegable`, nada de menú propio) y
   «Exportar» (`peso="fantasma"`). Bajo la frase, un estado: «Faltan 52 días», «Día 15 de 31» o «Terminó hace 8 días» (lógica pura
   en `lib/plan-compra-reglas.ts`, junto a `estadoCampana`).
3. CIFRAS con `<TarjetaCifra>` (la pieza, no tarjetas a mano): «Categorías con plan» (filtra, con barra de avance), «Prendas a comprar»,
   «Inversión al costo» (con su barra contra el tope, ver 6) y la cuarta, que cambia con el momento: antes = «Por llenar primero»
   (de las 10 que más venden, cuántas faltan; lleva al Paso a paso); durante o después = «Vendido en la campaña».
4. UNA TARJETA con: `<Buscador>`, modo «Tabla / Paso a paso» (`SegmentoDeslizante forma="modo"`, la pieza decidida), píldoras
   (`pildora-cayla`: Todas · Sin plan · Con plan · Las 10 que más venden · Se agotaron), familia y orden con `Desplegable` (NINGÚN
   `<select>` nativo: `sin-select-nativo.test.ts` lo vigila) y la leyenda de la barra. Las categorías sin ventas ni stock se pliegan
   en UNA línea («10 categorías sin ventas ni stock · no hace falta plan ahora») cuando no hay filtro ni búsqueda.
   «Las 10 que más venden» y «Se agotaron» (stock 0 y ventas > 0) se calculan en el navegador con lo que `leerPlan` ya trae
   (`vendidoPorTalla` sumado por categoría = ventas de 90 días): lógica pura nueva en `lib/plan-compra-reglas.ts` con su prueba.
5. LA HOJA DE UNA CATEGORÍA (`PlanCategoriaModal`, con `<Modal variante="hoja">` y `pie-hoja-fijo`) suma: una franja de referencia
   («Vendiste N en 90 días · Hoy hay N en la red»), «Proponer desde lo vendido», el resultado en vivo con SU barra y, si hay tope, su
   efecto («llevarías S/ 10 580 de S/ 12 000»), y «Guardar y seguir con <siguiente> →» (la siguiente que más vende y no tiene plan).
   El Paso a paso usa EL MISMO formulario (extráelo a `FormularioCategoria.tsx`; una sola fuente de verdad, no dos copias) dentro de
   la tarjeta: una categoría a la vez de la que más vende a la que menos, avance en puntos (✓ hecho, aro = aquí), «Saltar por ahora»,
   lo que llevas contra el tope, alcance «Las 10 que más venden» / «Todas con movimiento», y un cierre que dice qué sigue.
   La guía de foco ya existe (`lib/plan-compra-guia.ts` → `camposDelPlan`, con su prueba de 20 combinaciones): reúsala, no escribas otra.
6. TOPE DE INVERSIÓN: campo que se escribe (por campaña). La barra de «Inversión» usa `<BarraApilada total={tope} segmentos=…>`
   (la pieza decidida para «medirse contra algo que no es la suma»): top 5 categorías + «Otras». Pasado el 100 %: tono ámbar y
   «Te pasas S/ X». **El tope AVISA, nunca bloquea un plan.** Sin tope: «Poner un tope».
7. AVISO DE STOCK INCOMPLETO con `<Aviso tono="atencion">`: «El “Hay hoy” está incompleto» + una píldora por sede (cuadrada y contada /
   sin contar) y un botón «Ir a Conteo» a quien vea ese módulo. Sale de `getPreparacionMotor` (`lib/motor-demanda.ts`,
   `fn_motor_demanda_preparacion`, ya en producción): solo lectura. Con todas las condiciones, una línea «✓ Stock confiable». **Si esa
   lectura falla, no digas «confiable»: di «No se pudo verificar el stock» (principio 9).**
8. EXPORTAR: una hoja con la lista de compra por categoría y por talla (usa `comprarPorTalla`), total, y el mismo aviso si el stock
   está incompleto. «Descargar Excel (CSV)» con `<BotonAncla>`; «Imprimir» con `.papel-fijo` (el papel sale SIEMPRE en claro). Armada
   en el navegador desde lo ya leído. Prueba que el CSV abra bien en Excel con tildes y con decimales (la maqueta usa BOM y «;»:
   confírmalo, no lo supongas).
9. CAMPAÑAS: selector y «+ Nueva campaña» (nombre, desde, hasta, «empezar con los precios y costos de la actual»). Usa `plan.planes`,
   que `fn_plan_compra` ya devuelve y hoy nadie pinta, y `?plan=` que ya funciona.

## Movimiento (ADR-0136: sin rebote, sin bucle, nunca decorativo; todo se apaga con `prefers-reduced-motion`)

Cascada de las primeras 14 filas, cifras que cuentan una vez (`CifraQueCuenta`), barras de rango y de tope que crecen una vez, el paso
que entra desde la derecha, la fila recién guardada que destella una vez. Ningún bucle nuevo. Botones y hoja ya traen su movimiento.

## Dos entregas (no las mezcles)

ENTREGA 1 — solo web, SIN migración. Se puede publicar sola y no depende de nadie:
  A1. Refactor sin cambio visual (Kent Beck): parte `PlanCampana.tsx` en `components/plan-compra/` (`BarraRango`, `FilaCategoria`,
      `CifrasPlan`, `FormularioCategoria`, `PasoAPaso`, `ExportarPlan`) y saca a `lib/plan-compra-reglas.ts` lo que sea cuenta (ranking,
      filtros, plegado, referencia, estado del momento, filas de exportación), con pruebas. Un commit.
  A2. Cabecera + cifras que filtran + tarjeta con buscador, píldoras, familia, orden, plegado y `BarraRango`.
  A3. La hoja: referencia (90 días), «Proponer desde lo vendido», resultado con barra, «Guardar y seguir».
  A4. Paso a paso.
  A5. Aviso de stock (lectura del motor).
  A6. Exportar.
  Cada una es un corte vertical verificable con su commit. Lo que sirva a un precio/costo precargado, a «30 días», al desglose por sede,
  al tope o a crear campañas NO se simula en esta entrega: la web lo esconde si la lectura no trae el dato (ver «Si falla»).

ENTREGA 2 — con migración. Cada migración es de Felipe: ensayo revertible local, `pnpm migraciones:verificar`, md5 contra producción y
su OK puntual antes de pegarla (CLAUDE.md, «Cómo aplicar SQL a producción»). Una sola parte por migración, sin políticas ni
`drop trigger`, `retail.` en cada objeto, idempotente.
  B1. LECTURA AMPLIADA: `create or replace` de `fn_plan_compra` SOLO SUMANDO claves (no cambies ni quites ninguna: la web publicada
      antes que la migración debe seguir viva): `catalogo` (precio y costo promedio por categoría), `stock_sedes` (stock libre por
      sede y almacén/Taller) y `vendido_30`. Después la web precarga precio y costo («Del catálogo · revísalo») y desglosa el stock.
      DESCARTÉ guardar el precio y el costo promedio en una tabla: es un dato derivado, no una verdad nueva.
  B2. TOPE: `planes_compra.tope_inversion numeric(12,2)` NULL con `check (tope_inversion > 0)` + `guardar_plan_compra_tope(p_plan_id,
      p_tope)` firmada con `fn_actor_persona_id(true)`. RLS sin políticas; solo por la función. La UI del tope y su barra.
  B3. CAMPAÑAS: `crear_plan_compra(p_nombre, p_desde, p_hasta, p_copiar_de)`: hasta ≥ desde (ya hay CHECK), nombre único (ya hay
      UNIQUE; traduce el error), copia solo precio, costo y recupero de otra campaña, NUNCA las cantidades. **BLOQUEADA hasta que Felipe
      decida la fuente única de fechas** (ver «Decisiones»). Si no ha respondido al llegar aquí, para y pregúntale; no la construyas.
  Funciones nuevas de B2/B3: piden el módulo `plan_compra` y además `fn_es_lider()` (crear una campaña y fijar un tope son decisiones de
  dinero y de estructura; guardar una categoría sigue siendo del módulo). La pantalla esconde esos botones a quien no sea líder.

## Qué NO se toca (si algo lo exige, para y pregunta)

- `guardar_plan_compra_linea`, la cuenta de `calcular`/`cuantilCritico`/`curvaSugerida`/`repartir` y sus 45 pruebas: no cambian. Esto es
  cara y ayudas de lectura, no una regla nueva de cuánto comprar.
- Permisos y módulo: sigue siendo `plan_compra` + `verDineroCompras` (ADR-0126). Nada nuevo en Roles y accesos: lo de adentro de una
  pantalla no es otro módulo (ADR-0306).
- «Finanzas dice que hay S/ X disponibles» (aparece en la maqueta, SIMULADO): NO se construye. Toca dos módulos y falta decidir de qué
  cuenta sale. Deja el campo del tope listo para recibirlo y no pintes ninguna cifra inventada.
- Nada se borra: una campaña no se elimina. Vocabulario: «sede», «colaborador». Solo tokens de color (modo oscuro incluido).

## Si falla (Vogels: asume que ya está caído)

- `getPlanCompra` falla → la pantalla ya dice «No se pudo leer el plan» y no dibuja una hoja vacía: se queda así.
- `getPreparacionMotor` falla → el aviso dice «No se pudo verificar el stock»; la compra sigue visible (no pierdes el plan) con la
  advertencia. Nunca «confiable» por omisión.
- La web llega antes que B1/B2/B3 → cada ayuda nueva (precarga, desglose, tope, selector) se esconde sola si `leerPlan` no encuentra su
  clave. Lo prueba un caso de `plan-compra-reglas.test.ts` con la respuesta VIEJA de la base.
- Dos personas guardan la misma categoría a la vez → `unique (plan_id, categoria_id)` deja una sola fila (la última gana, con su
  `actualizado_por`); la hoja que se quedó vieja lo dice al guardar en vez de pisar en silencio.

## Cómo se verifica (antes de decir «listo»)

- `pnpm --filter web typecheck`, `lint`, `vitest` de `plan-compra-reglas`, `plan-compra-guia`, `modulos`, `menu`, `sin-select-nativo`,
  `tema-colores`, `unificar`, `guia-de-foco`; y `pnpm pruebas:plan-compra` ampliada (B1 claves nuevas y retrocompatibilidad; B2 tope:
  > 0, solo por RPC; B3 crear: fechas, nombre repetido, 42501 sin módulo y sin ser líder, copia sin cantidades).
- En el navegador con la sesión del seed, en escritorio: llenar una categoría y guardar; «Guardar y seguir»; recorrer el Paso a paso
  hasta el cierre; filtrar y buscar; el aviso con las dos sedes sin contar y con el motor caído; exportar y abrir el CSV; imprimir;
  cambiar de campaña; ponerle tope y pasarte. Cambiar el momento (antes/durante/después) con fechas reales del plan.
- `pnpm --filter web tema:auditar -- --cuenta <líder> --ruta /compras/plan --escenarios` en claro y oscuro: 0 hallazgos nuevos; registra
  los escenarios nuevos (hoja, paso a paso, exportar, tope, nueva campaña) en `tema/escenarios/registro.mjs`. La hoja de exportar se
  imprime en claro.
- Captura antes/después al mismo ancho que la maqueta; si no se parecen, no está terminada.
- `/formidable` (¿una colaboradora llena un plan sin que nadie le explique?), `/chaos` (la pantalla guarda: doble clic en Guardar, dos
  pestañas sobre la misma categoría, «12,000» pegado en el tope, perder el internet al guardar) y `/focus` + `/sugerir` en la hoja y
  en «Nueva campaña» (placeholders coherentes con lo elegido).
- Las tres de siempre, con evidencia: concurrencia (dos guardados), caída externa (motor de demanda), persona sin contexto.
- ADR nuevo en `docs/adr/` con el siguiente número libre (mira también los PR abiertos: el 0349 quedó solo por suerte), con DECIDÍ /
  DESCARTÉ / SE ROMPE SI; actualiza `docs/ARQUITECTURA.md` (`/compras/plan`), `docs/maquetas/plan-de-campana-2026-10/README.md`
  («Estado: construida»), `docs/formidable/README.md`, `docs/chaos/README.md`, una entrada en `docs/bitacora/` y otra en
  `docs/backlog/`. Tras aplicar una migración en producción: `pnpm datos:generar:produccion` y `pnpm datos:comparar`.

Entrega: lo hecho, la objeción si la hay y lo que no pedí y encontraste. Si algo de arriba te parece mal planteado, dilo antes de
construirlo.
```

---

## Decisiones que son tuyas antes de pegarlo

| Decisión | Mi recomendación | Si no respondes |
|---|---|---|
| ¿Tabla o Paso a paso? | Las dos: la tabla para revisar, el paso a paso para llenar por primera vez, con el paso a paso por defecto mientras falten categorías de las 10 que más venden | Las dos, tabla por defecto |
| «Proponer desde lo vendido» | Solo el **normal** (3 meses de lo que vendes por mes, que sale de R-19). El ×2 del flojo y el ×4,5 del bueno no tienen dato detrás | Solo el normal |
| ¿El tope avisa o bloquea? | Solo avisa: un tope que bloquea es una regla nueva de dinero | Solo avisa |
| ¿Quién crea campañas y fija el tope? | Solo el líder (`fn_es_lider()`) | Solo el líder |
| **Fuente única de fechas de campaña** | Que el plan cuelgue de la etiqueta «campaña» de Catálogo ▸ Etiquetas (hoy las fechas viven en dos lugares: `planes_compra` y esa etiqueta) | **B3 no se construye** hasta que respondas |
| «Finanzas dice…» | Fuera de esta construcción | Fuera |
| La `BarraRango` como pieza nueva | Que entre a `/unificar` como un gráfico decidido después de verla en producción | Queda en `plan-compra/` |
