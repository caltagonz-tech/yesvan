/**
 * PII Anonymization Layer (§9.1–9.5)
 *
 * Strips personally identifiable information before sending context to Claude API.
 * The AI only sees display IDs (STU-001, HOST-01, DRV-03, UNI-04) and roles.
 * The client re-injects PII for display after receiving AI output.
 */

type EntityMapping = {
  id: string;
  displayId: string;
  name: string;
};

export type PiiContext = {
  students: EntityMapping[];
  hosts: EntityMapping[];
  drivers: EntityMapping[];
  universities: EntityMapping[];
  users: EntityMapping[];
};

/**
 * Build a PII lookup from database entities.
 * Returns a context object that can anonymize/de-anonymize text.
 */
export function buildPiiContext(
  students: { id: string; display_id: string; first_name?: string; last_name?: string }[] = [],
  hosts: { id: string; display_id: string; family_name?: string }[] = [],
  drivers: { id: string; display_id: string; first_name?: string; last_name?: string }[] = [],
  universities: { id: string; display_id: string; name?: string }[] = [],
  users: { id: string; first_name?: string; last_name?: string }[] = [],
): PiiContext {
  return {
    students: students.map((s) => ({
      id: s.id,
      displayId: s.display_id,
      name: `${s.first_name || ""} ${s.last_name || ""}`.trim(),
    })),
    hosts: hosts.map((h) => ({
      id: h.id,
      displayId: h.display_id,
      name: h.family_name || "",
    })),
    drivers: drivers.map((d) => ({
      id: d.id,
      displayId: d.display_id,
      name: `${d.first_name || ""} ${d.last_name || ""}`.trim(),
    })),
    universities: universities.map((u) => ({
      id: u.id,
      displayId: u.display_id,
      name: u.name || "",
    })),
    users: users.map((u) => ({
      id: u.id,
      displayId: `USER-${u.first_name?.charAt(0) || "?"}`,
      name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
    })),
  };
}

/**
 * Replace all known PII (names, emails, phones) with display IDs.
 * Used before sending text to the AI.
 */
export function anonymize(text: string, ctx: PiiContext): string {
  let result = text;

  // Replace entity names with display IDs (longest names first to avoid partial matches)
  const allMappings: { name: string; displayId: string }[] = [
    ...ctx.students.map((s) => ({ name: s.name, displayId: s.displayId })),
    ...ctx.hosts.map((h) => ({ name: h.name, displayId: h.displayId })),
    ...ctx.drivers.map((d) => ({ name: d.name, displayId: d.displayId })),
    ...ctx.universities.map((u) => ({ name: u.name, displayId: u.displayId })),
    ...ctx.users.map((u) => ({ name: u.name, displayId: u.displayId })),
  ].filter((m) => m.name.length > 1) // Skip empty/single-char names
    .sort((a, b) => b.name.length - a.name.length); // Longest first

  for (const mapping of allMappings) {
    // Case-insensitive word-boundary replacement
    const escaped = mapping.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    result = result.replace(regex, mapping.displayId);
  }

  // Strip email addresses
  result = result.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email-redacted]");

  // Strip phone numbers
  result = result.replace(/\+?\d[\d\s\-().]{7,}\d/g, "[phone-redacted]");

  // Strip street addresses (basic pattern: number + street name)
  result = result.replace(/\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Way|Ct|Pl|Terr|Cres)\b\.?/g, "[address-redacted]");

  return result;
}

/**
 * Replace display IDs back to real names for client display.
 * Used after receiving AI output.
 */
export function deAnonymize(text: string, ctx: PiiContext): string {
  let result = text;

  const allMappings: { name: string; displayId: string }[] = [
    ...ctx.students.map((s) => ({ name: s.name, displayId: s.displayId })),
    ...ctx.hosts.map((h) => ({ name: h.name, displayId: h.displayId })),
    ...ctx.drivers.map((d) => ({ name: d.name, displayId: d.displayId })),
    ...ctx.universities.map((u) => ({ name: u.name, displayId: u.displayId })),
  ];

  for (const mapping of allMappings) {
    if (mapping.name) {
      result = result.replaceAll(mapping.displayId, mapping.name);
    }
  }

  return result;
}

/**
 * Anonymize an array of card/entity objects for AI context.
 * Replaces name fields with display IDs.
 */
export function anonymizeCards(
  cards: { title: string; context?: string | null; [key: string]: unknown }[],
  ctx: PiiContext
): { title: string; context?: string | null; [key: string]: unknown }[] {
  return cards.map((card) => ({
    ...card,
    title: anonymize(card.title, ctx),
    context: card.context ? anonymize(card.context, ctx) : card.context,
  }));
}
