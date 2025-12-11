import { db } from "~/db.server";
import { Session } from "@shopify/shopify-api";

export async function storeSession(session: Session): Promise<void> {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (
      id, shop, state, is_online, scope, expires, access_token, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    session.id,
    session.shop,
    session.state || "",
    session.isOnline ? 1 : 0,
    session.scope || "",
    session.expires?.toISOString() || null,
    session.accessToken || "",
    session.onlineAccessInfo?.associated_user?.id?.toString() || null
  );
}

export async function loadSession(id: string): Promise<Session | undefined> {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;

  if (!row) return undefined;

  return {
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.is_online === 1,
    scope: row.scope,
    expires: row.expires ? new Date(row.expires) : undefined,
    accessToken: row.access_token,
    onlineAccessInfo: row.user_id
      ? {
          associated_user: {
            id: parseInt(row.user_id),
          },
        }
      : undefined,
  } as Session;
}

export async function deleteSession(id: string): Promise<void> {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export async function deleteSessionsByShop(shop: string): Promise<void> {
  db.prepare("DELETE FROM sessions WHERE shop = ?").run(shop);
}

