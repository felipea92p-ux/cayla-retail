# Maqueta · la página Colaboradores ▸ Equipo con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): `components/ColaboradoresPanel.tsx`, `colaboradores/EquipoLista.tsx`.
Arma la página con lo ya elegido (filas en la placa como en Fichas, avatar en lente, títulos de grupo con su ranura, buscador pozo, atajos en
gota, «Lista / Mosaico» en pozo y gota, insignias en lente) y pone a elegir lo propio: **la píldora del rol** y **«Esperan tu ok»**.

Abrir `index.html` (o con la config `maquetas`). Tocable: una persona se marca, «Lista / Mosaico» cambia la vista, Aprobar o Rechazar saca
el alta de la lista.

## Lo que hay hoy

«Esperan tu ok» es una franja ámbar al 10 % con píldoras de papel; el rol, una píldora: el Líder en tinta sólida (el único bloque negro de
la pantalla) y los demás en hueso.

## Las caras

| Pieza | Caras |
|---|---|
| Píldora del rol | **A · Gotas** (gota clara; el Líder, la gota ahumada) · B · Solo texto (sin píldora; el Líder en negrita con la barrita roja del menú) |
| «Esperan tu ok» | **A · Lente ámbar** (la insignia elegida en grande; cada alta, una gota) · B · Placa con filo (la placa de siempre con un filo ámbar de 3 px) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Medido

En Chrome sin ventana: 162 combinaciones (320 a 1920 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS. En el
teléfono cada alta ocupa su renglón con sus dos botones debajo (a 320 px se salían 18 px), y «Esperan tu ok» va arriba.

## Lo que decidió Felipe

**Rol A · Gotas y «Esperan tu ok» A · Lente ámbar** (2026-11-02).
