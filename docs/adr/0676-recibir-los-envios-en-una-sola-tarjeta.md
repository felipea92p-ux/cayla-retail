# ADR-0676 — Recibir mercadería: los envíos de la sede en una sola tarjeta, cada uno una vez y lo más nuevo arriba

- **Fecha:** 2026-11-17 · **Estado:** construido en la rama `claude/shipments-visualization-redesign-4d0803` (actividades de `/construir`, una
  por commit). Sin migraciones ni base: entra al fusionar y publicar la web.
- **Pidió:** Felipe, 2026-11-17, mirando «Envíos por recibir en esta sede» de Tienda TRU: «los últimos envíos deben estar arriba que los
  antiguos»; mostrar «de mejor manera y más amigable todos los envíos, así como los terminados que salen en terminados y siguen abiertos»; y usar
  «las tablas con superpoderes». Después de tres rondas de maquetas (`docs/maquetas/recibir-envios-2026-11/`) eligió la **«C · Índice»**.
- **Sigue a:** ADR-0362 (envíos de órdenes de compra), ADR-0393 (recibir contando; lo que queda por terminar), ADR-0596 (`TablaViva`),
  ADR-0644 (la marca al frente), ADR-0358 (una función, una pieza).

## El problema

La puerta de Recibir tenía tres listas y dos avisos para lo mismo:

1. «Envíos por recibir en esta sede» (`EnviosParaRecibir`): por grupos (lo abierto, lo que va en camino, lo sin guía, lo que hizo esta cuenta)
   y, dentro de cada uno, **del más antiguo al más nuevo**. Un envío de hoy quedaba debajo de uno abierto hace ocho días.
2. «Lo recibido» (`RecibidoEnLaSede`) con dos vistas, «Por terminar» y «Terminados».
3. Un envío a medias salía **tres veces**: en un aviso arriba, en la lista de envíos por recibir y en «Terminados» con el chip «Sigue abierto»
   (el arreglo del 2026-11-12, que seguía pareciendo repetido).

## Las decisiones

### 1. Una sola tarjeta, con pestañas que cuentan

`components/recepcion-envio/EnviosDeLaSede.tsx`: «Envíos · <sede>» con «Por recibir · Terminados · Todos» (cada una con su número), un
buscador y la tabla con superpoderes (`TablaViva`): se ordena y se filtra desde la cabecera, dice en una frase lo que se ve y suma al pie.
Abre en «Por recibir»; si no hay nada por recibir, en «Terminados».

### 2. Cada envío, una fila con UN estado

`lib/envios-de-la-sede-reglas.ts` (`filasDeLaSede`) junta las cuatro lecturas que la página ya hacía y entrega una fila por envío:

| Estado | De dónde sale | Qué abre la fila |
|---|---|---|
| Sin guía | `fn_ordenes_directas_por_recibir` | la hoja «Llegó esta orden» |
| En camino | `fn_envios_por_abrir`, sin abrir | la hoja con lo que trae y «Empezar a recibir» |
| Contando | `fn_envios_por_abrir`, abierto | va al envío («Seguir recibiendo») |
| Por terminar | `fn_recepcion_pendientes` | va al envío («Terminar») |
| Terminado | las llegadas recientes, agrupadas por envío | la hoja con lo que trajo |

Un envío que se sigue recibiendo o que quedó por terminar **no sale además como terminado** (`soloTerminados`): lo que ya entró al stock es su
avance, la parte verde de su barra («24 de 119 en stock»). No existe «falta abrir»: el sistema no sabe que un paquete llegó hasta que alguien lo
abre.

### 3. Lo más nuevo, arriba

La tabla abre ordenada por fecha, de la más reciente a la más antigua; lo que no tiene fecha (una orden sin guía) va al final. La fecha de un
envío abierto es cuándo **salió**; la de uno por terminar, cuándo se terminó de contar; la de uno terminado, cuándo llegó. Ya no hay grupos, y lo
que hizo la misma cuenta que mira no se manda al fondo: su fila dice que lo recibe otra persona (decisión 17). La misma regla quedó en
`ordenarFilasPorRecibir`, que usa la cara anterior.

### 4. Los avisos pasan a la fila

Se van los avisos de «a medias» de la sede y el de «por terminar» (`PendientesDeRecibir`, borrado): la fila dice cuánto entró y pone la fecha en
ámbar si lleva 3 días o más contándose (`DIAS_PARA_RESALTAR`) o más de 7 por terminar (ADR-0393). **Queda un aviso:** el del envío viejo de OTRA
sede que `fn_envios_a_medias` le muestra al líder, porque ese envío no tiene fila en esta sede.

### 5. De quién llegó, corto

Felipe, al ver la pantalla: «casi siempre llegan muchos proveedores, así que solo deja el código del envío y si hay más de un proveedor ponle
proveedores varios». Bajo las marcas van el código y de quién llegó: un proveedor, su nombre; más de uno, «Proveedores varios»
(`textoProveedores`). Los nombres siguen en lo que la fila abre y el buscador los encuentra.

## Lo que se pierde, a sabiendas

- **El filtro por proveedor y el rango libre de fechas.** `TablaViva` filtra por una opción por fila y un envío trae varios proveedores: se
  busca por proveedor, marca, guía, orden o número. Las fechas se filtran por tramos (hoy y ayer, últimos 7 días, antes).
- **El camino de cinco paradas** (`Trayecto`) en la lista: el estado es una insignia con su palabra, como en la maqueta elegida. El camino
  sigue dentro del envío.
- **El aviso de «por terminar»** con su total de la sede: cada envío por terminar es una fila.

## DESCARTÉ

- **El panel lateral del envío** de la maqueta: cada fila ya abre la hoja que existía para su estado; un panel nuevo las repetiría y pondría un
  clic antes de «Seguir recibiendo».
- **Las miniaturas de las prendas en esta rama** (Felipe eligió «cerrar ahora, miniaturas después»): la lista no trae las prendas de cada envío y
  las tablas de envíos solo se leen por funciones de la base. Necesita una función nueva (SQL para pegar en producción) y va en su propio PR.
- **Retirar la cara anterior** (`EnviosParaRecibir` + `RecibidoEnLaSede`): sigue saliendo si la base no tiene las funciones de ADR-0393. Borrarla
  es otra decisión.
- **Dos de las tres rondas de maquetas** (`ronda-1.html`: tablas con mucho texto; `ronda-2.html`: anillos y lentes) y las propuestas A y B de la
  tercera (estantes tipo Netflix, seguimiento tipo Amazon).

## SE ROMPE SI

- Alguien vuelve a listar lo recibido sin pasar por `soloTerminados`: el envío a medias vuelve a salir dos veces
  (`lib/envios-de-la-sede-reglas.test.ts` y `lib/recibido-por-envio-reglas.test.ts` lo vigilan).
- La tarjeta recibe más filas de las que el navegador aguanta: `TablaViva` necesita todas en el navegador. Hoy son los envíos abiertos de la
  sede más las últimas 50 llegadas (`TERMINADOS_MAXIMO`).

## Verificación

Visto en el navegador en local (Tienda Trujillo: dos envíos contándose y uno terminado; Tienda Lima: el aviso del envío de otra sede), a 1440 y
375 px, en claro y oscuro. Guía interactiva recorrida (18 pasos). Auditoría «Al milímetro»: 0 graves
(`docs/milimetro/auditorias/2026-11-17-recibir-envios-de-la-sede.md`). **Sin ver:** filas «En camino», «Sin guía» y «Por terminar» y el aviso de
«no se pudo leer»: la base local no tiene ninguno; los cubren las pruebas de la lógica.
