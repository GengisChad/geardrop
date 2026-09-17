import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { brand } from "@/data/assets";

/**
 * OG card for /negozio — the shop catalogue landing. Reuses the same design
 * as the root opengraph-image but with "Negozio" copy. Rendered once at build time.
 */

export const alt = "GEAR//DROP · Tutto il catalogo Beyblade X in Italia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function displayFont(weight: 700, style: "normal" | "italic"): Promise<ArrayBuffer | null> {
  try {
    const family = `Chakra+Petch:ital,wght@${style === "italic" ? 1 : 0},${weight}`;
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}`, { headers: { "User-Agent": "Mozilla/4.0" } })).text();
    const url = /src: url\((https:[^)]+\.ttf)\)/.exec(css)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpenGraphImage() {
  const emblem = await readFile(join(process.cwd(), "public", brand.emblemOpenGraph));
  const emblemSrc = `data:image/png;base64,${emblem.toString("base64")}`;
  const [bold, boldItalic] = await Promise.all([displayFont(700, "normal"), displayFont(700, "italic")]);
  const fonts = [
    ...(bold ? [{ name: "Chakra Petch", data: bold, weight: 700 as const, style: "normal" as const }] : []),
    ...(boldItalic ? [{ name: "Chakra Petch", data: boldItalic, weight: 700 as const, style: "italic" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 80px",
          background: "radial-gradient(circle at 76% 50%, #2e1470 0%, #110a26 38%, #07060b 70%)",
          color: "#f4f2ff",
          fontFamily: fonts.length ? "Chakra Petch" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 30, letterSpacing: 7, color: "#c6ff00", fontWeight: 700 }}>
            NEGOZIO · BEYBLADE X
          </div>
          <div style={{ display: "flex", marginTop: 18, fontSize: 96, fontWeight: 700, fontStyle: "italic", lineHeight: 1 }}>
            <span>GEAR</span>
            <span style={{ color: "#c6ff00", marginLeft: 30, marginRight: 22 }}>{"//"}</span>
            <span style={{ color: "#b07cff" }}>DROP</span>
          </div>
          <div style={{ display: "flex", marginTop: 30, fontSize: 36, lineHeight: 1.3, color: "#c9c4dc", maxWidth: 620, fontWeight: 700 }}>
            Trottole, starter, lanciatori e stadi originali Hasbro. Spedizione in Italia.
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img only */}
        <img src={emblemSrc} width={380} height={351} alt="" style={{ marginLeft: 48 }} />
      </div>
    ),
    { ...size, fonts },
  );
}
