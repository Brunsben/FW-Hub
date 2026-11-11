"use client";

import { useCallback, type PointerEventHandler } from "react";
import { pointerWithin, rectIntersection, useDraggable, useDroppable, type CollisionDetection } from "@dnd-kit/core";

// Drag and Drop der Eingabemaske (Spec 7.2, dnd-kit). Gezogen wird nur mit
// Maus/Finger (ab 6 px Bewegung, darunter bleibt es ein Klick). Für die Tastatur
// gibt es zu jeder Aktion den Klickweg (+, Pfeile, Verschieben/Kopieren,
// Termin bearbeiten); darum werden keine Tastatur-Listener gesetzt, die sonst
// mit den Knöpfen in den Zeilen kollidieren würden.

export type ZiehDaten =
  | { art: "thema"; themaId: number; titel: string }
  | { art: "block"; blockId: number; titel: string }
  | { art: "person"; body: { kameradId: number } | { externePersonId: number }; titel: string }
  | { art: "position"; id: number; terminId: number; titel: string }
  | { art: "termin"; id: number; titel: string };

export type ZielDaten =
  | { ziel: "termin"; terminId: number }
  | { ziel: "position"; id: number; terminId: number; position: number }
  | { ziel: "tag"; datum: string };

export function useZiehbar(id: string, daten: ZiehDaten, aus = false) {
  const d = useDraggable({ id, data: daten, disabled: aus });
  return {
    knoten: d.setNodeRef,
    onPointerDown: d.listeners?.onPointerDown as PointerEventHandler | undefined,
    zieht: d.isDragging,
  };
}

export function useZiel(id: string, daten: ZielDaten) {
  const d = useDroppable({ id, data: daten });
  return { knoten: d.setNodeRef, ueber: d.isOver };
}

/** Ein Element, das zugleich gezogen und abgelegt werden kann (Themenposition). */
export function useBeides(id: string, zieh: ZiehDaten, ziel: ZielDaten, aus = false) {
  const z = useZiehbar(`zieh-${id}`, zieh, aus);
  const d = useZiel(`ziel-${id}`, ziel);
  const zKnoten = z.knoten, dKnoten = d.knoten;
  const knoten = useCallback((el: HTMLElement | null) => { zKnoten(el); dKnoten(el); }, [zKnoten, dKnoten]);
  return { knoten, onPointerDown: z.onPointerDown, zieht: z.zieht, ueber: d.ueber };
}

/** Verschachtelte Ziele: die Themenposition vor dem Termin, der Termin vor dem Tag. */
export const kollision: CollisionDetection = (args) => {
  const treffer = pointerWithin(args);
  const liste = treffer.length ? treffer : rectIntersection(args);
  const rang = (id: string | number) => {
    const z = args.droppableContainers.find((c) => c.id === id)?.data.current as ZielDaten | undefined;
    return z?.ziel === "position" ? 0 : z?.ziel === "termin" ? 1 : 2;
  };
  return [...liste].sort((a, b) => rang(a.id) - rang(b.id)).slice(0, 1);
};
