#!/usr/bin/env node
/**
 * Move inline base64 images out of Postgres rows and into the shop-images
 * bucket, then rewrite each row to the public URL.
 *
 * Why: every catalog query (`select *` on items/customers/suppliers) carried
 * the embedded image bytes, so a single screen could download megabytes and
 * Supabase charged all of it as egress. New uploads already go to Storage; this
 * is the one-off catch-up for rows created before that change.
 *
 * Usage (from the repo root):
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run migrate:images -- --dry-run
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run migrate:images
 *
 * The service-role key bypasses RLS. Keep it in the environment for this
 * command only; never commit it or paste it into the app. VITE_SUPABASE_URL is
 * read from the environment or .env. Re-running is safe: rows already holding a
 * URL no longer match the `data:%` filter.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const BUCKET = "shop-images";
const CACHE_SECONDS = "31536000";
const PAGE_SIZE = 500;

const TARGETS = [
  { table: "items", column: "image_url", folder: "items" },
  { table: "customers", column: "avatar_url", folder: "customers" },
  { table: "suppliers", column: "avatar_url", folder: "suppliers" },
  { table: "shop_settings", column: "logo_url", folder: "logos" },
  // user_profiles has no business_id column; membership lives in business_members.
  { table: "user_profiles", column: "avatar_url", folder: "avatars", scoped: false },
];

const EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

const DATA_URL = /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.*)$/is;

function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decode(value) {
  const match = DATA_URL.exec(value);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const payload = match[2].replace(/\s+/g, "");
  if (!payload) return null;
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0) return null;
  return {
    buffer,
    mime,
    ext: EXTENSIONS[mime] || mime.split("/")[1].replace(/[^a-z0-9]/g, "") || "bin",
    approximateBytes: Math.floor((payload.length * 3) / 4),
  };
}

async function migrateTarget(supabase, target, options) {
  const { table, column, folder, scoped = true } = target;
  const columns = scoped ? `id, business_id, ${column}` : `id, ${column}`;
  const seen = new Set();
  const result = { table, column, migrated: 0, failed: 0, bytes: 0 };

  while (true) {
    if (options.limit && result.migrated + result.failed >= options.limit) break;

    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .like(column, "data:%")
      .order("id", { ascending: true })
      .range(0, PAGE_SIZE - 1);

    if (error) {
      console.error(`  ! ${table}.${column}: ${error.message}`);
      return result;
    }

    const fresh = (data || []).filter((row) => !seen.has(row.id));
    if (fresh.length === 0) break;

    for (const row of fresh) {
      if (options.limit && result.migrated + result.failed >= options.limit) break;
      seen.add(row.id);

      const decoded = decode(row[column]);
      if (!decoded) {
        result.failed += 1;
        console.warn(`  ! ${table}.${column} ${row.id}: not a readable data URL`);
        continue;
      }
      result.bytes += decoded.approximateBytes;

      if (options.dryRun) {
        result.migrated += 1;
        continue;
      }

      const objectPath = `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}.${decoded.ext}`;
      const uploaded = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, decoded.buffer, {
          cacheControl: CACHE_SECONDS,
          upsert: false,
          contentType: decoded.mime,
        });

      if (uploaded.error) {
        result.failed += 1;
        console.warn(`  ! ${table}.${column} ${row.id}: ${uploaded.error.message}`);
        continue;
      }

      const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(objectPath).data
        .publicUrl;

      const updated = await supabase
        .from(table)
        .update({ [column]: publicUrl })
        .eq("id", row.id);

      if (updated.error) {
        result.failed += 1;
        console.warn(`  ! ${table}.${column} ${row.id}: ${updated.error.message}`);
        continue;
      }

      result.migrated += 1;
    }

    if ((data || []).length < PAGE_SIZE) break;
  }

  return result;
}

async function main() {
  loadEnvFile();

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

  if (!url) {
    console.error("Missing VITE_SUPABASE_URL (or SUPABASE_URL). See .env.");
    process.exit(1);
  }
  if (!key) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Use the service-role key from\n" +
        "Supabase Dashboard → Project Settings → API. Never put it in .env."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    `Scanning ${TARGETS.length} image columns${dryRun ? " (dry run)" : ""}` +
      `${limit ? `, ${limit} rows per column` : ""}.\n`
  );

  let migrated = 0;
  let failed = 0;
  let bytes = 0;

  for (const target of TARGETS) {
    process.stdout.write(`${target.table}.${target.column} … `);
    const result = await migrateTarget(supabase, target, { dryRun, limit });
    migrated += result.migrated;
    failed += result.failed;
    bytes += result.bytes;
    console.log(
      `${result.migrated} ${dryRun ? "found" : "migrated"}` +
        `${result.failed ? `, ${result.failed} failed` : ""}, ${humanBytes(result.bytes)} of inline images`
    );
  }

  console.log(
    `\n${dryRun ? "Would migrate" : "Migrated"} ${migrated} image(s)` +
      `${failed ? `, ${failed} failed` : ""}; roughly ${humanBytes(bytes)} left the database.`
  );
  if (dryRun && migrated > 0) {
    console.log("Run again without --dry-run to upload and rewrite the rows.");
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
