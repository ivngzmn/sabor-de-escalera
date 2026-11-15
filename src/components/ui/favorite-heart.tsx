import { useEffect, useRef, useState } from "react"
import { HeartFilledIcon, HeartIcon } from "@radix-ui/react-icons"

const sparks = [0, 60, 120, 180, 240, 300]

// Beats when `active` turns on after mount, like a pulse: swell, settle, swell again, with outlines
// ringing outward and a few sparks. Turning off just settles; the first render never animates.
function FavoriteHeart({ active, className }: { active: boolean; className?: string }) {
  const [beat, setBeat] = useState(0)
  const previous = useRef(active)
  useEffect(() => {
    if (active && !previous.current) setBeat((n) => n + 1)
    previous.current = active
  }, [active])
  return (
    <span data-slot="favorite-heart" data-active={active ? "" : undefined} className={className} aria-hidden="true">
      <HeartIcon data-part="outline" />
      <HeartFilledIcon data-part="fill" key={beat} data-beating={beat > 0 ? "" : undefined} />
      {beat > 0 && active && (
        <span data-part="burst" key={`burst-${beat}`}>
          <HeartIcon data-part="ring" />
          <HeartIcon data-part="ring" data-late="" />
          {sparks.map((angle) => (
            <i key={angle} data-part="spark" style={{ "--angle": `${angle}deg` } as React.CSSProperties} />
          ))}
        </span>
      )}
    </span>
  )
}

export { FavoriteHeart }
