# Yojana-Mitra
Yojana Mitra — Government scheme eligibility assistant for India (Claude + WhatsApp + Web)
# Yojana Mitra

A simple way for any Indian to find out which government schemes they actually qualify for — in their own language.

Works through Claude, WhatsApp, and a basic website.

---

### The problem

India has thousands of government schemes. Central ones, state ones, everything.

But most people have no idea which ones they’re eligible for. Even the people who help others apply (CSC operators, form agents, NGO workers) spend half their day jumping between different portals.

The information is scattered, often outdated, and usually written in complicated language.

Yojana Mitra tries to fix that.

You just say something like:

> “I’m a 42-year-old farmer from Gujarat, SC category, family income around 1.5 lakh”

And it tells you:
- Which schemes you can apply for
- What documents you need
- The official links
- When the information was last checked

---

### What it can do

- Find schemes based on state, age, income, occupation, category, etc.
- Show full details of any scheme
- Check eligibility properly (and tell you exactly why you don’t qualify if you don’t)
- Compare two or more schemes side by side
- Give you a combined document checklist
- Show schemes whose deadlines are coming up soon

Starting with Hindi, English and Hinglish. More languages (Gujarati, Marathi, Tamil, Telugu, Bengali, Kannada) will be added later.

---

### Three ways to use it

1. **Claude** – through a connector so you can ask directly inside Claude
2. **WhatsApp** – just message the bot (voice notes will work too)
3. **Website** – a simple form + chat interface that works well on phones

---

### How we’re building it

There’s one backend that powers everything.

Data comes from official sources (myScheme.gov.in and state portals). We clean it, structure the eligibility rules, and keep track of when each scheme was last verified.

Every answer comes with the official source link and the last-checked date. We don’t store Aadhaar or bank details. We never charge for applying. And there’s always a way to report wrong information.

---

### Current status

Still early. Right now the focus is on:

- Finalising the data structure and eligibility format
- Getting all central schemes in properly
- Building the core API and tools
- Making the Claude connector work
- Starting the WhatsApp bot

After that we’ll add major states, the website, and more languages.

---

### Who this is for

Mainly for people who help others apply for schemes every day — CSC operators, form agents, panchayat staff, NGO workers.

Also useful for anyone trying to figure out benefits for themselves or their family.

The actual beneficiaries (farmers, workers, women, elderly) will mostly use it through WhatsApp.

---

### Contributing

This is still being built. If you want to help with data verification, language support, testing, or connecting us with CSC groups / NGOs, feel free to open an issue.

---

### License

Will decide soon (probably MIT).

---

Built because government schemes shouldn’t be this hard to find.
