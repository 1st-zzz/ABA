const siteOptions = [
  { id: 1286, code: "US", label: "美国站" },
  { id: 1290, code: "GB", label: "英国站" },
  { id: 1289, code: "DE", label: "德国站" },
];

export function GET() {
  return Response.json({ sites: siteOptions });
}
