# 2026-10-02 · Cobro: la línea del número de carné/pasaporte ya no se rompe

- Con un tipo de documento distinto de DNI, `DocumentoDelComprobante` devolvía el número y el nombre como hijos sueltos (Fragment) y la grilla de `.hoja-cobro-doc` (globals.css) los repartía mal; ahora van en un solo `div`, igual que el DNI.
- Sin migración ni cambio de reglas. Falta verlo con clics reales a escritorio y a 375 px.
