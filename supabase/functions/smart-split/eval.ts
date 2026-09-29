// Live evaluation of the deployed smart-split function against the real model.
// Signs in as the dev test users and runs every example from the Smart Split spec.
//
//   deno run --allow-net --allow-read --allow-env supabase/functions/smart-split/eval.ts
//
// Requires: OPENROUTER_API_KEY set as a Supabase secret and SMART_SPLIT_PROVIDER unset (not "mock").
// Uses the "UI Test" group (dev users Alice + Bob). Nothing is saved; only `interpret` is called.
// Each case counts toward dev Alice's 30-calls-per-hour Smart Split quota.

const root = new URL("../../../", import.meta.url);
const secrets = await Deno.readTextFile(new URL("Config/Secrets.xcconfig", root));
const key = secrets.match(/SUPABASE_PUBLISHABLE_KEY = (\S+)/)![1];
const host = secrets.match(/SUPABASE_HOST = (\S+)/)![1];
const url = `https://${host}`;

async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const response = await fetch(url + path, { ...init, headers });
  return { status: response.status, body: await response.json() };
}

const login = await call("/auth/v1/token?grant_type=password", {
  method: "POST",
  body: JSON.stringify({ email: "dev-alice@spliteasy.dev", password: "spliteasy-dev-alice" }),
});
const token: string = login.body.access_token;
const aliceId: string = login.body.user.id;
const groups = await call("/rest/v1/groups?select=id&name=eq.UI%20Test", { token });
const groupId: string = groups.body[0].id;
const memberRows = await call(
  `/rest/v1/group_members?select=profile:profiles(id,display_name)&group_id=eq.${groupId}`,
  { token },
);
// deno-lint-ignore no-explicit-any
const names = new Map<string, string>(memberRows.body.map((r: any) => [r.profile.id, r.profile.display_name]));
const bobId = [...names.entries()].find(([, n]) => n === "Bob")![0];
const everyone = [aliceId, bobId].sort();

interface Expectation {
  items?: Record<string, { cents?: number | null; people?: string[] | "none" }>;
  taxCents?: number | null;
  tipCents?: number | null;
  paidBy?: string;
  total?: number;
}

const cases: { name: string; text: string; image?: string; expect: Expectation }[] = [
  {
    name: "restaurant shorthand",
    text: "Alice burger 18\nBob pasta 20\nwings 15 shared by everyone\ntax 5\ntip 10",
    expect: {
      items: { burger: { cents: 1800, people: [aliceId] }, pasta: { cents: 2000, people: [bobId] }, wings: { cents: 1500, people: everyone } },
      taxCents: 500, tipCents: 1000, total: 6800,
    },
  },
  {
    name: "grocery",
    text: "Alice got protein bars $12 and chicken $14\nBob got cereal $6\neggs $7 and toilet paper $16 are shared by everyone\ntax $3",
    expect: {
      items: {
        protein: { cents: 1200, people: [aliceId] }, chicken: { cents: 1400, people: [aliceId] },
        cereal: { cents: 600, people: [bobId] }, egg: { cents: 700, people: everyone }, toilet: { cents: 1600, people: everyone },
      },
      taxCents: 300, tipCents: null, total: 5800,
    },
  },
  {
    name: "gift shop with quantity",
    text: "I got the Seattle mug $18\nBob got the hoodie $42\nwe shared the $8 postcard pack\nBob got two keychains for $12 total",
    expect: {
      items: {
        mug: { cents: 1800, people: [aliceId] }, hoodie: { cents: 4200, people: [bobId] },
        postcard: { cents: 800, people: everyone }, keychain: { cents: 1200, people: [bobId] },
      },
      total: 8000,
    },
  },
  {
    name: "casual, current user as I",
    text: "I got the shampoo and protein bars.\nBob got the cereal.\nThe toilet paper and eggs are for everyone.\nTotal tax was 7.43.",
    expect: {
      items: {
        shampoo: { cents: null, people: [aliceId] }, protein: { cents: null, people: [aliceId] },
        cereal: { cents: null, people: [bobId] }, toilet: { cents: null, people: everyone }, egg: { cents: null, people: everyone },
      },
      taxCents: 743,
    },
  },
  {
    name: "never invent prices",
    text: "Alice got shampoo\nBob got snacks\ntoilet paper shared",
    expect: {
      items: { shampoo: { cents: null, people: [aliceId] }, snack: { cents: null, people: [bobId] }, toilet: { cents: null, people: everyone } },
      tipCents: null,
    },
  },
  {
    name: "payer vs owner",
    text: "Bob paid for all of this\nbut the hoodie $40 is Bob's\nthe mug $12 is mine\nsnacks $9 are shared",
    expect: {
      paidBy: bobId,
      items: { hoodie: { cents: 4000, people: [bobId] }, mug: { cents: 1200, people: [aliceId] }, snack: { cents: 900, people: everyone } },
    },
  },
  {
    name: "unknown person is not guessed",
    text: "Zed got the burger 15\nfries 5 all",
    expect: { items: { burger: { cents: 1500, people: "none" }, fries: { cents: 500, people: everyone } } },
  },
];

// Receipt + instructions, using the sample image if present.
try {
  const png = await Deno.readFile(new URL("supabase/functions/smart-split/eval-receipt.png", root));
  let binary = "";
  png.forEach((b) => (binary += String.fromCharCode(b)));
  cases.push({
    name: "receipt + instructions",
    text: "shirt Bob\nmug + magnet me\nsnacks everyone",
    image: `data:image/png;base64,${btoa(binary)}`,
    expect: {
      items: {
        shirt: { cents: 2499, people: [bobId] }, mug: { cents: 1499, people: [aliceId] },
        magnet: { cents: 699, people: [aliceId] }, snack: { cents: 1150, people: everyone },
      },
      taxCents: 512, total: 6359,
    },
  });
} catch {
  console.log("(no eval-receipt.png; skipping the image case)");
}

let failures = 0;
for (const testCase of cases) {
  const started = performance.now();
  const { status, body } = await call("/functions/v1/smart-split", {
    method: "POST",
    token,
    body: JSON.stringify({ action: "interpret", groupId, text: testCase.text, imageDataUrl: testCase.image ?? null }),
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const problems: string[] = [];
  if (status !== 200) {
    problems.push(`HTTP ${status}: ${JSON.stringify(body)}`);
  } else {
    if (body.provider === "mock") problems.push("provider is still the mock; unset SMART_SPLIT_PROVIDER");
    const { draft, calculation } = body;
    for (const [fragment, want] of Object.entries(testCase.expect.items ?? {})) {
      // deno-lint-ignore no-explicit-any
      const item = draft.items.find((i: any) => i.name.toLowerCase().includes(fragment));
      if (!item) {
        problems.push(`missing item "${fragment}"`);
        continue;
      }
      if (want.cents !== undefined && item.totalPriceCents !== want.cents) {
        problems.push(`${item.name}: price ${item.totalPriceCents} ≠ ${want.cents}`);
      }
      const people = [...item.assignedParticipantIds].sort();
      if (want.people === "none" && people.length > 0) problems.push(`${item.name}: should be unassigned`);
      if (Array.isArray(want.people) && JSON.stringify(people) !== JSON.stringify([...want.people].sort())) {
        problems.push(`${item.name}: people ${people.map((p: string) => names.get(p))} ≠ ${want.people.map((p) => names.get(p))}`);
      }
    }
    if (testCase.expect.taxCents !== undefined && (draft.taxCents ?? 0) !== (testCase.expect.taxCents ?? 0)) {
      problems.push(`tax ${draft.taxCents} ≠ ${testCase.expect.taxCents}`);
    }
    // "No tip" may come back as null or 0; both mean the same thing.
    if (testCase.expect.tipCents !== undefined && (draft.tipCents ?? 0) !== (testCase.expect.tipCents ?? 0)) {
      problems.push(`tip ${draft.tipCents} ≠ ${testCase.expect.tipCents}`);
    }
    if (testCase.expect.paidBy && draft.paidByParticipantId !== testCase.expect.paidBy) {
      problems.push(`paidBy ${names.get(draft.paidByParticipantId)} ≠ ${names.get(testCase.expect.paidBy)}`);
    }
    if (testCase.expect.total !== undefined && calculation.computedTotalCents !== testCase.expect.total) {
      problems.push(`total ${calculation.computedTotalCents} ≠ ${testCase.expect.total}`);
    }
  }
  failures += problems.length ? 1 : 0;
  console.log(`${problems.length ? "✗" : "✓"} ${testCase.name} (${seconds}s)`);
  problems.forEach((p) => console.log(`    - ${p}`));
}
console.log(`\n${cases.length - failures}/${cases.length} cases passed`);
if (failures) Deno.exit(1);
