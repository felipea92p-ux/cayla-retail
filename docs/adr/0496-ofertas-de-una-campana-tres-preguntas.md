# ADR-0496 — Las ofertas de una campaña: «Tres preguntas», un % menos con fechas, días de la semana y categorías

- **Fecha:** 2026-10-23 · **Estado:** construido y probado en local; PR abierto. **La migración `20261023232000_campana_reglas_de_precio.sql` NO está en producción:
  se pega PRIMERO en el SQL Editor (de una vez, idempotente) y la web se publica DESPUÉS** (con la web nueva y sin la migración, la pantalla cae a la hoja de siempre).
  El número de este ADR y la versión de la migración están reservados para esta rama (`pnpm reservar`). Nació de lo que pidió Felipe: «implementarlo ya dentro del sistema».
- **Relacionados:** ADR-0481 (Catálogo ▸ Insignias), ADR-0486 (campañas por sede), ADR-0107/0108/0302 (el descuento de campaña y su cuenta exacta), ADR-0476
  (la llave de las campañas), ADR-0195 (políticas y deadlocks), ADR-0161 (módulos y roles), ADR-0284 (guía de foco), ADR-0389 (guías interactivas).
- **Maqueta:** `docs/maquetas/ofertas-promociones-2026-10/` (la pantalla) y `formulario/opcion-3-tres-preguntas.html` (el formulario que eligió Felipe entre cinco).

## El problema

Una campaña solo sabía dar UN descuento: un % para todas sus prendas y todas sus fechas. Felipe necesita registrar ofertas y promociones DENTRO de la configuración de
cada campaña (con fechas propias, solo algunas categorías, solo algunos días de la semana: «martes y jueves»), y el primer formulario tenía 42 controles a la vez: largo
y tedioso para quien no sabe. Se hicieron cinco alternativas y eligió la tercera: tres preguntas, una por pantalla, con lo más común ya contestado.

## Lo que se decidió (etapa 1)

1. **Una campaña tiene ofertas; una oferta es «un % menos»** con sus fechas (dentro de las de la campaña), sus días de la semana (1 lunes … 7 domingo), «solo
   estas categorías» o «dejar fuera estas», y si entran o no las prendas de Claurè (fuera de fábrica: es otra empresa). **Y en qué tiendas**: la persona marca cada tienda una por una
   (Felipe, 2026-10-23: no hay botón «Todas las tiendas»; no viene ninguna puesta salvo que la campaña solo pueda regir en una), **nunca en una tienda donde la campaña no rige** (la base lo exige y la
   caja intersecta las dos reglas). Marcarlas TODAS es no limitar: la base lo guarda sin filas (así una tienda nueva no queda fuera) y la frase dice «en todas las tiendas». Sin tienda
   conocida (null) solo rigen las ofertas sin filas, como las campañas de todas las sedes.
   *(La primera versión heredaba las tiendas de la campaña sin dejar elegir; Felipe lo objetó el 2026-10-23 al verla: la maqueta aprobada las tenía por oferta.)*
2. **Las otras 14 formas de la maqueta** (3x2, la 2.ª al 50 %, un monto, un regalo, el Club…) **NO están construidas**: cambian dinero en la caja (`registrar_venta`) y
   cada una necesita su verificación. Se ven apagadas con «Pronto». Es la etapa 2, por oleadas.
3. **La hoja reemplaza a la de siempre; no la contiene.** (Felipe, 2026-10-23, dos veces: primero se dejó un enlace a la hoja de siempre y después se la embebió dentro; ninguna de las dos era lo
   pedido.) Cada campo de la hoja vieja tiene su lugar en una oferta: el descuento es «Qué le das», las categorías y las tiendas son «En qué prendas y dónde», y las fechas son «Cuándo». Lo
   único que la campaña misma conserva se toca en su franja, con las mismas puertas de siempre (`PATCH /api/productos/etiquetas`): **«Cambiar fechas»** (y «Repetir en AAAA» si ya pasó, con
   las fechas del año que viene puestas), **«Retirar»** el descuento de siempre de una campaña antigua (que sale en «Ya registradas» como una fila más) y **«Quitar el límite»** de tiendas que
   una campaña de antes pudiera traer. `CampanaModal` solo se abre si la base todavía no tiene las ofertas y en la ficha de Tienda web ▸ Campañas.
4. **Estados:** `borrador` → `activa` → `desactivada`. Quien tiene la llave de las campañas guarda un borrador; **solo un líder activa** y solo un líder cambia o retira una
   que ya rige. Nunca se borra: retirar es un estado, y cada edición guarda cómo estaba (`campana_regla_historial`).
5. **La caja no cambia de lógica:** `fn_campanas_en_sede` —la única fuente que leen Vender, Apartados, la tienda web, el club y `registrar_venta`— suma las ofertas
   activas a su consulta de siempre (una fila por prenda y campaña, la de mayor %). Por eso `registrar_venta`, que verifica el % que trajo la caja contra esa función, hereda las
   ofertas sin tocarse.

```
DECIDÍ:     una tabla `campana_reglas` por campaña y un solo punto de lectura (`fn_campanas_en_sede`), con la oferta en estado «borrador» que nunca cobra.
DESCARTÉ:   meter las ofertas como más columnas de `etiquetas` (una campaña con tres ofertas no cabe en una fila) y reescribir `registrar_venta` (42 mil caracteres con 40
            parches): cobrar es una sola función y las ofertas entran por ahí.
SE ROMPE SI: dos ofertas rigen la misma prenda el mismo día con distinto % y la caja y la base eligen distinto (por eso la base elige con `distinct on … order by %
            desc`, y `registrar_venta` verifica contra la misma función) o si una oferta con días sueltos llega a una tienda con el papel colgado de otro precio
            (la pantalla avisa «el papel colgado no cambia cada día»; no hay etiqueta distinta por día).
```

**Los conteos de la hoja** dicen cuántas prendas DE LA CAMPAÑA alcanza la oferta (`prendasQueAlcanza`, `contarPorCategoria` en `lib/campana-reglas.ts`), no cuántas tiene la categoría en el
catálogo: cada categoría cuenta solo las prendas que la campaña ya trae, y las de Claurè quedan fuera salvo que la oferta las incluya (la hoja dice cuántas quedan fuera). Es lo mismo que hace
`fn_campanas_en_sede`; la prueba `campana-reglas.test.ts` exige que el conteo de una categoría y el de «solo esa categoría» coincidan.

## Estados imposibles que la base no deja existir

Un % fuera de 1–70 · un fin anterior al inicio · una oferta de más de un año · días de la semana repetidos o fuera de 1–7 o sin ninguno · **una oferta que no rige nunca**
(ninguno de sus días cae entre sus fechas: rechazada al guardar, `fn_regla_tiene_dias`) · una categoría a la vez en «solo» y «dejar fuera» · fechas que se salen de las de la
campaña · empezar antes de hoy (salvo al editar sin mover las fechas) · ofertas en una campaña inactiva o desactivada · una oferta `desactivada` que se vuelva a editar.
Las tablas tienen RLS encendido y SIN políticas: se leen y escriben solo por funciones `security definer` (ADR-0195).

## Lo que NO cubre (y queda en el backlog)

- **Lectores directos de `etiquetas.descuento_pct`** que NO pasan por `fn_campanas_en_sede` y por eso no ven una campaña que solo tiene ofertas: el portada de la tienda
  (`tienda_portada`), `campana_detalle`, el reporte de Finanzas (`fn_campanas_reporte`), `tienda_diseno_*`, `fn_configuracion_tiendas` y las copias en TypeScript
  (`lib/precio-de-hoy.ts`, `lib/etiqueta-campana.ts`). Una campaña con solo ofertas cobra bien en caja pero puede no salir en esas pantallas.
- **Etiquetas de precio impresas con días sueltos:** el papel no cambia cada día; hoy solo se avisa.
- **«¿Cuánto margen cedo?»** de la maqueta (usaba cifras inventadas) no se construyó: hace falta la venta real por categoría.
- **El cambio no queda en Actividad** (solo en su historial propio).
- **La ficha de la campaña en Tienda web ▸ Campañas ▸ «Datos y prendas»** (`TarjetaDeCampana`) sigue abriendo la hoja de siempre (`CampanaModal`). Si Felipe quiere una sola hoja en todas partes, se migra aparte.
- **Las categorías de la campaña** ya no tienen dónde elegirse en Insignias (eran del formulario viejo y de la hoja de ADR-0488): la grilla de «¿En qué prendas?» elige las categorías DE LA OFERTA, no las de la campaña
  (ver la actualización (d)). Una campaña nueva, creada por categoría, sigue sin tener dónde decirlo (solo «Prendas», a mano): pendiente de decisión de Felipe.
- **Acción sin responsable:** guardar usa la clave `etiqueta_campana` (ya existente) en vez de pedir el combo «Responsable»; una terminal sin persona no registra ofertas.

## Cómo se hizo (archivos)

- Base: `supabase/migrations/20261023232000_campana_reglas_de_precio.sql` — 4 tablas (`campana_reglas`, `campana_regla_categorias`, `campana_regla_sedes`, `campana_regla_historial`), 3 funciones de
  fechas (`fn_dias_semana_validos`, `fn_regla_tiene_dias`, `fn_regla_rige_en`), `fn_campanas_en_sede` reemplazada (guardada por md5 como las demás), `campana_reglas()`,
  `guardar_campana_regla` (con `p_sede_ids`; la firma de antes se suelta: ADR-0009 no admite dos), `activar_campana_regla`, `retirar_campana_regla`. Idempotente: se puede pegar dos veces. **Sin políticas ni `alter` sobre tablas en uso**: se pega de una vez.
- Web: `lib/campana-reglas.ts` (lógica pura: días, frases, validación, atajos de fechas, cruces), `app/api/productos/campana-reglas/route.ts` (POST guardar · PATCH activar/retirar),
  `components/sellos/OfertasHoja.tsx` (la hoja) con `app/estilos/ofertas.css`, `components/sellos/SellosPantalla.tsx` («Configurar» abre la hoja; desde ella,
  «Cambiar fechas» edita las de la campaña en su franja), `lib/etiquetas-pantalla-datos.ts` (lee `campana_reglas()`; sin la función, la pantalla es la de antes), `lib/sellos-pases.ts`
  («Lo que ya tiene» suma «Ofertas»).
- Guía interactiva: `GUIA_SELLOS` (catalogo.ts) con 14 pasos nuevos; registro de guía de foco: `components/sellos/OfertasHoja.tsx` → aplicada (`FaltanDelPaso`).

## Verificado

- `pnpm pruebas:campana-reglas` (65 casos contra Postgres local con las migraciones al día; entra al CI en `scripts/ci/pruebas-postgres.mjs`): la regla de días y fechas, los estados
  imposibles, la caja (una oferta cobra solo los días que rige y `registrar_venta` verifica el %; borrador no cobra; una más alta gana), el permiso (quien no es líder no activa), el
  historial y la migración dos veces.
- Vitest: `lib/campana-reglas.test.ts` (61), `lib/error-escritura.test.ts`, `lib/sellos-pases.test.ts` y todas las pruebas que vigilan pantallas nuevas (guía de foco, unificar, tema, sugerir,
  guías, montos, módulos, Knip). Suite completa de la web en verde.
- En el navegador (local): crear una oferta de −20 % solo Casacas y Faldas, solo martes y jueves, del 23 al 31 de octubre → borrador → activarla (como líder) → la base da 16 prendas el martes
  27 y 0 el viernes 23; editarla (queda «1 cambio · antes: −20 % …»); retirarla; como Integrante con el módulo Insignias: guarda un borrador, el borrador dice «espera a un líder» y la
  API rechaza activar con el mensaje del líder; modo oscuro; 375 px; la guía interactiva recorre sus 29 pasos sin escribir en la base ni dejar un modal abierto.

- Tiendas por oferta (la objeción de Felipe del 2026-10-23): en el navegador, una oferta de −20 % solo en Tienda Trujillo → la base da 30 prendas en Trujillo y 0 en Lima; la hoja no abre ninguna otra ventana ni trae el formulario viejo: «Cambiar fechas» despliega dos campos en la franja. SQL: 7 casos nuevos (rige solo donde se eligió, nunca fuera de su campaña, todas = no limitar, el taller no es tienda,
  la campaña que se limita después recorta a la oferta, la historia guarda las tiendas).

## Sin verificar

Producción (la migración no está pegada). Vender con una caja abierta y una venta real con la oferta (cubierto por la base: `registrar_venta` verifica contra `fn_campanas_en_sede`).
Lighthouse/lector de pantalla de la hoja. El olor a papel colgado con una oferta de días sueltos en una tienda con etiquetas impresas.

## Actualización 2026-10-23 (c): se acoplan los cambios de producción en la hoja (ADR-0488), manteniendo las etapas

Producción (ADR-0488) rehízo la hoja «Configuración» de la campaña mientras esta se desarrollaba en local: etiqueta viva a la derecha, alerta de costo, grilla de categorías por familia y «Dónde rige».
Felipe pidió quedarse con **lo nuestro donde ya hace más** (el asistente por etapas y «¿Qué le das al cliente?», que entiende ofertas y no solo un %) y con **lo de producción donde es más completo**:

1. **Las etapas cambian de orden:** ¿Qué le das al cliente? → **¿Cuándo?** → **¿En qué prendas y tiendas?**. Prendas y tiendas va al final porque cierra con «Revisa y guarda» (la frase de la oferta, los avisos y el nombre). El cuándo sigue como estaba: atajos, desde/hasta y días de la semana.
2. **¿Qué le das?** suma la alerta de producción bajo el %: «Por debajo del costo: N prendas (… · precio más bajo: S/ X en LIM…). Se puede guardar igual.», en rojo y sin bloquear. Cuenta modelos en su color, no tallas (producción mostraba 1 696 junto a una etiqueta de 1 679). El aviso de «Revisa y guarda» se queda: al cambiar las categorías en la etapa 3 el número cambia y no se vuelve a la 1.
3. **La etiqueta de la derecha es la de producción** (`EtiquetaDeCampana`: descuento, fechas, chip de temporada, a cuántas prendas llega, mosaico de categorías y «En caja»), no la nuestra (`of-etq`, borrada). Se le agregó un `resumen` opcional: **qué prendas, en qué tiendas y cuándo** rige la oferta (una línea en el celular). Antes de elegir qué se le da, dice «Elige qué le das al cliente» y la caja cobra el precio de siempre.
4. **Prendas y dónde:** la grilla de producción (`CategoriasDeCampana`: buscador, familias con su casilla, barra a escala, cuántas prendas trae cada una) y las pastillas de «Dónde rige», sin «Todas las sedes»: sigue la instrucción previa de Felipe (se marcan una por una). *(Dónde rige se pasó a la etapa 2 y la grilla quedó sola en la 3: ver (d).)*
5. Los conteos pasan a **modelo en su color** (`contarPrendas`, `contarPorCategoria`), como el pase, la etiqueta y el modal de producción.

Lo que producción trae y aquí NO se copió: «Todas las sedes» en Dónde rige. Archivos: `components/sellos/OfertasHoja.tsx`, `app/estilos/ofertas.css`,
`components/campana-hoja/EtiquetaDeCampana.tsx` (props `resumen` y `textoSinDescuento`, sin cambiar a producción), `lib/campana-reglas.ts` (conteo por modelo), `lib/guias/pantallas/catalogo.ts` (27 pasos),
`tema/escenarios/registro.mjs` (las tres etapas). Verificado: suite web, tipos, Knip, eslint, 65 casos SQL, guía sin escribir, auditoría de tema (0 hallazgos) y navegador a 1440, 1024 y 375 px.

## Actualización 2026-10-23 (d): «Cuándo y dónde», y la selección de prendas como en producción

Felipe vio la etapa «Cuándo» casi vacía y la selección de prendas de producción más completa que la nuestra. Dos cambios:

1. **Las tiendas pasan a la etapa 2**, que ahora es **¿Cuándo y dónde?** (fechas, días de la semana y «Dónde rige»). La etapa 3 es **¿En qué prendas?** y cierra con «Revisa y guarda». Si faltan las tiendas, «Siguiente» de la etapa 2 se apaga y el «Falta:» lleva a la etapa 2.
2. **La etapa 3 es la selección de producción, tal cual:** «Categorías» con «Elegir todas» / «Quitar todas», la frase «Alcanza a 47 prendas a la venta: 3 de 1 categoría y 44 marcadas a mano.», el buscador y la grilla por familia con **todas** las categorías y sus conteos del catálogo (sin Claurè salvo que se incluya). Viene marcado lo de la campaña (un enlace «Como la campaña» para volver a eso se probó y se quitó: en una campaña de prendas marcadas a mano hacía lo mismo que «Quitar todas»). Se fue el interruptor «Todas las de la campaña / Solo algunas» y «Dejar fuera» (marcar y desmarcar lo reemplaza); «Incluir las de Claurè» queda debajo de la grilla.

3. **Las familias se pliegan** (Felipe lo pidió para que la grilla no llene la pantalla): `CategoriasDeCampana` ganó la opción `plegables`, que SOLO usa esta hoja (la de la campaña de producción las sigue mostrando abiertas). Empiezan plegadas las que no traen nada marcado (se decide una vez, al abrir: marcar después no pliega ni abre nada bajo el mouse), el título lleva «· 1 marcada» para que lo marcado no quede escondido, al buscar se abren las que coinciden, y la casilla de la familia sigue marcándola entera. «Elegir todas» y «Quitar todas» están siempre (apagados si no sirven): si aparecieran al marcar, la lista saltaría bajo el mouse.

**Cómo se guarda (sin cambiar las tablas):** si lo marcado es igual a las categorías de la campaña, la oferta se guarda sin lista (= «las de la campaña»: las marcadas a mano y las que se sumen después entran solas); si no, se guarda como «solo estas categorías». Marcar nada no deja guardar.

```
DECIDÍ:      que «solo estas categorías» rija en esas categorías aunque la campaña no las tenga (`fn_campanas_en_sede`: con filas «solo», ya no exige que la prenda sea de la campaña).
DESCARTÉ:    sumar esas categorías a la campaña al guardar la oferta (`etiqueta_categorias`): ensancharía en silencio el descuento de siempre y las demás ofertas «todas las de la campaña», y un
             borrador (que no cobra) cambiaría precios antes de que un líder lo active. Tampoco dejarlas elegir solo dentro de la campaña: la grilla de producción lista todas.
SE ROMPE SI: se espera que una prenda con oferta salga en la vitrina o el pase de su campaña: no sale hasta que se marque en «Prendas» (el pase, la vitrina y la web leen las prendas de la campaña).
```

Esto **revierte** la primera versión (una oferta solo bajaba prendas de su campaña). Archivos: `supabase/migrations/20261023232000_campana_reglas_de_precio.sql` (la rama de ofertas de `fn_campanas_en_sede`), `scripts/pruebas/campana_reglas.mjs` (68 casos),
`lib/campana-reglas.ts` (`prendasQueAlcanza` recibe el catálogo, `categoriasDichas`: con más de 3 categorías el nombre y la frase dicen cuántas son), `components/sellos/OfertasHoja.tsx`, la guía (27 pasos) y los escenarios de tema.
