import { json } from "@remix-run/node";

export const loader = async () => {
  return json({ ok: true, message: "Printavo Sync root" });
};

export default function Index() {
  return null;
}

