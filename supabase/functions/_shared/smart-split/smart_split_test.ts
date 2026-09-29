import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { allocateProportionally, calculate } from "./calculator.ts";
import { hasBlockingIssues, validate } from "./validate.ts";
import { draftSchema, MODEL_OUTPUT_JSON_SCHEMA, ModelOutputError, sanitizeModelOutput } from "./schema.ts";
import { DEFAULT_SMART_SPLIT_MODEL, MockProvider, OpenRouterProvider, ProviderError, providerFromEnv } from "./provider.ts";
import type { Participant, SmartSplitDraft, SmartSplitItem } from "./types.ts";

// ---------------------------------------------------------------------------------------------
// Helpers

interface FixtureItem {
  id: string;
  totalPriceCents: number | null;
  discountCents?: number;
  assigned: string[];
}

interface Fixture {
  name: string;
  participants: string[];
  items: FixtureItem[];
  charges: Partial<Pick<SmartSplitDraft, "taxCents" | "tipCents" | "feeCents" | "shippingCents" | "discountCents">>;
  expected: { shares: Record<string, number>; subtotal: number; total: number; excluded: string[] };
}

function item(partial: Partial<SmartSplitItem> & { id: string }): SmartSplitItem {
  return {
    name: partial.id,
    quantity: 1,
    unitPriceCents: partial.totalPriceCents ?? null,
    totalPriceCents: null,
    discountCents: null,
    assignedParticipantIds: [],
    splitType: "equal",
    weights: null,
    source: "text",
    confidence: 0.95,
    needsPrice: false,
    needsAssignment: false,
    ...partial,
  };
}

function draft(partial: Partial<SmartSplitDraft> = {}): SmartSplitDraft {
  return {
    merchant: null,
    currency: "USD",
    paidByParticipantId: null,
    items: [],
    subtotalCents: null,
    taxCents: null,
    tipCents: null,
    feeCents: null,
    shippingCents: null,
    discountCents: null,
    totalCents: null,
    ambiguities: [],
    missingInformation: [],
    confidence: 0.95,
    ...partial,
  };
}

function fixtureDraft(fixture: Fixture): SmartSplitDraft {
  return draft({
    items: fixture.items.map((i) =>
      item({
        id: i.id,
        totalPriceCents: i.totalPriceCents,
        discountCents: i.discountCents ?? null,
        assignedParticipantIds: i.assigned,
      })
    ),
    ...fixture.charges,
  });
}

const fixtures: Fixture[] = JSON.parse(
  await Deno.readTextFile(new URL("./fixtures/calculator.json", import.meta.url)),
);

const people: Participant[] = [
  { id: "kai", displayName: "Kai" },
  { id: "john", displayName: "John" },
  { id: "shelly", displayName: "Shelly" },
];

// ---------------------------------------------------------------------------------------------
// Calculator

for (const fixture of fixtures) {
  Deno.test(`calculator fixture: ${fixture.name}`, () => {
    const result = calculate(fixtureDraft(fixture), fixture.participants);
    const shares = Object.fromEntries(result.perParticipant.map((p) => [p.participantId, p.totalCents]));
    assertEquals(shares, fixture.expected.shares);
    assertEquals(result.computedSubtotalCents, fixture.expected.subtotal);
    assertEquals(result.computedTotalCents, fixture.expected.total);
    assertEquals(result.excludedItemIds, fixture.expected.excluded);
    const sum = result.perParticipant.reduce((s, p) => s + p.totalCents, 0);
    assertEquals(sum, result.computedTotalCents, "shares must add up to the total");
  });
}

Deno.test("allocateProportionally always reconciles exactly", () => {
  const order = ["a", "b", "c", "d"];
  for (let amount = 0; amount < 500; amount += 7) {
    const weights = new Map([["a", 333], ["b", 1], ["c", 0], ["d", 12345]]);
    const parts = allocateProportionally(amount, weights, order);
    const sum = [...parts.values()].reduce((a, b) => a + b, 0);
    assertEquals(sum, amount);
    assertEquals(parts.get("c"), undefined, "zero-weight people get nothing");
  }
});

Deno.test("calculator handles large amounts without float error", () => {
  const big = draft({
    items: [item({ id: "x", totalPriceCents: 999_999_999, assignedParticipantIds: ["kai", "john", "shelly"] })],
    taxCents: 87_654_321,
  });
  const result = calculate(big, ["kai", "john", "shelly"]);
  assertEquals(result.perParticipant.reduce((s, p) => s + p.totalCents, 0), 999_999_999 + 87_654_321);
});

// ---------------------------------------------------------------------------------------------
// Validation

Deno.test("validation blocks missing prices, missing assignments and open ambiguities", () => {
  const d = draft({
    items: [
      item({ id: "shampoo", name: "Shampoo", totalPriceCents: null, assignedParticipantIds: ["kai"], needsPrice: true }),
      item({ id: "mug", name: "Mug", totalPriceCents: 1500, assignedParticipantIds: [], needsAssignment: true }),
    ],
    ambiguities: [{
      id: "a1",
      kind: "participant",
      message: 'Who does "K" refer to?',
      itemIds: ["mug"],
      options: [],
      resolved: false,
    }],
  });
  const issues = validate(d, calculate(d, ["kai", "john"]), ["kai", "john"]);
  const codes = issues.map((i) => i.code).sort();
  assertEquals(codes, ["missing_assignment", "missing_price", "unresolved_ambiguity"]);
  assert(hasBlockingIssues(issues));
});

Deno.test("validation warns about total mismatch without adjusting anything", () => {
  const d = draft({
    items: [item({ id: "a", totalPriceCents: 1000, assignedParticipantIds: ["kai"] })],
    taxCents: 80,
    totalCents: 1100,
  });
  const calc = calculate(d, ["kai"]);
  const issues = validate(d, calc, ["kai"]);
  assertEquals(calc.computedTotalCents, 1080);
  assertEquals(issues.map((i) => i.code), ["total_mismatch"]);
  assertEquals(issues[0].severity, "warning");
  assert(issues[0].message.includes("$11.00") && issues[0].message.includes("$10.80"));
  assert(!hasBlockingIssues(issues));
});

Deno.test("validation flags subtotal mismatch and possible duplicates", () => {
  const d = draft({
    items: [
      item({ id: "t1", name: "T-Shirt", totalPriceCents: 2499, assignedParticipantIds: ["kai"] }),
      item({ id: "t2", name: "T Shirt", totalPriceCents: 2499, assignedParticipantIds: ["john"] }),
    ],
    subtotalCents: 2499,
  });
  const codes = validate(d, calculate(d, ["kai", "john"]), ["kai", "john"]).map((i) => i.code).sort();
  assertEquals(codes, ["possible_duplicate", "subtotal_mismatch"]);
});

Deno.test("validation rejects unknown participants and non-positive totals", () => {
  const ghost = draft({ items: [item({ id: "g", totalPriceCents: 500, assignedParticipantIds: ["ghost"] })] });
  assert(validate(ghost, calculate(ghost, ["kai"]), ["kai"]).some((i) => i.code === "unknown_participant"));

  const free = draft({ items: [item({ id: "f", totalPriceCents: 0, assignedParticipantIds: ["kai"] })] });
  assert(validate(free, calculate(free, ["kai"]), ["kai"]).some((i) => i.code === "non_positive_total"));
});

// ---------------------------------------------------------------------------------------------
// Model output schema / sanitizer

function modelOutput(overrides: Record<string, unknown> = {}) {
  return {
    merchant: "Target",
    currency: "USD",
    paidByParticipantId: null,
    items: [{
      id: "item_1",
      name: "Protein Bars",
      quantity: 1,
      unitPriceCents: 1200,
      totalPriceCents: 1200,
      discountCents: null,
      assignedParticipantIds: ["kai"],
      source: "text",
      confidence: 0.98,
      needsPrice: false,
      needsAssignment: false,
    }],
    subtotalCents: null,
    taxCents: 300,
    tipCents: null,
    feeCents: null,
    shippingCents: null,
    discountCents: null,
    totalCents: null,
    ambiguities: [],
    missingInformation: [],
    confidence: 0.96,
    ...overrides,
  };
}

Deno.test("sanitizer accepts valid output (object or JSON string)", () => {
  for (const raw of [modelOutput(), JSON.stringify(modelOutput())]) {
    const d = sanitizeModelOutput(raw, people);
    assertEquals(d.items[0].assignedParticipantIds, ["kai"]);
    assertEquals(d.items[0].splitType, "equal");
    assertEquals(d.taxCents, 300);
    assertEquals(d.ambiguities, []);
  }
});

Deno.test("sanitizer removes unknown participants and asks instead of guessing", () => {
  const raw = modelOutput({
    items: [{ ...modelOutput().items[0], assignedParticipantIds: ["kevin_not_in_group"] }],
  });
  const d = sanitizeModelOutput(raw, people);
  assertEquals(d.items[0].assignedParticipantIds, []);
  assertEquals(d.items[0].needsAssignment, true);
  assertEquals(d.ambiguities.length, 1);
  assertEquals(d.ambiguities[0].kind, "participant");
  assertEquals(d.ambiguities[0].resolved, false);
});

Deno.test("sanitizer never invents prices and derives totals only from unit x quantity", () => {
  const raw = modelOutput({
    items: [
      { ...modelOutput().items[0], id: "item_1", unitPriceCents: null, totalPriceCents: null, needsPrice: false },
      { ...modelOutput().items[0], id: "item_2", quantity: 2, unitPriceCents: 600, totalPriceCents: null },
      { ...modelOutput().items[0], id: "item_3", totalPriceCents: -500 },
    ],
  });
  const d = sanitizeModelOutput(raw, people);
  assertEquals(d.items[0].totalPriceCents, null);
  assertEquals(d.items[0].needsPrice, true, "needsPrice is recomputed, not trusted");
  assertEquals(d.items[1].totalPriceCents, 1200);
  assertEquals(d.items[2].totalPriceCents, null, "negative prices are rejected");
});

Deno.test("sanitizer de-duplicates item ids and drops unknown payer", () => {
  const raw = modelOutput({
    paidByParticipantId: "nobody",
    items: [modelOutput().items[0], modelOutput().items[0]],
  });
  const d = sanitizeModelOutput(raw, people);
  assertEquals(new Set(d.items.map((i) => i.id)).size, 2);
  assertEquals(d.paidByParticipantId, null);
});

Deno.test("sanitizer rejects malformed output", () => {
  assertThrows(() => sanitizeModelOutput("not json {", people), ModelOutputError);
  assertThrows(() => sanitizeModelOutput({ items: "nope" }, people), ModelOutputError);
});

Deno.test("draft schema round-trips a sanitized draft (commit payload)", () => {
  const d = sanitizeModelOutput(modelOutput(), people);
  assert(draftSchema.safeParse(d).success);
  assert(!draftSchema.safeParse({ ...d, currency: "EUR" }).success);
});

Deno.test("JSON schema is strict-mode compatible (every property required)", () => {
  // deno-lint-ignore no-explicit-any
  const check = (schema: any) => {
    if (schema?.type === "object" || (Array.isArray(schema?.type) && schema.type.includes("object"))) {
      assertEquals(schema.additionalProperties, false);
      assertEquals([...schema.required].sort(), Object.keys(schema.properties).sort());
      Object.values(schema.properties).forEach(check);
    }
    if (schema?.items) check(schema.items);
  };
  check(MODEL_OUTPUT_JSON_SCHEMA);
});

// ---------------------------------------------------------------------------------------------
// Provider

Deno.test("OpenRouter request uses the configured model, strict JSON schema and the image", async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  const fakeFetch = ((url: string, init: RequestInit) => {
    captured = { url, init };
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelOutput()) } }] })),
    );
  }) as unknown as typeof fetch;

  const provider = new OpenRouterProvider("sk-test", "openai/gpt-6-luna", fakeFetch);
  const raw = await provider.interpret({
    text: "Kai protein bars 12",
    imageDataUrl: "data:image/jpeg;base64,AAAA",
    participants: people,
    currentUserId: "kai",
  });
  assertEquals(sanitizeModelOutput(raw, people).items[0].name, "Protein Bars");

  const { url, init } = captured!;
  assertEquals(url, "https://openrouter.ai/api/v1/chat/completions");
  assertEquals((init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  const body = JSON.parse(init.body as string);
  assertEquals(body.model, "openai/gpt-6-luna");
  assertEquals(body.temperature, 0);
  assertEquals(body.response_format.type, "json_schema");
  assertEquals(body.response_format.json_schema.strict, true);
  assertEquals(body.messages[1].content[1], { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
  assert(body.messages[1].content[0].text.includes('"isCurrentUser":true'));
});

Deno.test("OpenRouter errors are surfaced with a retry hint", async () => {
  const failing = (status: number) =>
    (() => Promise.resolve(new Response("nope", { status }))) as unknown as typeof fetch;
  const input = { text: "x", imageDataUrl: null, participants: people, currentUserId: "kai" };
  const e429 = await assertRejects(
    () => new OpenRouterProvider("k", "m", failing(429), 60_000, 0).interpret(input),
    ProviderError,
  );
  assertEquals(e429.retryable, true);
  const e400 = await assertRejects(() => new OpenRouterProvider("k", "m", failing(400)).interpret(input), ProviderError);
  assertEquals(e400.retryable, false);
});

Deno.test("provider selection: env model, default model, missing key, mock", () => {
  const env = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });
  const configured = providerFromEnv(env({ OPENROUTER_API_KEY: "k", SMART_SPLIT_MODEL: "anthropic/other" }));
  assertEquals(configured.name, "openrouter:anthropic/other");
  assertEquals(providerFromEnv(env({ OPENROUTER_API_KEY: "k" })).name, `openrouter:${DEFAULT_SMART_SPLIT_MODEL}`);
  assertEquals(DEFAULT_SMART_SPLIT_MODEL, "openai/gpt-6-luna");
  assertThrows(() => providerFromEnv(env({})), ProviderError);
  assertEquals(providerFromEnv(env({ SMART_SPLIT_PROVIDER: "mock" })).name, "mock");
});

Deno.test("mock provider output passes the sanitizer (used for UI testing)", async () => {
  const raw = await new MockProvider().interpret({
    text: "kai shirt 25\njohn mug 15\nsnacks 12 all\ntax 4.80\nshampoo me",
    imageDataUrl: null,
    participants: people,
    currentUserId: "kai",
  });
  const d = sanitizeModelOutput(raw, people);
  assertEquals(d.items.map((i) => [i.name, i.totalPriceCents, i.assignedParticipantIds]), [
    ["Shirt", 2500, ["kai"]],
    ["Mug", 1500, ["john"]],
    ["Snacks", 1200, ["kai", "john", "shelly"]],
    ["Shampoo", null, ["kai"]],
  ]);
  assertEquals(d.taxCents, 480);
});

Deno.test("draft schema treats missing optional keys as null (Swift omits nil)", () => {
  const d = sanitizeModelOutput(modelOutput(), people);
  const { merchant: _m, taxCents: _t, ...rest } = d;
  const itemWithoutNulls = { ...d.items[0] } as Record<string, unknown>;
  delete itemWithoutNulls.discountCents;
  delete itemWithoutNulls.weights;
  const parsed = draftSchema.parse({ ...rest, items: [itemWithoutNulls] });
  assertEquals(parsed.merchant, null);
  assertEquals(parsed.taxCents, null);
  assertEquals(parsed.items[0].discountCents, null);
  assertEquals(parsed.items[0].weights, null);
});

Deno.test("falls back to JSON mode when the model has no structured-output endpoint", async () => {
  const bodies: Record<string, unknown>[] = [];
  const fakeFetch = ((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    if (body.response_format.type === "json_schema") {
      return Promise.resolve(new Response(
        JSON.stringify({ error: { message: "No endpoints found that support the requested parameters" } }),
        { status: 404 },
      ));
    }
    const fenced = "```json\n" + JSON.stringify(modelOutput()) + "\n```";
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: fenced } }] })));
  }) as unknown as typeof fetch;

  const provider = new OpenRouterProvider("k", "google/gemma-4-26b-a4b-it:free", fakeFetch);
  const input = { text: "x", imageDataUrl: null, participants: people, currentUserId: "kai" };
  const raw = await provider.interpret(input);
  assertEquals(sanitizeModelOutput(raw, people).items[0].name, "Protein Bars");
  assertEquals(bodies.map((b) => (b.response_format as { type: string }).type), ["json_schema", "json_object"]);
  // deno-lint-ignore no-explicit-any
  assert((bodies[1].messages as any)[0].content.includes('"additionalProperties":false'), "schema is in the prompt");

  // The fallback is remembered: the next call goes straight to JSON mode.
  await provider.interpret(input);
  assertEquals((bodies[2].response_format as { type: string }).type, "json_object");
});

Deno.test("other provider errors do not trigger the JSON-mode fallback", async () => {
  let calls = 0;
  const fakeFetch = (() => {
    calls++;
    return Promise.resolve(new Response("invalid api key", { status: 401 }));
  }) as unknown as typeof fetch;
  await assertRejects(
    () => new OpenRouterProvider("k", "some/model", fakeFetch).interpret({
      text: "x", imageDataUrl: null, participants: people, currentUserId: "kai",
    }),
    ProviderError,
  );
  assertEquals(calls, 1);
});

Deno.test("a rate-limited request is retried once", async () => {
  let calls = 0;
  const fakeFetch = (() => {
    calls++;
    return Promise.resolve(
      calls === 1
        ? new Response("rate-limited upstream", { status: 429 })
        : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelOutput()) } }] })),
    );
  }) as unknown as typeof fetch;
  const raw = await new OpenRouterProvider("k", "m", fakeFetch, 60_000, 0).interpret({
    text: "x", imageDataUrl: null, participants: people, currentUserId: "kai",
  });
  assertEquals(calls, 2);
  assertEquals(sanitizeModelOutput(raw, people).items.length, 1);
});
