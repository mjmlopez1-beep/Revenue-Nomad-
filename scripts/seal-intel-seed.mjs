#!/usr/bin/env node
/**
 * Encrypt data/intel-seed.json -> data/intel-seed.enc so the private seed can ship with
 * the code without exposing member data (AES-256-GCM over gzip). Only the key is secret:
 * set it on the host as RN_INTEL_SEED_KEY. Never commit data/intel-seed.json or the key.
 *
 *   node scripts/seal-intel-seed.mjs            # reuses data/intel-seed.key, or creates one
 *   RN_INTEL_SEED_KEY=... node scripts/seal-intel-seed.mjs
 */
import { createCipheriv, randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { gzipSync } from "zlib";

const keyFile = "data/intel-seed.key";
let keyB64 = process.env.RN_INTEL_SEED_KEY || (existsSync(keyFile) ? readFileSync(keyFile, "utf8").trim() : "");
const created = !keyB64;
if (created) keyB64 = randomBytes(32).toString("base64");
const key = Buffer.from(keyB64, "base64");
if (key.length !== 32) throw new Error("RN_INTEL_SEED_KEY must be 32 bytes, base64-encoded");

const plain = gzipSync(Buffer.from(JSON.stringify(JSON.parse(readFileSync("data/intel-seed.json", "utf8")))), { level: 9 });
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const body = Buffer.concat([cipher.update(plain), cipher.final()]);
writeFileSync("data/intel-seed.enc", Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64"));
if (created) writeFileSync(keyFile, keyB64 + "\n", { mode: 0o600 });
console.log(`sealed data/intel-seed.enc (${body.length} bytes)${created ? `; new key saved to ${keyFile}` : ""}`);
