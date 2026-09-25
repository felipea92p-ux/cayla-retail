"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Insignia } from "@/components/ui/Insignia";
import { esGrupoMenu as esGrupo, type FilaMenu, type GrupoMenu as ItemGrupo, type ItemMenu as Item } from "@/lib/menu";
import { Icono, IC } from "@/components/AppShell";

/**
 * La hoja "Más" del celular (ADR-0205): el MISMO `menu.riel` que arma el lateral de escritorio,
 * en una lista vertical — no un árbol aparte. En celular no hay mouse para el cajón-por-hover del
 * lateral plegado (ADR-0130): esta hoja es su traducción táctil, no una versión reducida de ese
 * gesto. Sin "Colaboradores"/"Roles y accesos" a propósito: esas dos viven solo en el avatar
 * (`PerfilModal`), nunca en el árbol del menú — `menu.riel` ya no las trae.
 */
export function MasMovil({ riel, onClose }: { riel: FilaMenu[]; onClose: () => void }) {
  return (
    <Modal titulo="Más" subtitulo="El menú completo, igual que en escritorio." onClose={onClose}>
      <nav aria-label="Más" className="-mx-2 space-y-5">
        {riel.map((f) => (esGrupo(f) ? <Grupo key={f.id} grupo={f} onNavegar={onClose} /> : <Fila key={f.id} item={f} onNavegar={onClose} />))}
      </nav>
    </Modal>
  );
}

function Grupo({ grupo, onNavegar }: { grupo: ItemGrupo; onNavegar: () => void }) {
  return (
    <div>
      <p aria-hidden className="label-cayla px-3 pb-1.5 text-[11px] text-tinta/55">
        {grupo.etiqueta}
      </p>
      {grupo.hijos.map((h) => (esGrupo(h) ? <Grupo key={h.id} grupo={h} onNavegar={onNavegar} /> : <Fila key={h.id} item={h} onNavegar={onNavegar} />))}
    </div>
  );
}

function Fila({ item, onNavegar }: { item: Item; onNavegar: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavegar}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-tinta transition-colors hover:bg-sand/50"
    >
      <Icono d={IC[item.icono]} className="h-5 w-5 shrink-0 text-taupe" />
      <span className="flex-1">{item.etiqueta}</span>
      {item.contador ? <Insignia n={item.contador} etiqueta="por atender" tamano="compacta" /> : null}
    </Link>
  );
}
