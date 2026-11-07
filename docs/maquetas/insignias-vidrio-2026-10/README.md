# Maqueta · las insignias de estado y el globito con número, con vidrio (2026-10-31)

Piezas de «3. Las pantallas» del tablero `docs/vidrio/README.md` (ADR-0596): `<Chip>` (288 archivos) y `<Globito>` (15). Van juntas
porque son las dos marcas chicas que acompañan a un dato.

Abrir `index.html` (o con la config `maquetas`). Va sobre el marco y las piezas elegidas (`../vidrio-base-2026-10/`), en una pantalla de
Comprobantes: pestañas con sus globitos (cuenta, «pide», error), íconos con el globito en la esquina, un botón oscuro con su globito, una
lista con los siete tonos de la insignia y, abajo, todos los tonos y variantes juntos (con ícono, el que late, el tachado).

## Lo que hay hoy

- **Insignia:** el punto y la palabra en el tono, con el tono al 15 % de fondo; siete tonos (ámbar 143, pizarra 78, neutro 74, verde 70,
  apagado 24, rojo 21, tinta 2). Solo el neutro es arena maciza.
- **Globito:** tinta al 10 %, ámbar si pide, rojo si es error, crema en un botón oscuro; en la esquina de un ícono, tinta sólida con anillo.

## Las caras

| Pieza | Caras |
|---|---|
| Insignia | **A · Lente de color** (vidrio teñido del tono, con su luz y un filo) · B · Plana con punto (sin fondo) · C · Filo del tono (contorno) |
| Globito | **A · Gota** (gota de vidrio teñida; en la esquina, la gota ahumada con anillo de vidrio) · B · Hundido |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Lo que no cambia

Los siete tonos y su significado, el punto, el que late (solo «Vencida»), el tachado de «Anulado», la variante con ícono; el globito
que no se dibuja con 0 si pide, el que late una vez al cambiar y su texto para lector.

## Medido

En Chrome sin ventana: 32 combinaciones (320 a 1440 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS.

## Lo que decidió Felipe

**Insignia A · Lente de color y globito A · Gota** (2026-11-01).
