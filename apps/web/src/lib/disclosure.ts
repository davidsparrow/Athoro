import { AI_USES, CREATION_METHODS, type CreationDisclosure } from "@authoro/core";

/** Plain-English rendering of an author's creation disclosure. */
export function describeDisclosure(
  disclosure: Pick<CreationDisclosure, "methods" | "aiUses" | "aiTools" | "note">,
) {
  return {
    methods: disclosure.methods.map((method) => CREATION_METHODS[method]?.label ?? method),
    aiUses: (disclosure.aiUses ?? []).map((use) => AI_USES[use] ?? use),
    aiTools: disclosure.aiTools ?? [],
    note: disclosure.note?.trim() || null,
  };
}
