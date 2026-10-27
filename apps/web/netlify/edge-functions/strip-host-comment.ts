// Netlify inserts a promotional HTML comment into <head> on every page it serves.
// React hydrates <head> too, finds a node it did not render, and throws error 418,
// re-rendering the whole page on the client. This takes that one comment back out.
const COMMENT = /\n?<!-- This site is hosted on Netlify[\s\S]*?-->/;

export default async (_req: Request, context: { next: () => Promise<Response> }) => {
  const res = await context.next();
  if (!res.headers.get("content-type")?.includes("text/html")) return res;
  const html = await res.text();
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(html.replace(COMMENT, ""), { status: res.status, statusText: res.statusText, headers });
};

export const config = { path: "/*", excludedPath: ["/_next/*", "/api/*", "/*.png", "/*.svg", "/*.json", "/*.txt", "/*.xml"] };
