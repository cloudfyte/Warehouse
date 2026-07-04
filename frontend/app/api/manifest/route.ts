import { NextResponse } from "next/server";

const API = process.env.NEXT_PUBLIC_GRAPHQL_URL || "http://localhost:8000/graphql/";

export async function GET() {
  let appName = "GarmentFlow ERP";
  let shortName = "GarmentFlow";
  let themeColor = "#6366f1";

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ systemSettings { appName primaryColor } }" }),
      next: { revalidate: 60 },
    });
    const json = await res.json();
    const s = json?.data?.systemSettings;
    if (s?.appName) {
      appName = s.appName;
      shortName = s.appName.split(" ")[0];
    }
    if (s?.primaryColor) themeColor = s.primaryColor;
  } catch {
    // use defaults
  }

  return NextResponse.json(
    {
      name: appName,
      short_name: shortName,
      description: "Garment warehouse & production management",
      start_url: "/",
      display: "standalone",
      orientation: "portrait-primary",
      background_color: "#ffffff",
      theme_color: themeColor,
      categories: ["business", "productivity"],
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } }
  );
}
