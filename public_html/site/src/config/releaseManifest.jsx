import { useEffect, useState } from "react";

/** Public release manifest (GitHub — updated by erp-app npm run release). */
export const VERSION_JSON_URL =
  "https://raw.githubusercontent.com/imrasidh/TechonERP-releases/main/version.json";

export const FALLBACK_DOWNLOAD_URL =
  "https://github.com/imrasidh/TechonERP-releases/releases/latest/download/TechonERP-latest.zip";

let cachedUrl = null;
let inflight = null;

export function fetchDownloadUrl() {
  if (cachedUrl) return Promise.resolve(cachedUrl);
  if (inflight) return inflight;
  inflight = fetch(VERSION_JSON_URL + "?t=" + Date.now(), { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      cachedUrl = data.url || data.download || FALLBACK_DOWNLOAD_URL;
      return cachedUrl;
    })
    .catch(function () {
      cachedUrl = FALLBACK_DOWNLOAD_URL;
      return cachedUrl;
    })
    .finally(function () {
      inflight = null;
    });
  return inflight;
}

/** Hook: resolves GitHub install URL from version.json. */
export function useDownloadUrl() {
  const [url, setUrl] = useState(FALLBACK_DOWNLOAD_URL);
  useEffect(function () {
    var cancelled = false;
    fetchDownloadUrl().then(function (u) {
      if (!cancelled) setUrl(u);
    });
    return function () {
      cancelled = true;
    };
  }, []);
  return url;
}

/** Drop-in download anchor that always points at the latest release. */
export function DownloadLink({ className, style, children, ...rest }) {
  const href = useDownloadUrl();
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} style={style} {...rest}>
      {children}
    </a>
  );
}
