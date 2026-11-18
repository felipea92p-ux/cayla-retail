# Maqueta · la página Clientes ▸ Fichas (`/clientas`) con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): `components/ClientasPanel.tsx` (`FilaClienta`). Arma la página con lo ya
elegido (cabecera con sus acciones, cuatro cifras en placa, buscador pozo, filtros en gota, avatar en lente, insignias en lente) y pone a
elegir lo propio: **la fila de cada persona**.

**El plan de Clientes es de Dany** (`docs/datos/DECISIONES-2026-09-26-clientas.md`, D-92 a D-111). Esta maqueta solo cambia el material:
no toca qué dice cada fila, el orden, las reglas, el permiso, los avisos ni quién ve el DNI y el celular completos.

Abrir `index.html` (o con la config `maquetas`). Pasa el mouse por las filas.

## Lo que hay hoy

Una tarjeta de papel por persona (el diseño B de su rediseño) dentro de la tarjeta grande: sobre el vidrio son decenas de tarjetas macizas
y el borde de la caja y el de cada fila se pisan.

## Las caras

| Pieza | Caras |
|---|---|
| La fila de cada persona | **A · Filas en la placa** (la placa de las tablas; filas separadas por una línea que nace después del avatar; la que apuntas se ilumina con la gota) · B · Gotas sueltas (una tarjeta de vidrio claro por persona, sin desenfoque) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Medido

En Chrome sin ventana: 54 combinaciones (320 a 1920 px, claro y oscuro, las tres caras), nada se desborda; sin errores de JS. Bajo 640 px
la última compra y la sede bajan bajo la frase, alineadas al nombre.

## Lo que decidió Felipe

**A · Filas en la placa** (2026-11-02).
