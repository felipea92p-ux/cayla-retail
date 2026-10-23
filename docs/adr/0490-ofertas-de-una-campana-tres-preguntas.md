# ADR-0490 — Las ofertas de una campaña: «Tres preguntas», un % menos con fechas, días de la semana y categorías

- **Fecha:** 2026-10-23 · **Estado:** construido y probado SOLO EN LOCAL (Felipe pidió «implementarlo ya dentro del sistema pero solo en local para poder
  hacer las pruebas»). **La migración `20261023190000_campana_reglas_de_precio.sql` NO está en producción**; el número de este ADR y de la migración son
  provisionales (no se reservaron en el remoto: `pnpm reservar adr` / `migracion` antes de abrir el PR, y renumerar si chocan).
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
- **Las categorías de la campaña** ya no tienen dónde elegirse en Insignias (eran del formulario viejo): hoy las prendas de una campaña entran marcadas con «Prendas». Pendiente de decisión de Felipe:
  elegirlas en la pregunta «En qué prendas» de cada oferta (y que se sumen a la campaña), solo para esa oferta, o un botón «Categorías» aparte.
- **Acción sin responsable:** guardar usa la clave `etiqueta_campana` (ya existente) en vez de pedir el combo «Responsable»; una terminal sin persona no registra ofertas.

## Cómo se hizo (archivos)

- Base: `supabase/migrations/20261023190000_campana_reglas_de_precio.sql` — 4 tablas (`campana_reglas`, `campana_regla_categorias`, `campana_regla_sedes`, `campana_regla_historial`), 3 funciones de
  fechas (`fn_dias_semana_validos`, `fn_regla_tiene_dias`, `fn_regla_rige_en`), `fn_campanas_en_sede` reemplazada (guardada por md5 como las demás), `campana_reglas()`,
  `guardar_campana_regla` (con `p_sede_ids`; la firma de antes se suelta: ADR-0009 no admite dos), `activar_campana_regla`, `retirar_campana_regla`. Idempotente: se puede pegar dos veces. **Sin políticas ni `alter` sobre tablas en uso**: se pega de una vez.
- Web: `lib/campana-reglas.ts` (lógica pura: días, frases, validación, atajos de fechas, cruces), `app/api/productos/campana-reglas/route.ts` (POST guardar · PATCH activar/retirar),
  `components/sellos/OfertasHoja.tsx` (la hoja) con `app/estilos/ofertas.css`, `components/sellos/SellosPantalla.tsx` («Configurar» abre la hoja; desde ella,
  «Fechas y prendas de la campaña» edita la campaña en la misma hoja con `FormularioCampana`), `lib/etiquetas-pantalla-datos.ts` (lee `campana_reglas()`; sin la función, la pantalla es la de antes), `lib/sellos-pases.ts`
  («Lo que ya tiene» suma «Ofertas»).
- Guía interactiva: `GUIA_SELLOS` (catalogo.ts) con 13 pasos nuevos; registro de guía de foco: `components/sellos/OfertasHoja.tsx` → aplicada (`FaltanDelPaso`).

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
