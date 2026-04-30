import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const GET: APIRoute = async ({ site }) => {
  const entries = await getCollection("wiki");
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const parts: string[] = [
    "# GlassDesk — full content dump",
    "",
    "> Concatenated Markdown of all docs pages.",
    "> Source: https://github.com/quangyendn/glassdesk",
    "",
    "---",
    "",
  ];

  for (const e of entries) {
    const slug = e.id.replace(/\.md$/, "");
    const url = site
      ? new URL(`/docs/${slug}`, site).toString()
      : `/docs/${slug}`;
    parts.push(`## ${e.data.title}`);
    parts.push("");
    parts.push(`Source: ${url}`);
    if (e.data.updated) parts.push(`Updated: ${e.data.updated}`);
    parts.push("");
    parts.push(e.body ?? "");
    parts.push("");
    parts.push("---");
    parts.push("");
  }

  return new Response(parts.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
