# Auditoría al milímetro — El fondo Lienzo del ERP (ADR-0706) · 2026-11-26 · claude/clean-minimal-backgrounds-a49500
Medido: 1024 claro (quieto) · 1024 oscuro (vivo) · 375×812 claro     Servidor: `http://milimetro.localhost:3059` (worktree, sin base: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9`)
Resumen: 0 graves · 0 medias · 1 leve · 2 decididos a propósito · 1 sin medir

Cómo se midió: una página temporal (`app/auth/prueba-milimetro`, ya borrada) dibujó la capa real `.marco-lienzo` con texto en los tres tonos
(`text-tinta`, `text-secundario`, `text-tenue`) arriba y al pie del fondo, y dos `<TarjetaCifra>` con datos inventados. Corrieron enteros los
medidores de `/color`, `/movimiento`, `/tipografia` y `/espacio`. **El PR solo cambia el fondo:** no dibuja ni toca ninguna pieza interactiva, así
que los once estados no aplican (la capa es `aria-hidden` y `pointer-events: none`).

## Graves
Ninguno. `/color`: 0 textos que fallan contraste en claro (9 medidos) y en oscuro (10 medidos). `/espacio`: 0 blancos bajo 24 px, 0 bajo 44 px
con el dedo y 0 valores fuera de escala. Sin desborde a 375 px (`scrollWidth` 375). `/tipografia`: 0 letras de lectura bajo 14 px.
El fondo calculado es un solo `linear-gradient` en los dos temas, con `filter: none`.

## Medias
Ninguna.

## Leves
1. **En oscuro, dos textos tenues piden «segunda mirada» por APCA** (pasan WCAG AA). — `text-tenue` sobre el fondo — medido: `/color`,
   `apcaDebil: 2`, `textoFalla: 0` — [Práctica] APCA — va a `/color`. Es el tono `tenue` de ADR-0694, igual que sobre Seda: no lo introduce este PR.

## Decididos a propósito
1. **La entrada del fondo dura 1,4 s**, fuera del rango 200–500 ms de lo que responde. Es la misma entrada que tenía Seda (una vez, al cargar, sin
   bucle: «1 animación, 0 bucles, todo quieto a los 1400 ms»); en quieto dura 0 (`1e-05s`).
2. **El vidrio que dobla casi no se nota sobre un fondo sin formas.** Es el costo aceptado en ADR-0706.

## Lo que el medidor marcó y es de la página de prueba
- `montosPartibles: 1` y `tapados: 1`: el «S/ 1 240» inventado de la página temporal y su texto al pie. No son del PR.

## Sin medir
- El fondo dentro del ERP con sesión (menú, cabecera y una pantalla real encima): la página temporal no lleva el marco. Los tonos de texto sobre
  los dos extremos del degradado los mide `lib/tema-tokens.test.ts` («el fondo Lienzo»).
