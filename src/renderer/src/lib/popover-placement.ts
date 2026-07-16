import { useLayoutEffect, useRef } from 'react'

/**
 * Automatische Popover-Ausrichtung (M83): Dropdowns ankern nicht mehr starr
 * per CSS (`left: 0` / `right: 0`), sondern messen sich beim Öffnen am
 * Fenster und wählen die Richtung selbst — linksbündig, wenn rechts Platz
 * ist, sonst rechtsbündig, notfalls an die Fensterkante geklemmt; nach oben
 * statt unten, wenn unterm Anker weniger Raum bleibt als darüber.
 *
 * Die Geometrie steckt in computePopoverPlacement (pur, testbar); der Hook
 * usePopoverPlacement schreibt die Position per Layout-Effekt vor dem Paint
 * direkt ans Element, sodass nie ein falsch positionierter Frame sichtbar wird.
 */

export interface PlacementBox {
  left: number
  top: number
  width: number
  height: number
}

export interface PopoverPlacement {
  /** Linke Kante des Popovers in Viewport-Koordinaten. */
  left: number
  /** Obere Kante des Popovers in Viewport-Koordinaten. */
  top: number
  /** Gekappte Höhe, wenn der verfügbare Raum kleiner ist als das Popover. */
  maxHeight: number | null
  /** true: öffnet über dem Anker (unten wäre weniger Platz). */
  openUp: boolean
}

/** Sicherheitsabstand zur Fensterkante und Lücke zwischen Anker und Popover. */
const EDGE_MARGIN = 8
const ANCHOR_GAP = 4

export function computePopoverPlacement(
  anchor: PlacementBox,
  popover: { width: number; height: number },
  viewport: { width: number; height: number },
  opts: { gap?: number; margin?: number } = {}
): PopoverPlacement {
  const gap = opts.gap ?? ANCHOR_GAP
  const margin = opts.margin ?? EDGE_MARGIN

  // Horizontal: linksbündig am Anker bevorzugt; passt das nicht,
  // rechtsbündig; ragt auch das hinaus, an die Kanten klemmen.
  let left = anchor.left
  if (left + popover.width > viewport.width - margin) {
    left = anchor.left + anchor.width - popover.width
  }
  left = Math.min(left, viewport.width - margin - popover.width)
  left = Math.max(margin, left)

  // Vertikal: unterm Anker bevorzugt; nach oben nur, wenn dort mehr Raum
  // ist. Reicht die gewählte Seite nicht, wird die Höhe gekappt (scrollt).
  const spaceBelow = viewport.height - margin - (anchor.top + anchor.height + gap)
  const spaceAbove = anchor.top - gap - margin
  const openUp = popover.height > spaceBelow && spaceAbove > spaceBelow
  const available = openUp ? spaceAbove : spaceBelow
  const maxHeight = popover.height > available ? Math.max(0, Math.floor(available)) : null
  const height = maxHeight ?? popover.height
  const top = openUp ? anchor.top - gap - height : anchor.top + anchor.height + gap

  return { left, top, maxHeight, openUp }
}

/**
 * Richtet das offene Popover an seinem Anker aus — dem Eltern-Element, also
 * dem Control, in dem es gerendert wird. Das Element trägt `popover="manual"`
 * und wird in den Top-Layer des Fensters gehoben: Dort nimmt es keinen Platz
 * im Scroll-Container ein (kein seitliches Mitscrollen), wird von keinem
 * Vorfahren geclippt und liegt über allem. Öffnen/Schließen steuern weiter
 * die Komponenten (Outside-Click, Esc) — der DOM-Platz bleibt unverändert,
 * `contains()`-Checks funktionieren also wie zuvor. Neu gemessen wird bei
 * Fenster-Resize, Scroll und wenn sich die Größe des Popover-Inhalts ändert.
 */
export function usePopoverPlacement(open: boolean): React.RefObject<HTMLDivElement | null> {
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) return
    const el = popoverRef.current
    const anchor = el?.parentElement
    if (!el || !anchor) return

    // Top-Layer, sofern die Popover-API da ist (Fallback: absolut im Control)
    const topLayer = typeof el.showPopover === 'function' && el.hasAttribute('popover')
    if (topLayer) {
      try {
        el.showPopover()
      } catch {
        // bereits offen — egal
      }
    }

    const measure = (): void => {
      // Vorherige Klemmung verwerfen, damit die natürliche Größe misst
      el.style.left = ''
      el.style.top = ''
      el.style.right = ''
      el.style.bottom = ''
      el.style.maxHeight = ''
      if (topLayer) {
        // UA-Styles des Popover-Elements (inset:0, margin:auto, padding) ersetzen
        el.style.position = 'fixed'
        el.style.margin = '0'
        el.style.padding = '0'
      }

      const rect = el.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const placement = computePopoverPlacement(
        {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width,
          height: anchorRect.height
        },
        { width: rect.width, height: rect.height },
        { width: window.innerWidth, height: window.innerHeight }
      )

      if (topLayer) {
        // position:fixed im Top-Layer: left/top sind direkt Viewport-Koordinaten
        el.style.left = `${placement.left}px`
        el.style.top = `${placement.top}px`
      } else {
        // Viewport → CSS-Koordinaten über die Used-Values der Messposition
        const computed = getComputedStyle(el)
        el.style.left = `${parseFloat(computed.left) + placement.left - rect.left}px`
        el.style.top = `${parseFloat(computed.top) + placement.top - rect.top}px`
      }
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      if (placement.maxHeight !== null) {
        el.style.maxHeight = `${placement.maxHeight}px`
        el.style.overflowY = 'auto'
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    window.addEventListener('resize', measure)
    // capture: fängt auch Scrollen innerer Container (Liste, Sheet)
    window.addEventListener('scroll', measure, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  return popoverRef
}
