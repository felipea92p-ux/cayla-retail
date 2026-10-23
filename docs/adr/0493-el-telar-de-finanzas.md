# ADR-0493 — El telar de Finanzas: una barra común para los seis submódulos y cada uno con su forma

- **Fecha:** 2026-10-23 · **Estado:** aceptado. Felipe eligió «El telar de Finanzas» mirando la maqueta y aprobó la lista de 11
  actividades y sus decisiones a, b, c, f y g el mismo día («aprueba a todos y que tenga en cuenta esa barra»). Rama
  `claude/finanzas-gastos-maquetas-6b9a9b`.
- **Relacionados:** ADR-0195 (Finanzas: este ADR reemplaza su «Ajuste de diseño al spike» para lo que se dibuja de nuevo), ADR-0136
  (movimiento, con la excepción de abajo), ADR-0358 (una función, una pieza), ADR-0220 (la cabecera única), ADR-0169 y ADR-0336 (tokens y
  modo oscuro), ADR-0389 (guías), ADR-0433 (el alcance de Finanzas, que no se toca aquí).
- **Maqueta:** `docs/maquetas/finanzas-telar-2026-10/` (rama `claude/finanzas-redesign-filters-d154a4`; publicada en
  https://claude.ai/artifact/7sesZaQD3Z2Bi5wB2hVhng). Diagnóstico de Gastos y sus 13 hallazgos: `docs/maquetas/finanzas-v3-2026-10/gastos/`.

## El problema

Felipe (2026-10-23): Finanzas está «muy básico y poco entendible», tiene filtros que no funcionan, le faltan vueltas y **debe poder
separarse siempre por sede**. Cada uno de los seis submódulos tenía su selector de sede («Ver», `?ver=`), y cada uno con su propio valor por
defecto: Gastos abría en la sede donde trabaja la persona y el Resumen, en todas. Al pasar de uno al otro, la sede cambiaba sola. En Gastos,
además, el selector solo aparecía para el líder (`persona.rol === "lider"`), mientras que la base también da todas las sedes a quien tiene
Configuración, Cierre de mes o CAYLA Global. Esa persona veía «Tienda Lima» y no podía cambiarla.

## Lo que se decidió

1. **Una mesa de mando, montada una sola vez** en `app/(app)/finanzas/layout.tsx` (`components/finanzas/telar/MesaDeMando.tsx`), fija bajo la
   cabecera del ERP. Arriba van las pestañas de los submódulos que la cuenta ve (salen de las hijas de Finanzas en `lib/menu.ts`: la barra y el
   lateral nunca muestran submódulos distintos), «Te toca» y «Registrar gasto». Abajo, los **hilos de sede** y el mes (`<SelectorMes>`).
2. **La sede y el mes viven en la URL**: `?sede=todas|empresa|<id de ubicación>` y `?mes=AAAA-MM`. Al cambiar de submódulo viajan solo esos
   dos; en la misma pantalla se conservan sus demás parámetros. «todas» y el mes de hoy no se escriben. La regla es pura y tiene su prueba
   (`lib/finanzas-telar-reglas.ts`). **Transición:** cada página lee la sede con `sedeDeLaUrl(sp)`, donde `?ver=` gana sobre `?sede=` mientras
   cada submódulo conserve su selector viejo; la barra siempre quita `?ver=`, así que los dos funcionan. Sin ninguno de los dos, «todas»: la
   barra y la pantalla dicen lo mismo. Cada sesión de Finanzas saca su selector viejo cuando llega a su submódulo (decisión f).
3. **Quién elige la sede lo dice la base, no el rol** (decisión c): `veFinanzasDeTodoDe(persona)`, la misma pregunta que
   `fn_ve_finanzas_de_todo`. Quien no ve todo tiene un solo hilo: el suyo. Gastos ya lo usa; los demás submódulos lo adoptan al enchufarse.
   El candado real sigue en cada función de la base.
4. **Cada sede es un hilo de color**, y los cinco son **tokens de color de dato** (decisión a): `--color-sede-tru`, `-aqp`, `-lim`, `-tal` y `-emp`,
   en `globals.css`, en el oscuro de `tema.css` y en `.papel-fijo`, con los valores de la maqueta. Empresa va rayada (es de todos). Como la
   tabla `ubicaciones` no tiene código, `colorDeSede()` asigna el color por ciudad o tipo. Una sede que no reconoce (una tienda nueva, un
   almacén) queda «otra», en taupe, y **nunca toma el color de otra sede**. El nombre de la sede va siempre escrito junto a su color.
5. **Cada submódulo pone en su pantalla tres piezas comunes**, pasándoles solo sus datos:
   - la cabecera única (`<EncabezadoPagina>`, ADR-0220) con `<RespuestaTelar>` a la derecha: la pregunta del submódulo y la cifra grande;
     `valor={null}` dice que no se pudo leer;
   - el **orillo** (`<Orillo>`): la tira que reparte la cifra entre las sedes, donde cada tramo elige su sede;
   - el **dock** (`<DockTelar>`, solo escritorio): hasta cuatro acciones con su tecla. En el celular, lo de abajo sigue siendo la Isla.

   **Finanzas deja `<CabeceraPantalla>` y usa la misma cabecera que el resto del ERP:** este ADR actualiza ADR-0195 y la regla
   «La cabecera de una pantalla» de ADR-0358.
6. **«Te toca»** junta los pendientes de los seis submódulos en un cajón (`<Cajon>`), con primero los del submódulo donde se está. Los lee
   `GET /api/finanzas/te-toca?sede=`, sin loader: el layout no recibe la URL y no se vuelve a pintar al cambiar de sede. Cada submódulo suma su
   `pendientesDe…` (`lib/finanzas-te-toca-reglas.ts`), con su propio `try`: si uno falla, la lista sale «incompleta» y no tumba a los demás
   (principio 9). Ningún pendiente inventa una regla, porque cada uno sale de una cifra que su pantalla ya muestra.
7. **Sin un ⌘K propio de Finanzas.** El ERP ya tiene el buscador global (⌘K) en su cabecera (`BuscadorGlobal`); dos ⌘K chocarían por la misma
   tecla y romperían «una función, una pieza». Las acciones de cada submódulo van en el dock.
8. **«Registrar gasto» desde cualquier submódulo** lleva a Gastos con la hoja abierta (`?registrar=1`, que Gastos quita apenas abre la hoja).
   En Gastos no aparece en la barra, porque su cabecera ya lo trae.

## El movimiento de Finanzas (excepción de ADR-0136, decisión b)

Felipe la aprobó acotada a lo de la maqueta: los hilos que crecen bajo la sede elegida, el orillo que se teje al entrar y se reacomoda al
cambiar de sede, la cifra de la respuesta que cuenta, el dock que sube y, en cada submódulo, su gráfico propio (el retazo y el calendario de
Gastos, los frascos, la biblioteca, la balanza y el mapa del cierre). Las reglas: **todo corre una sola vez, con `--ease-cayla`, sin rebote ni
bucle** (salvo las señales que ADR-0136 ya admite) y con `prefers-reduced-motion` todo queda quieto. El CSS vive en `app/estilos/telar.css`.

## Lo que se descartó

- **Seguir con un selector de sede por submódulo**, aunque fuera el mismo dibujado seis veces: cada uno guardaba su sede, y la sede volvía a
  cambiar sola al pasar de uno al otro.
- **Leer la sede en el layout y pasarla a cada página:** un layout de Next no recibe la URL ni se vuelve a pintar al navegar dentro de él.
- **Migrar todo Finanzas de una vez:** la barra llega primero a los seis y cada sesión enchufa su submódulo encima, sin que nadie edite la
  pantalla de otro.

## Cómo se verifica

`lib/finanzas-telar-reglas.test.ts`, `lib/gastos-telar-reglas.test.ts`, `lib/finanzas-te-toca-reglas.test.ts`, `lib/tema-tokens.test.ts` (los
tokens nuevos en los tres lugares) y las guías: las 14 de Finanzas explican la barra (`...TELAR`). En el navegador, a 1440 y a 375 px: elegir
Lima en Gastos y pasar a Resumen la conserva, y Resumen muestra Tienda Lima; Te toca abre el cajón y «Clasificar» lleva a la pestaña de salidas
de caja; «Registrar gasto» desde Resumen abre la hoja en Gastos.
