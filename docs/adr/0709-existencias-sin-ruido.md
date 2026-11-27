# ADR-0709 — Existencias sin ruido

- **Fecha:** 2026-11-26 · **Estado:** construido en la rama `claude/revisar-utilidad-elementos-68e976`. Sin migraciones ni base: entra al
  fusionar y publicar la web. Número reservado con `pnpm reservar adr`.
- **Pidió:** Felipe, 2026-11-26, sobre una captura de Existencias en TRU: «hay que revisar si todo lo que muestra sirve de algo o solo hay
  cosas que estorban». Análisis en `docs/pantallas/inventario.md` (2026-11-26); eligió mirando la maqueta
  `docs/maquetas/existencias-sin-ruido-2026-11/` (antes y después) y, al verla, sumó dos cosas: fuera «Se acaban» y «Sin ventas» («eso se ve
  en Gestión ▸ Análisis») y fuera el anillo «0 de 74 hoy» («tampoco sirve»). Aprobó el después: «Sí, aplícalo».
- **Cambia:** ADR-0344 (atajos de Existencias: quedan cinco; el anillo de §16 se va), ADR-0391 (la franja del piso sin cuadrar lleva al
  barrido y se calla con uno abierto), ADR-0328 d.5 en lo que se MUESTRA (la cifra de colgadas no se compara con lo que cabe mientras el piso
  esté por cuadrar), ADR-0329 (la nota «de N» solo con cuadre), ADR-0690 (el botón de la cabecera se va mientras hay un barrido abierto).
- **No cambia:** ninguna regla de negocio ni de stock. Ningún candado, ninguna función de la base, ninguna escritura.

## El problema

En una pantalla de 680 px de alto no se veía ni una prenda. Casi cada pieza servía; lo que estorbaba eran sus **repeticiones**:

- **El piso sin cuadrar se decía cinco veces, con dos salidas distintas**: «· por cuadrar» en la cifra, la pausa en el chip «Por colgar», la
  franja ámbar «nunca se ha cuadrado», la tarea dentro del anillo y la banda «Barrido en curso» (un barrido confirmado ES un cuadre, ADR-0690
  §5). La banda decía «Sumarme» (`/inventario/barrido`, se escanea lo colgado) y la franja «Cuadrar el piso» (`/inventario/cuadrar`, se
  escanea lo guardado): una persona veía dos tareas donde había una.
- **Dos puertas al barrido**, una debajo de la otra: el botón «Barrido en curso» y el «Sumarme» de la banda.
- **«691 de 480 · por cuadrar»** se leía «211 de más», y sin cuadre ninguna de las dos cifras es confiable.
- **La fila «Gestión» del panel de filtros** («Hoy» y «Condición») hacía lo mismo que los atajos y que tocar las cifras.
- **El anillo «0 de 74 hoy»** abría «Pendientes de hoy», cuya lista ya estaba en otro lado: el piso, las dañadas, lo que viene en camino y
  «sin stock atrás» en la misma pantalla; las ventas sin registrar, los apartados vencidos y los traslados atrasados en los avisos de Inicio.
- **«Se acaban» y «Sin ventas»** con su rótulo «Recomendados»: el ritmo de venta se mira en Análisis.
- **«Sonido al confirmar»** vivía dentro de los filtros, y no es un filtro; **«Ver el valor a costo»** ocupaba una fila sola.

## La decisión

DECIDÍ, pieza por pieza (cada una con su número de la maqueta):

1. **Un solo aviso del piso.** Con un barrido abierto queda solo su banda, que ahora dice «Al terminarlo, el piso queda cuadrado»
   (`avisoDeBarrido`, `AL_TERMINAR_EL_BARRIDO`); la franja y el ícono «Avisos» del celular se callan (`InventarioPanel` prop `barridoAbierto`,
   `AvisosExistencias`). Sin barrido abierto, la franja vuelve y su botón es **«Hacer el barrido»**: el barrido es la entrada de la tienda.
   `/inventario/cuadrar` sigue existiendo, sin botón en Existencias.
2. **Fuera el botón de la cabecera mientras hay un barrido abierto**; sin barrido es «Barrido del piso», como siempre (`BotonBarrido`).
3. **«691 según el sistema»** mientras el piso está por cuadrar (`notaCapacidadPiso`, `NOTA_SIN_CUADRE`); «de 480» vuelve con el cuadre.
   La explicación al pasar el mouse sigue diciendo cuántas caben y por qué falta el cuadre.
4. **Fuera la fila «Gestión»** del panel (en la computadora y en la hoja del celular). Lo que solo ella hacía —«Mantener» y combinar un
   «Hoy» con una «Condición»— se pierde: nadie lo pedía en el piso.
5. **Fuera el chip «Por colgar» mientras el piso está en pausa** (`FiltrosRapidos`); vuelve con su número cuando se cuadre. Si ya está
   puesto (un enlace viejo), se queda para poder quitarlo.
6. **Fuera el anillo y la ventana «Pendientes de hoy»** (también el botón «Pendientes» del Taller, que abría la misma ventana): se borran
   `AnilloMision`, `ParaHoy`, `lib/existencias-mision.ts`, las tareas de `lib/existencias-para-hoy.ts` (queda la cuenta `porColgarDeLaSede`,
   que comparten el filtro «Hoy» y el Inicio de Almacén) y `lib/por-regularizar-cuenta.ts`; la página ya no lee la cola por regularizar.
   «Resumen por categoría», que solo se abría desde ahí, pasa al pie de la lista.
7. **Fuera «Se acaban» y «Sin ventas»** de los atajos y de las condiciones de la URL (`CONDICIONES`); un enlace viejo con
   `condicion=se_acaban` abre la lista sin ese filtro.
8. **«Sonido al confirmar» al pie de la lista**, junto a «Descargar CSV» y «Resumen por categoría», en las tres vistas.
9. **«Ver el valor a costo» bajo las cifras**, a la derecha de la cabecera (en el celular sigue en la hoja «Resumen»).

DESCARTÉ:
- **Que los atajos cuenten productos, como la lista** (la tarea #6 de la maqueta). Con un caso de «Hoy» la lista va por PRENDA (modelo +
  color) a propósito (ADR-0331 act. c: una tarjeta enseña un color a la vez, y contar por modelo escondía colores); el atajo cuenta lo que
  trae al tocarlo y la lista lo dice en su unidad («918 prendas»). El problema real es que 918 cosas por traer no son una tarea: queda para
  cuando se mida en producción cuántas vendieron en 30 días (tarea #7 del análisis).
- **Mover el sonido a la hoja de la talla**, como decía la maqueta: esa hoja la está rediseñando otra sesión (`existencias-modal-liviano`) y
  el pie de la lista es igual de cerca.
- **Dejar «Pendientes» como un botón simple**: Felipe lo pidió fuera, y cada cosa que listaba tiene otro lugar.

SE ROMPE SI: una sede nunca cuadró y nadie abre un barrido. Entonces la franja es el único aviso, y hoy lo es; si se la quitara también, nadie
sabría que «en almacén» puede estar colgado. O si Inicio dejara de avisar las ventas sin registrar vencidas: era la otra puerta que tenían.

## Cómo se verifica

- `lib/existencias-rapidos.test.ts`, `lib/existencias-filtros.test.ts`, `lib/capacidad-piso.test.ts`, `lib/barrido-piso-reglas.test.ts`,
  `lib/inicio-almacen-reglas.test.ts`, `lib/existencias-para-hoy.test.ts`; `pnpm knip` y `pnpm knip:produccion` sin nada nuevo.
- En el navegador, con base (2026-11-26, noche: una pila Supabase propia con todas las migraciones y dos sedes inventadas, Trujillo con un
  barrido abierto y Lima sin barrido ni cuadre): una banda sin botón ni franja ni ícono «Avisos» a 375 px; sin barrido, «Barrido del piso» y la
  franja con «Hacer el barrido»; «según el sistema»; los atajos sin «Por colgar», «Se acaban» ni «Sin ventas»; el panel con dos filas y el pie
  con el sonido en las tres vistas. A 1440, 1920 y 375 px, claro y oscuro: capturas en `docs/maquetas/existencias-sin-ruido-2026-11/capturas/`.
  `/milimetro` (`docs/milimetro/auditorias/2026-11-26-existencias-sin-ruido.md`), `/formidable` (`docs/formidable/existencias-sin-ruido.md`),
  `tema:auditar` (0 hallazgos solo en oscuro) y `guias:recorrer` (35/35 en escritorio, 33/33 a 375).

**Ajustes al verlo con base (2026-11-26, noche):** tres cosas que solo se vieron con datos. (a) **«Ver el valor a costo», abierto, se dibuja a lo
ancho bajo la cabecera** (`abrirEn`, un portal a una caja vacía que no ocupa lugar): en la columna de las cifras la ensanchaba, la columna bajaba
entera a la izquierda, y topada a su ancho alargaba la cabecera y el título bajaba 156 px. Cerrado, el enlace sigue bajo las cifras (punto 9).
(b) **«Por colgar» no aparece ni mientras se calcula el plan** (`pausaPrevista`: el piso nunca cuadrado, que la capacidad ya sabe antes): se
dibujaba un instante y al irse los demás atajos saltaban (ADR-0185). (c) **El pie, con sus tres herramientas, se parte en dos renglones**: 16 px
entre ellos y «Sonido al confirmar» con su área de 44 px con el dedo (`area-dedo`).
