import catalog from "@/lib/catalog.json";

export function GET() {
  return Response.json(catalog);
}
