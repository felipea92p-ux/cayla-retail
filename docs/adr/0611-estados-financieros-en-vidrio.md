# ADR-0611 · Estados financieros en vidrio: una cifra, una frase y un gráfico sobre hilos

- **Fecha:** 2026-11-05 · **Estado:** propuesto. La dirección visual la eligió Felipe; la construcción espera que apruebe su lista de actividades.
- **Decide:** Felipe, mirando dos rondas de referencias y la maqueta `docs/maquetas/finanzas-eeff-vidrio-2026-11/`.
- **Toca:** ADR-0585 (Estados financieros, que este rediseño reemplaza en su forma, no en sus datos ni permisos), ADR-0596 (vidrio «Serena»), ADR-0169
  (paleta), ADR-0136 (movimiento), ADR-0493 (El telar) y ADR-0358 (una función, una pieza).

## El problema

Felipe: el submódulo es de los más importantes y «no dice mucho» en sus vistas. Hoy hay siete vistas en una barra y cada estado carga varias tarjetas.
Pidió algo gráfico, entendible para cualquiera, sofisticado, con muchas animaciones, sin conceptos raros y serio. Además opina que el vidrio actual del
ERP es «algo pobre». La propia receta da la causa en `app/estilos/vidrio/recetas.css`: «con el fondo tan parejo el desenfoque casi no se ve».

## Lo que se decidió

| Tema | Decisión | De dónde sale |
|---|---|---|
| Sensación | Neobanco moderno, con material y luz | Pregunta 1; descartó Mercury y Linear por planos, eligió LifeStats y Revolut |
| Protagonista | La cifra y una frase que la interpreta | Pregunta 4 |
| Densidad | Muy poca información a la vista; lo demás, plegado | Pregunta 5 |
| Nombres | El nombre real del estado, sin las preguntas de ADR-0585 | Pregunta 9 |
| Navegación | Pestañas fijas | Eligió mirando la maqueta, contra la portada que se abre |
| Letra de las cifras | Inter | Eligió mirando, contra DM Sans |
| Fondo | Hilos: hilos finos que fluyen, con un hilo rojo | Eligió mirando, entre ocho estilos |
| Gráficos | Línea y área, cascada, tubos; categorías a la vista. Sin río de flujo | Marcas de las dos rondas |
| Temas | Claro y oscuro al mismo nivel | Pregunta 3 |

**Fechas (Felipe, 2026-11-05):** pidió poder elegir fechas específicas. La maqueta cambia `<SelectorMes>` por un calendario de vidrio con atajos y meses: rango en
Ganancias, Flujo y Patrimonio; una sola fecha en Balance. Falta su OK. Construirlo cambia la URL de esta pantalla a `?desde=&hasta=` y `fn_patrimonio_cambios`, que hoy solo
acepta un mes, lo cual lleva migración y pegado en producción.

## Las excepciones a las reglas, y por qué

- **ADR-0596, una receta nueva y no otro vidrio suelto.** El vidrio con filo de luz, brillo que sigue al mouse y borde que desvía se agrega a `recetas.css`
  como receta propia. **Se usa solo en Estados financieros: no cambia ninguna pieza del resto del ERP.** Llevarlo a todo el sistema es otra decisión,
  porque toca todos los módulos. Felipe (2026-11-05): se hará después de construir Estados financieros, con las demás mejoras visuales (ver el backlog de esta rama). La regla de que una hoja no lleva `backdrop-filter` no cambia: la receta es de las placas de la pantalla.
- **Letra.** Inter entra por `next/font` solo en el layout de `/finanzas/reportes`, y solo para las cifras. El ERP sigue con DM Sans y EB Garamond.
- **ADR-0169, colores.** El fondo y sus hilos salen de los tokens, leídos del CSS al pintar. El hilo rojo cuenta como uno de los dos acentos rojos de la
  pantalla. Rojo en texto chico: `rojo-profundo` en claro y un rojo aclarado en oscuro, porque el token `rojo` no alcanza 4,5:1 sobre el vidrio.
- **ADR-0136, movimiento.** Excepción con su lista y su prueba, como las demás: el filo de luz que corre una vez, las cifras que ruedan, la línea que se
  dibuja, las columnas que crecen, los tubos que se llenan y los hilos que se reacomodan al cambiar de pestaña. Sin rebote ni bucle; todo se apaga con
  `prefers-reduced-motion`. El brillo y un desplazamiento de pocos píxeles siguen al mouse, sin moverse solos.
- **Se mantienen sin excepción:** `<EncabezadoPagina>`, la mesa de mando del telar con su sede en la URL, `<Pestanas>` (su gota ya fluye),
  `<Chip>`, los botones del sistema, permisos y lecturas.

## Lo que cuesta

- Cada placa lleva `backdrop-filter`: de 4 a 5 por pantalla. Una tabla o grilla larga no usa esta receta.
- El borde que desvía solo se ve en navegadores Chromium. En otro navegador queda el vidrio sin esa curva.
- Falta medir la fluidez en el Mac mini de la tienda. Si no alcanza, se apaga primero el borde que desvía.

## Lo que se descartó

- **Portada que se abre:** Felipe prefirió pestañas fijas.
- **Fondos Arena, Atardecer, Rojo, Dunas, Ventana, Trama y Niebla:** comparados en la maqueta. El rojo como fondo se lee además como pérdida.
- **Las capturas de referencia en el repo:** son de terceros y el repo es público. Viven en un tablero privado.

## Las mejoras de los componentes, ya en el ERP (2026-11-05)

Salieron de comparar los componentes con otros sistemas (`docs/investigacion/2026-11-05-componentes-frente-a-sistemas.html`) y de probarlas en la maqueta. Felipe ordenó: «Empieza por 1 a 5 y luego elijo
"rápido" para avanzar hasta la 8 y dejar la 9 para el final». **Valen para todo el ERP, no solo para Finanzas**, y son independientes de la reconstrucción de Estados financieros, que sigue propuesta.

| # | Qué | Dónde vive | Alcance real |
|---|---|---|---|
| 1 | Guardar con algo pendiente lleva al campo y dice el error ahí | `useGuiaCampos` (`revisar`, `errorDe`, `marcarError`), `CampoGuiado` | Toda hoja con guía que use `confirma`; `marcarError` solo en Registrar gasto |
| 2 | Lo mal escrito se avisa al salir y se va al corregirlo | `useValidarAlSalir`, `lib/validar-al-salir.ts` | Gastos, `ConsultaDocumento`, `EntradaMonto`; los `<input>` con `CLASE_MONTO_ILEGIBLE` no se marcan con el foco |
| 3 | El monto se ve con miles y dos decimales al salir | `montoParaMostrar` | `CampoMonto` (31 archivos) y `EntradaMonto` (4). Los `<input>` propios con `atributosMontoTexto` o `CLASE_MONTO_ILEGIBLE` (17 archivos), no |
| 4 | El botón no se apaga por lo que falta | `<Boton confirma={guia}>` | 117 botones en 100 archivos |
| 5 | Con el dedo, 44 px | `app/estilos/tacto.css`, `pnpm --filter web tacto:medir` | Medido en 8 rutas a 375 px. Fuera: los puntos de color de Existencias, que no caben sin pisarse |
| 6 | Cuatro tiempos con nombre, ritmo «Rápido» | `--t-resp`, `--t-cambio`, `--t-hoja`, `--t-momento` | Piezas del sistema. Las excepciones de ADR-0136 siguen con los suyos |
| 7 | Vidrio macizo con menos transparencia o más contraste | Final de `recetas.css` | Automático en todo el ERP |
| 8 | Fechas con límites, fechas cortas y teclado en el mes | `CampoFecha` (`min`, `max`), `lib/campo-fecha-reglas.ts`, `SelectorMes` | Límites puestos en Registrar gasto y en las etiquetas. 18 archivos siguen con `type="date"` del navegador |
| 9 | Tabla | «Compacta» en `TablaViva` | Solo esto por ahora: ver abajo |

**Decisiones que se tomaron al construir.** Lo mostrado nunca dice otra cifra: como cada pantalla lee lo escrito a su manera, por defecto solo se da formato a lo que todas leen igual, y lo ambiguo se queda como
se escribió. El límite de una fecha no borra lo tipeado: si lo borrara, un «Hasta» opcional se guardaría vacío mientras la pantalla muestra un error, y por eso la validación de quien usa el campo sigue mandando.
Al poner límites a un rango solo se limita «Hasta»: si «Desde» también tuviera tope, mover una temporada hacia adelante obligaría a cambiar primero el final.

**La mejora 9: lo que decidió Felipe (2026-11-05),** mirando los pros y contras de cada opción:

- **Más tablas con encabezado fijo y orden: después.** `TablaViva` sigue solo en Rendimiento y Movimientos ▸ Ingresos, y 75 tablas son `<Tabla>`. Primero se implementa el diseño de Estados financieros; recién después se llevan las mejoras de componentes y de visuales al resto de los módulos. Lo que falta está anotado, con sus archivos, en `docs/backlog/2026-11-05-financial-statements-redesign-afaa35.md`.
- **Otro lote: no, por ahora.** Marcar varias filas ya existe en Por pagar («Pagar juntos»), Productos, Existencias y Apartados. Si la tienda lo pide en otra pantalla, se hace con ese caso real.
- **Editar en la fila: no.** Toda corrección sigue en su hoja, con responsable y «antes → ahora», y el monto de un gasto no se corrige ni ahí (ADR-0588).
- **Esqueleto de carga: no cambia nada.** Sigue el loader único, y el esqueleto parcial de una sección que ADR-0149 ya admite.

## Cómo se verifica

Cada actividad se abre en el navegador en local, en claro y oscuro, a 1440, 1920 y 375 px. Al cierre: `tema:auditar`, guías, `/formidable` y `/unificar`.
