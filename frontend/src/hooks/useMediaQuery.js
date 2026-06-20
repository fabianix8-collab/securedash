import { useEffect, useState } from "react";

/**
 * Hook simple para adaptar componentes (sobre todo charts de Chart.js, que
 * no se pueden ajustar solo con CSS) segun el ancho de pantalla.
 *
 * Uso: const isMobile = useMediaQuery("(max-width: 640px)");
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
