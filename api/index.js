// server/vercel-entry.ts
import { handle } from "hono/vercel";

// server/app.ts
import { Hono } from "hono";

// src/lib/contentDefaults.ts
var CONTENT_DEFAULTS = {
  "home.headline": "Heart rate from a face video, in your browser",
  "home.lead": "MotionPulse estimates pulse from ordinary camera footage and flags when motion may affect the number. For learning and research \u2014 not a medical device.",
  "home.how.title": "How a session works",
  "home.how.step1.heading": "1. Add a face clip",
  "home.how.step1.body": "Open the scan page, then use your webcam, upload a short video, or run the built-in sample. Video stays on this device.",
  "home.how.step2.heading": "2. Track the face",
  "home.how.step2.body": "The app finds your face and samples color from forehead and cheek regions while you scrub the timeline.",
  "home.how.step3.heading": "3. Read the vitals",
  "home.how.step3.body": "Heart rate updates as frames arrive. Signal trust shows when motion may have affected the estimate.",
  "home.vitals.title": "What this camera reports",
  "home.vitals.note": "Blood oxygen and blood pressure are not measured here.",
  "home.demo.title": "Demo and Local lab",
  "footer.line": "Educational remote-PPG demo \u2014 not a medical device.",
  "scan.disclaimer": "Educational scan demo \u2014 not a medical device.",
  "scan.save_metrics": "on",
  "scan.offer_video_optin": "off",
  "site.maintenance_note": "",
  "nav.scan": "Scan",
  "nav.how": "How it works",
  "nav.demo": "Demo",
  "nav.lab": "Local lab",
  "nav.signin": "Sign in",
  "cta.scan": "Scan yourself",
  "cta.sample": "Try sample"
};

// server/auth.ts
import crypto from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

// server/db.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
var globalForPrisma = globalThis;
var prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// server/auth.ts
var SESSION_COOKIE = "mp_session";
var SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
function authSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (need 16+ chars)");
  }
  return s;
}
function signValue(value) {
  return crypto.createHmac("sha256", authSecret()).update(value).digest("hex");
}
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function readSessionToken(c) {
  const raw = getCookie(c, SESSION_COOKIE);
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const token = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(signValue(token), "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return token;
}
async function createAuthSession(c, accountId) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.authSession.create({
    data: {
      tokenHash: hashToken(token),
      accountId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    }
  });
  setCookie(c, SESSION_COOKIE, `${token}.${signValue(token)}`, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.req.url.startsWith("https:"),
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1e3)
  });
}
async function destroyAuthSession(c) {
  const token = readSessionToken(c);
  if (token) {
    await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}
async function currentAccount(c) {
  const token = readSessionToken(c);
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true }
  });
  if (!session || session.expiresAt < /* @__PURE__ */ new Date()) return null;
  if (session.account.status !== "active") return null;
  const { id, email, name, role } = session.account;
  return { id, email, name, role };
}

// server/password.ts
import crypto2 from "node:crypto";
var SCRYPT_N = 16384;
var SCRYPT_R = 8;
var SCRYPT_P = 1;
var KEY_LEN = 64;
var SALT_LEN = 16;
function hashPassword(password) {
  const salt = crypto2.randomBytes(SALT_LEN);
  const key = crypto2.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return [
    "scrypt",
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString("hex"),
    key.toString("hex")
  ].join("$");
}
function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltHex, keyHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  let actual;
  try {
    actual = crypto2.scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p)
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && crypto2.timingSafeEqual(actual, expected);
}
function randomPassword(length = 14) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto2.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

// server/app.ts
var app = new Hono();
var SESSION_SOURCES = /* @__PURE__ */ new Set(["sample", "upload", "webcam", "local-lab"]);
var GT_SOURCES = /* @__PURE__ */ new Set(["self-count", "dataset", "device"]);
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function int(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}
function str(v, max) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}
function numList(v, max) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "number" && Number.isFinite(x)).slice(0, max);
}
function clipData(raw, index) {
  const input = raw ?? {};
  const thumb = str(input.thumb, 12e4);
  return {
    index,
    durationSec: num(input.durationSec),
    fps: num(input.fps),
    width: int(input.width),
    height: int(input.height),
    settledHeartRate: num(input.settledHeartRate),
    rawBpm: num(input.rawBpm),
    respiratoryRate: num(input.respiratoryRate),
    signalLabel: str(input.signalLabel, 80),
    risk: str(input.risk, 40),
    regionWeights: numList(input.regionWeights, 4),
    waveform: numList(input.waveform, 400),
    thumb: thumb && thumb.startsWith("data:image") ? thumb : null
  };
}
async function contentMap() {
  const rows = await prisma.content.findMany();
  const map = { ...CONTENT_DEFAULTS };
  for (const row of rows) map[row.key] = row.text;
  return map;
}
function csvCell(v) {
  if (v === null || v === void 0) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function readJson(c) {
  try {
    const body = await c.req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body;
    }
  } catch {
  }
  return null;
}
app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/content", async (c) => {
  return c.json({ content: await contentMap() });
});
app.post("/api/auth/signup", async (c) => {
  const body = await readJson(c);
  const email = str(body?.email, 200)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  const name = str(body?.name, 120);
  const ageBand = str(body?.ageBand, 40);
  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: "A valid email is required." }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password needs at least 8 characters." }, 400);
  }
  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) return c.json({ error: "That email already has an account." }, 409);
  const account = await prisma.account.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      role: "subject",
      profile: {
        create: { ageBand, consentMetricsAt: /* @__PURE__ */ new Date() }
      }
    }
  });
  await createAuthSession(c, account.id);
  return c.json({
    account: { id: account.id, email: account.email, name: account.name, role: account.role }
  });
});
app.post("/api/auth/signin", async (c) => {
  const body = await readJson(c);
  const email = str(body?.email, 200)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return c.json({ error: "Email and password required." }, 400);
  const account = await prisma.account.findUnique({ where: { email } });
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return c.json({ error: "Wrong email or password." }, 401);
  }
  if (account.status !== "active") {
    return c.json({ error: "This account is disabled." }, 403);
  }
  await createAuthSession(c, account.id);
  return c.json({
    account: { id: account.id, email: account.email, name: account.name, role: account.role }
  });
});
app.post("/api/auth/signout", async (c) => {
  await destroyAuthSession(c);
  return c.json({ ok: true });
});
app.get("/api/auth/me", async (c) => {
  const account = await currentAccount(c);
  return c.json({ account });
});
app.post("/api/sessions", async (c) => {
  const map = await contentMap();
  if (map["scan.save_metrics"] !== "on") {
    return c.json({ saved: false, reason: "save_switch_off" });
  }
  const body = await readJson(c);
  if (!body) return c.json({ error: "JSON body required." }, 400);
  const source = str(body.source, 40);
  if (!source || !SESSION_SOURCES.has(source)) {
    return c.json({ error: "Unknown source." }, 400);
  }
  const account = await currentAccount(c);
  const clips = Array.isArray(body.clips) ? body.clips.slice(0, 10) : [];
  const session = await prisma.scanSession.create({
    data: {
      source,
      nickname: str(body.nickname, 80),
      pipelineVersion: str(body.pipelineVersion, 40),
      userId: account?.id ?? null,
      clips: { create: clips.map((clip, i) => clipData(clip, i)) }
    },
    select: { id: true }
  });
  return c.json({ saved: true, id: session.id });
});
app.post("/api/sessions/:id/clips", async (c) => {
  const map = await contentMap();
  if (map["scan.save_metrics"] !== "on") {
    return c.json({ saved: false, reason: "save_switch_off" });
  }
  const session = await prisma.scanSession.findUnique({
    where: { id: c.req.param("id") },
    select: { id: true, _count: { select: { clips: true } } }
  });
  if (!session) return c.json({ error: "Session not found." }, 404);
  if (session._count.clips >= 10) return c.json({ error: "Session is full." }, 400);
  const body = await readJson(c);
  const clip = await prisma.clip.create({
    data: { sessionId: session.id, ...clipData(body, session._count.clips) },
    select: { id: true }
  });
  return c.json({ saved: true, id: clip.id });
});
app.get("/api/me/sessions", async (c) => {
  const account = await currentAccount(c);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  const sessions = await prisma.scanSession.findMany({
    where: { userId: account.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      clips: {
        orderBy: { index: "asc" },
        select: {
          id: true,
          index: true,
          durationSec: true,
          settledHeartRate: true,
          respiratoryRate: true,
          signalLabel: true,
          risk: true
        }
      }
    }
  });
  return c.json({ sessions });
});
app.use("/api/admin/*", async (c, next) => {
  const account = await currentAccount(c);
  if (!account) return c.json({ error: "sign_in_required" }, 401);
  if (account.role !== "admin") return c.json({ error: "admin_only" }, 403);
  c.set("account", account);
  await next();
});
app.get("/api/admin/overview", async (c) => {
  const [accounts, sessions, clips, subjects] = await Promise.all([
    prisma.account.count(),
    prisma.scanSession.count(),
    prisma.clip.count(),
    prisma.account.count({ where: { role: "subject" } })
  ]);
  return c.json({ accounts, subjects, sessions, clips });
});
app.get("/api/admin/content", async (c) => {
  const rows = await prisma.content.findMany({ orderBy: { key: "asc" } });
  return c.json({ defaults: CONTENT_DEFAULTS, rows });
});
app.put("/api/admin/content", async (c) => {
  const account = c.get("account");
  const body = await readJson(c);
  const updates = body?.updates;
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    return c.json({ error: "Expected { updates: { key: text } }." }, 400);
  }
  let changed = 0;
  for (const [key, value] of Object.entries(updates)) {
    if (!(key in CONTENT_DEFAULTS) || typeof value !== "string") continue;
    await prisma.content.upsert({
      where: { key },
      update: { text: value, updatedBy: account.email },
      create: { key, text: value, updatedBy: account.email }
    });
    changed += 1;
  }
  return c.json({ ok: true, changed });
});
app.get("/api/admin/users", async (c) => {
  const users = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      profile: {
        select: {
          ageBand: true,
          note: true,
          consentMetricsAt: true,
          consentVideo: true
        }
      },
      _count: { select: { scanSessions: true } }
    }
  });
  return c.json({ users });
});
app.post("/api/admin/users", async (c) => {
  const body = await readJson(c);
  const email = str(body?.email, 200)?.toLowerCase();
  const role = body?.role === "admin" ? "admin" : "subject";
  const name = str(body?.name, 120);
  if (!email || !EMAIL_RE.test(email)) {
    return c.json({ error: "A valid email is required." }, 400);
  }
  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) return c.json({ error: "That email already has an account." }, 409);
  const password = typeof body?.password === "string" && body.password.length >= 8 ? body.password : randomPassword(14);
  const account = await prisma.account.create({
    data: {
      email,
      name,
      role,
      passwordHash: hashPassword(password),
      profile: role === "subject" ? { create: {} } : void 0
    }
  });
  return c.json({
    account: { id: account.id, email: account.email, role: account.role },
    generatedPassword: password
  });
});
app.patch("/api/admin/users/:id", async (c) => {
  const me = c.get("account");
  const id = c.req.param("id");
  const body = await readJson(c);
  const status = body?.status;
  if (status !== "active" && status !== "disabled") {
    return c.json({ error: "status must be active or disabled." }, 400);
  }
  if (id === me.id && status === "disabled") {
    return c.json({ error: "You cannot disable your own account." }, 400);
  }
  const user = await prisma.account.update({ where: { id }, data: { status } });
  if (status === "disabled") {
    await prisma.authSession.deleteMany({ where: { accountId: id } });
  }
  return c.json({ account: { id: user.id, status: user.status } });
});
app.delete("/api/admin/users/:id", async (c) => {
  const me = c.get("account");
  const id = c.req.param("id");
  if (id === me.id) return c.json({ error: "You cannot delete your own account." }, 400);
  const user = await prisma.account.findUnique({ where: { id } });
  if (!user) return c.json({ error: "User not found." }, 404);
  if (user.role === "admin") {
    return c.json({ error: "Admin accounts cannot be deleted here." }, 400);
  }
  await prisma.account.delete({ where: { id } });
  return c.json({ ok: true });
});
function sessionFilters(c) {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const userId = c.req.query("userId");
  const createdAt = {};
  if (from && !Number.isNaN(Date.parse(from))) createdAt.gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) {
    const end = new Date(to);
    end.setDate(end.getDate() + 1);
    createdAt.lte = end;
  }
  return {
    ...Object.keys(createdAt).length ? { createdAt } : {},
    ...userId ? { userId } : {}
  };
}
app.get("/api/admin/sessions", async (c) => {
  const sessions = await prisma.scanSession.findMany({
    where: sessionFilters(c),
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      user: { select: { email: true } },
      _count: { select: { clips: true } },
      clips: {
        orderBy: { index: "asc" },
        select: { settledHeartRate: true, risk: true }
      }
    }
  });
  return c.json({
    sessions: sessions.map(({ clips, ...s }) => ({
      ...s,
      heartRates: clips.map((cl) => cl.settledHeartRate).filter((v) => v !== null),
      risks: clips.map((cl) => cl.risk).filter((v) => v !== null)
    }))
  });
});
app.get("/api/admin/sessions/:id", async (c) => {
  const session = await prisma.scanSession.findUnique({
    where: { id: c.req.param("id") },
    include: {
      user: { select: { id: true, email: true, name: true } },
      clips: { orderBy: { index: "asc" }, include: { groundTruth: true } }
    }
  });
  if (!session) return c.json({ error: "Session not found." }, 404);
  return c.json({ session });
});
app.delete("/api/admin/sessions/:id", async (c) => {
  await prisma.scanSession.delete({ where: { id: c.req.param("id") } });
  return c.json({ ok: true });
});
app.put("/api/admin/clips/:id/ground-truth", async (c) => {
  const clipId = c.req.param("id");
  const body = await readJson(c);
  const heartRate = num(body?.heartRate);
  const source = str(body?.source, 40);
  if (heartRate === null || heartRate < 20 || heartRate > 260) {
    return c.json({ error: "heartRate must be a number between 20 and 260." }, 400);
  }
  if (!source || !GT_SOURCES.has(source)) {
    return c.json({ error: "source must be self-count, dataset, or device." }, 400);
  }
  const data = {
    heartRate,
    source,
    datasetName: str(body?.datasetName, 120),
    datasetSubjectId: str(body?.datasetSubjectId, 120)
  };
  const gt = await prisma.groundTruth.upsert({
    where: { clipId },
    update: data,
    create: { clipId, ...data }
  });
  return c.json({ groundTruth: gt });
});
app.delete("/api/admin/clips/:id/ground-truth", async (c) => {
  await prisma.groundTruth.deleteMany({ where: { clipId: c.req.param("id") } });
  return c.json({ ok: true });
});
app.get("/api/admin/export/clips.csv", async (c) => {
  const sessions = await prisma.scanSession.findMany({
    where: sessionFilters(c),
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { email: true } },
      clips: { orderBy: { index: "asc" }, include: { groundTruth: true } }
    }
  });
  const header = [
    "session_id",
    "session_created_at",
    "source",
    "nickname",
    "user_email",
    "clip_id",
    "clip_index",
    "duration_sec",
    "fps",
    "width",
    "height",
    "settled_heart_rate",
    "raw_bpm",
    "respiratory_rate_experimental",
    "signal_label",
    "risk",
    "weight_forehead",
    "weight_left_cheek",
    "weight_right_cheek",
    "weight_lower_face",
    "gt_heart_rate",
    "gt_source",
    "gt_dataset_name",
    "gt_dataset_subject_id"
  ];
  const lines = [header.join(",")];
  for (const s of sessions) {
    for (const clip of s.clips) {
      const w = clip.regionWeights;
      lines.push(
        [
          s.id,
          s.createdAt.toISOString(),
          s.source,
          s.nickname,
          s.user?.email ?? "",
          clip.id,
          clip.index,
          clip.durationSec?.toFixed(2) ?? "",
          clip.fps?.toFixed(2) ?? "",
          clip.width,
          clip.height,
          clip.settledHeartRate?.toFixed(2) ?? "",
          clip.rawBpm?.toFixed(2) ?? "",
          clip.respiratoryRate?.toFixed(2) ?? "",
          clip.signalLabel,
          clip.risk,
          w[0]?.toFixed(4) ?? "",
          w[1]?.toFixed(4) ?? "",
          w[2]?.toFixed(4) ?? "",
          w[3]?.toFixed(4) ?? "",
          clip.groundTruth?.heartRate ?? "",
          clip.groundTruth?.source ?? "",
          clip.groundTruth?.datasetName ?? "",
          clip.groundTruth?.datasetSubjectId ?? ""
        ].map(csvCell).join(",")
      );
    }
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="motionpulse-clips.csv"'
    }
  });
});
app.get("/api/admin/export/users/:id", async (c) => {
  const id = c.req.param("id").replace(/\.json$/, "");
  const user = await prisma.account.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      profile: true,
      scanSessions: {
        orderBy: { createdAt: "asc" },
        include: {
          clips: { orderBy: { index: "asc" }, include: { groundTruth: true } }
        }
      }
    }
  });
  if (!user) return c.json({ error: "User not found." }, 404);
  return new Response(JSON.stringify(user, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="motionpulse-user-${user.id}.json"`
    }
  });
});

// server/vercel-entry.ts
var handler = handle(app);
var GET = handler;
var HEAD = handler;
var POST = handler;
var PUT = handler;
var PATCH = handler;
var DELETE = handler;
var OPTIONS = handler;
export {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT
};
