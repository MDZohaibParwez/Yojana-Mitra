import { describe, expect, it } from "vitest";
import { handleMessage, InMemoryRepository, MAX_QUESTIONS, MemorySessionStore, newState, sessionKey, type ConversationState, type Inbound } from "../src/index.js";
import { loadSeedRecords } from "./fixtures.js";

const repo = new InMemoryRepository(loadSeedRecords());
const ctx = { repo, channel: "whatsapp" as const, now: new Date("2026-11-20") };

async function talk(msgs: Inbound[], start = newState("hi")) {
  let state: ConversationState = start;
  const transcript: string[] = [];
  for (const m of msgs) {
    const r = await handleMessage(state, m, ctx);
    state = r.state;
    transcript.push(r.messages.map((x) => x.text).join("\n---\n"));
  }
  return { state, transcript };
}

describe("conversation engine", () => {
  it("greets on first hello and asks one question with options", async () => {
    const r = await handleMessage(newState("hi"), { text: "namaste" }, ctx);
    expect(r.messages[0]!.text).toMatch(/योजना मित्र|Yojana Mitra/);
    expect(r.state.pendingField).toBe("state");
    expect(r.messages).toHaveLength(2);
  });

  it("extracts many facts from one sentence and only asks what is missing", async () => {
    const r = await handleMessage(newState(), { text: "I am a 42 year old farmer from Gujarat, SC, income 1.5 lakh" }, ctx);
    expect(r.state.lang).toBe("en");
    expect(r.state.profile).toMatchObject({ age: 42, occupation: "farmer", state: "GJ", socialCategory: "SC", annualIncome: 150000 });
    expect(r.state.pendingField).toBe("gender");
    expect(r.messages[0]!.buttons?.map((b) => b.id)).toEqual(["a:gender:male", "a:gender:female", "a:gender:transgender"]);
  });

  it("full flow ends in result cards with links, sources and disclaimer", async () => {
    let state = newState();
    let r = await handleMessage(state, { text: "main 40 saal ka kisan hoon, Gujarat se, gaon mein rehta hoon" }, ctx);
    state = r.state;
    expect(state.lang).toBe("hinglish");
    let guard = 0;
    while (state.pendingField && guard++ < MAX_QUESTIONS + 2) {
      const f = state.pendingField;
      const btn = r.messages.at(-1)!.buttons?.[0] ?? r.messages.at(-1)!.list?.rows[0];
      const answer: Inbound = btn ? { replyId: btn.id } : { text: f === "annualIncome" ? "1 lakh" : f === "landHoldingHectares" ? "2 acre" : f === "age" ? "40" : f === "district" ? "Anand" : "pata nahi" };
      r = await handleMessage(state, answer, ctx);
      state = r.state;
    }
    const all = r.messages.map((m) => m.text).join("\n");
    expect(all).toMatch(/PM-KISAN|Kisan/);
    expect(all).toMatch(/https:\/\//);
    expect(all).toMatch(/Last check|Last verified/i);
    expect(all).toMatch(/sarkari vibhag|government department/i);
    expect(r.messages.at(-1)!.buttons?.map((b) => b.id)).toContain("cmd:new");
  });

  it("never stores Aadhaar or PAN and warns the user", async () => {
    const r = await handleMessage(newState("hi"), { text: "mera aadhaar 2341 2341 2346 hai aur umar 30" }, ctx);
    expect(r.messages[0]!.text).toMatch(/आधार|Aadhaar/);
    expect(r.state.profile).toEqual({});
    expect(JSON.stringify(r.state)).not.toContain("2341");
  });

  it("commands: naya check resets, documents, deadline, help, more", async () => {
    const { state } = await talk([{ text: "I am a 30 year old farmer from Gujarat with 1 acre, no income tax" }]);
    expect(Object.keys(state.profile).length).toBeGreaterThan(3);
    const docs = await handleMessage(state, { text: "documents" }, ctx);
    expect(docs.messages[0]!.text).toMatch(/Aadhaar/);
    const dl = await handleMessage(state, { text: "deadline" }, ctx);
    expect(dl.messages[0]!.text.length).toBeGreaterThan(5);
    const help = await handleMessage(state, { text: "help" }, ctx);
    expect(help.messages[0]!.text).toMatch(/naya check/);
    const reset = await handleMessage(state, { text: "naya check" }, ctx);
    expect(reset.state.profile).toEqual({});
    expect(reset.state.pendingField).toBe("state");
  });

  it("'not sure' skips a field and it is never asked again", async () => {
    let s = { ...newState("en"), profile: { state: "UP", age: 30, gender: "female", occupation: "homemaker" } as const, pendingField: "hasBplCard" as const, questionsAsked: 4 };
    const r = await handleMessage(s, { replyId: "a:hasBplCard:unsure" }, ctx);
    expect(r.state.skipped).toContain("hasBplCard");
    expect(r.state.pendingField).not.toBe("hasBplCard");
  });

  it("ignores duplicate WhatsApp deliveries", async () => {
    const r1 = await handleMessage(newState(), { text: "hello", messageId: "wamid.1" }, ctx);
    const r2 = await handleMessage(r1.state, { text: "hello", messageId: "wamid.1" }, ctx);
    expect(r2.messages).toEqual([]);
  });

  it("re-asks when an answer is not understood", async () => {
    const s = { ...newState("hi"), pendingField: "age" as const, questionsAsked: 2 };
    const r = await handleMessage(s, { text: "pata nahi kya bolu" }, ctx);
    expect(r.state.skipped).toContain("age");
    const r2 = await handleMessage({ ...s }, { text: "xyz qwe" }, ctx);
    expect(r2.messages[0]!.text).toMatch(/समझ नहीं|understand|samajh/i);
  });

  it("explicit language switch", async () => {
    const r = await handleMessage(newState("hi"), { text: "English" }, ctx);
    expect(r.state.lang).toBe("en");
    expect(r.state.langLocked).toBe(true);
  });

  it("session store + anonymous key", async () => {
    const store = new MemorySessionStore();
    const key = sessionKey("wa", "919876543210", "x".repeat(32));
    expect(key).not.toContain("9876543210");
    await store.set(key, newState(), 60);
    expect(await store.get(key)).not.toBeNull();
    expect(() => sessionKey("wa", "1", "short")).toThrow();
  });
});
