# Maqueta · la página Gestión ▸ Plan del piso con vidrio (2026-11-02)

Página entera del tablero `docs/vidrio/README.md` (ADR-0596): `app/(app)/gestion/plan-del-piso/page.tsx`, `components/plan-piso/`,
`app/estilos/plan-piso.css`. El riel de perchas es la maqueta A «La percha» que Felipe eligió el 2026-10-11 (ADR-0352): **el pictograma, sus
colores por grupo (son dato) y el movimiento (las perchas cuelgan una vez) no cambian**. Se elige lo propio: **la tarjeta** y **la banda del
riel** de la que cuelgan las perchas. Lo ya elegido entra tal cual (cabecera, pestañas en gota, botones, chips en lente).

Abrir `index.html` (o con la config `maquetas`). «¿Por qué?» abre su lámina; «Volver a colgar» repite la entrada de las perchas.

## Lo que hay hoy

Una tarjeta de papel con el estado, el riel sobre una banda hueso, la leyenda en fichas de papel y el «¿Por qué?» en un panel hueso.

## Las caras

| Pieza | Caras |
|---|---|
| La tarjeta | A · Placa Serena · **B · Al aire** (sin tarjeta, como el mapa del Observatorio; la leyenda en placas chicas, el «¿Por qué?» en una lámina de vidrio) |
| La banda del riel | A · Pozo (hundida) · **B · Estante de vidrio** (un tubo de vidrio cruza arriba, los tramos cuelgan de él y detrás hay una vitrina translúcida) |

En negrita, la recomendada. Lo que gana y lo que cuesta cada una, al pie de `index.html`.

## Medido

En Chrome sin ventana: 162 combinaciones (320 a 1920 px, claro y oscuro, todas las caras), nada se desborda; sin errores de JS. A 320 px
las pestañas se salían 10 px: ahora corren de lado, como las de Configuración.

## Lo que decidió Felipe

**Tarjeta B · Al aire y banda B · Estante de vidrio** (2026-11-02), las recomendadas.
