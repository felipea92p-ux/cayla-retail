# Maqueta · «¿Quieres volver a agregar esta prenda?» (2026-10-28)

**Estado: maqueta para elegir. Nada construido, sin migración.** Abrir `index.html` con doble clic (o desde el servidor `maqueta-referentes`).
La barra negra de arriba no es parte del diseño: elige la dirección (A/B/C), la pantalla (escritorio con pistola · celular con cámara),
el tema y la «Cámara lenta». `?sinmov` apaga el movimiento. Todo se puede tocar; nada se guarda. Datos inventados.

## El pedido (Felipe, 2026-10-28)

Al escanear una prenda (bajar mercadería o cualquier escáner), **la primera vez se registra normal**. Si la misma prenda se vuelve a
leer, que salga un mensaje **«¿Quieres volver a agregar esta prenda?» con el total**. Las colaboradoras cuentan que cuando se quedan
con la etiqueta frente al lector mucho tiempo, vuelve a leerla y la prenda se agrega duplicada.

## Lo que pasa hoy (código leído, no supuesto)

- `BajarAlPisoForm.tsx` → `leerCodigo` / `leerPrenda` (`lib/bajada-reglas.ts`): **toda lectura suma 1**, sin preguntar. La ayuda de la
  pantalla dice «Cada lectura suma 1. Si tienes 12 iguales, escanea una y cambia el número».
- La cámara en ráfaga (`EscanerConteo.tsx` → `debeContarLectura`) ya evita que **una etiqueta quieta** sume sola… pero solo si el lector
  ve un cuadro sin código entre dos lecturas. Una mano que tiembla (la etiqueta sale y entra del cuadro) sí duplica. Con la pistola
  no hay ninguna defensa.
- Los demás escáneres (Cuadrar el piso, Recibir envío, Llegó mercadería, Etiquetas, Apartar, Vender) usan el mismo patrón de «lectura = +1».

## La regla que muestra la maqueta (decidida, para validar mirando)

1. **Primera lectura de una prenda:** se registra normal. Sin pregunta, sin demora, mismo sonido de hoy.
2. **La misma prenda otra vez:** **no se suma sola.** Sale «¿Quieres volver a agregar esta prenda?» con el total **de esa prenda: lo que llevas y lo que
   serían (1 → 2)**. El total de toda la lista ya se ve en la barra de abajo (y en el contador de la cámara). Suena el tono grave de siempre («mira la pantalla»).
3. **Mientras decides**, la misma etiqueta que sigue frente al lector **se ignora**: no suma y solo se cuenta («6 lecturas repetidas
   ignoradas»). Eso es lo que hoy duplica.
4. **Responder es tocar, nunca Enter.** La pistola remata cada código con Enter: si el Enter confirmara, la misma etiqueta quieta diría
   «Sí» por la colaboradora. Los botones no toman el foco; `Esc` = «No».
5. **Escanear otra prenda = «No»** a la pregunta y esa otra se lee normal (en la dirección B no: la hoja bloquea).
6. **«Son varias iguales»:** si de verdad hay 12 iguales, pone el total de una vez (con tope del almacén) y esa prenda **deja de
   preguntar** (queda marcada «Varias iguales · sin preguntar», con «Volver a preguntar»). Es la misma idea que ya dice la ayuda de
   hoy, ahora a un toque.

## Las tres direcciones

| | La idea | Ganas | Pagas |
|---|---|---|---|
| **★ A · Aviso en el campo** | La pregunta aparece bajo el campo de escaneo, en la misma tarjeta de las ofertas «La tengo en la mano» (`Aviso` de atención). En el celular ocupa el lugar de la bandeja, que ya tiene prioridad para lo urgente (`aviso` de `EscanerConteo`). | Misma forma que ya existe; la lista y el total quedan a la vista; escanear otra prenda sigue funcionando. | En el celular hay que mirar abajo (por eso suena el tono grave). |
| **B · Hoja al centro** | `<Modal>` angosto con la pregunta; en el celular, hoja que sube desde abajo con asa. | Imposible no verla. | Frena a quien escanea una pila de prendas distintas y tapa la lista, que es lo que hace falta para decidir. |
| **C · La fila pregunta** | La pregunta vive en la fila de la prenda, junto a su número. | Ves prenda, cantidad y respuesta juntas. | Si la fila está lejos o fuera de pantalla, pasa desapercibida; el campo queda sin aviso. |

**Recomiendo A** (decidido: es la que menos frena, reutiliza piezas existentes y respeta «perdonar antes que preguntar»: lo único que
pregunta es la repetición). Felipe elige mirando.

## Dónde aplicaría

| Escáner | Hoy | Propuesta |
|---|---|---|
| Bajar al piso | suma 1 siempre | pregunta en la 2.ª lectura |
| Cuadrar el piso | suma 1 siempre | pregunta en la 2.ª lectura |
| Recibir envío / Llegó mercadería | suma 1 siempre | pregunta en la 2.ª lectura |
| Etiquetas / Apartar | suma 1 siempre | pregunta en la 2.ª lectura |
| **Conteo (cámara)** | una pila de 12 iguales cuenta cada una | **decisión de Felipe** (ver abajo) |
| **Vender (ticket)** | suma 1 siempre | **decisión de Felipe** (ver abajo) |

## Decisiones que quedan para Felipe

1. **Conteo:** contar una pila de 12 blusas iguales ES pasar la misma etiqueta 12 veces (ADR de Conteo conectado). Preguntar cada vez
   lo rompería. Opciones: (a) Conteo no pregunta y conserva su regla de «etiqueta que salió del cuadro»; (b) pregunta solo si la
   repetición llega en menos de ~1,5 s (señal de etiqueta quieta, no de prenda nueva).
2. **Vender:** dos polos iguales en un ticket es normal y es dinero. ¿Pregunta también (con «Son varias iguales») o se deja como hoy?
3. **El umbral de «mucho tiempo»:** la maqueta pregunta en **toda** repetición (lo pedido). Si molesta en la práctica, el ajuste es por
   tiempo (ver 1b), no por prenda.

## Cómo se construiría (para cuando Felipe elija)

- **Una sola función pura**, `lib/lectura-repetida.ts` (sin React, con su prueba): dada la lista, el código leído, la pregunta
  pendiente y las «pilas declaradas», devuelve `suma` · `pregunta` · `ignora` · `tope`. La usan todos los escáneres; ninguno decide por su
  cuenta. La prueba recorre los 6 casos de arriba y las lecturas en ráfaga.
- **Una sola pieza visual** (`<AvisoRepetida>`, con la forma de `<Aviso>`) para que sea igual en todos los escáneres (regla «Una función,
  una pieza», ADR-0358). Movimiento de ADR-0136: entra una vez, sin rebote ni bucle; el sonido grave ya existe (`sonidoDeLectura`).
- **Guía interactiva** (`/guia`): la huella de `bajar.escaner` cambia; el paso se actualiza en el mismo PR. **Textos** de la ayuda:
  «La primera lectura suma 1…» (marcado «Texto nuevo» en la maqueta). **/chaos:** doble clic en «Sí», recarga con la pregunta abierta,
  dos pestañas.
- Sin migración: la pregunta vive en el navegador, antes de tocar `lineas` (los guardados no cambian).

## Lo que esta maqueta NO resuelve

- Una prenda leída dos veces **en dos bajadas distintas** (ya está resuelto por el `token` de la bajada, no por esto).
- Etiquetas que no se leen (se elige por nombre; esa elección no es una «lectura repetida»).
