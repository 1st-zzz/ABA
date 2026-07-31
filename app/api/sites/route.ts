const siteOptions = [
  { id: 1286, code: "US", label: "美国站" },
  { id: 1287, code: "CA", label: "加拿大站" },
  { id: 1288, code: "MX", label: "墨西哥站" },
  { id: 1290, code: "GB", label: "英国站" },
  { id: 1289, code: "DE", label: "德国站" },
  { id: 1292, code: "IT", label: "意大利站" },
  { id: 1293, code: "ES", label: "西班牙站" },
  { id: 1294, code: "TR", label: "土耳其站" },
  { id: 1295, code: "SE", label: "瑞典站" },
];

export function GET() {
  return Response.json({ sites: siteOptions });
}
