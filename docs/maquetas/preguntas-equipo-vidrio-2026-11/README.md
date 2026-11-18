# Maqueta · Gestión ▸ Preguntas del equipo con vidrio (2026-11-02)

Una página entera de la sección 3 del tablero `docs/vidrio/README.md` (ADR-0596): Gestión ▸ Preguntas del equipo (`app/(app)/gestion/preguntas`
→ `components/asistente/PreguntasEquipo.tsx` e `InformeSemanal.tsx`, ADR-0536).

Abrir `index.html` (o con la config `maquetas` del navegador integrado). La barra negra elige la cara de lo propio, el tema y el ancho (de 320
a 1920 px). «Ver las N preguntas» despliega las que sostienen cada mejora.

Está armada **solo con lo ya elegido**: cabecera A, selector de mes B · Gota entera, tarjetas de cifra A · Placa (la que filtra, hundida),
títulos de sección con su globito, barra de avance A · Tubo, tabla B · Placa Serena, avatar en lente, insignia A, filtros A · Gotas, «Ver más» y
botones gota.

## Lo propio (con caras)

| Pieza | Cara | Cómo es |
|---|---|---|
| Lo que conviene mejorar (`InformeSemanal`, cada `Mejora`) | Como ahora | Tarjeta de papel; el número en un círculo arena; las preguntas desplegadas, con una raya arena a la izquierda. |
| | **A · Placa con su número en gota** (recomendada) | La placa Serena; el número, una gota clara; las preguntas, en un pozo. |
| | B · Lentes del tono | Cada mejora, una lente de su tipo (función nueva ámbar; mover o escribir pizarra; dar acceso y capacitar neutras). |

Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Qué cuenta cada cifra, el orden de las mejoras, sus tipos y colores, «Armar el de la semana pasada» (una vez), las barras, la lista con el nombre
de quien preguntó y lo que buscaba, «Sí / No / —», y el mes en la URL.

## Reglas que respeta

Solo tokens. Claro y oscuro. Sin movimiento nuevo (el despliegue ya era así); todo se apaga con `prefers-reduced-motion`. Datos inventados.
Medida de 320 a 1920 px sin que nada se salga. En la maqueta, `marco.css` ya usa `.num` y `.fila`, así que aquí se llaman `.mj-n` y `.mj-f`.

## Lo que decidió Felipe

Pendiente.
