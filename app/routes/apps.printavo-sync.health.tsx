import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    db.prepare("SELECT 1").get();
    return json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
      { status: 200 }
    );
  } catch (error: any) {
    return json(
      {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
};


