import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query from React.
 *
 * Used where the same control must read differently on a narrow screen and
 * on a wide one — the settings chips drop their bracketed detail on a phone
 * because the cell is too narrow for it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const apply = () => setMatches(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [query]);

  return matches;
}

/** True below the phone breakpoint — the band where a chip is half-width. */
export function useIsCompact(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
