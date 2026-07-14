// Test stub for `next/link` — see next-navigation.stub.ts. next-intl's BaseLink
// (pulled in transitively via @/i18n/navigation) references the default export at
// module load to build its Link wrapper, but the unit tests never render it. A
// no-op default export satisfies the ESM link check under the node vitest env.
export default function NextLinkStub() {
  return null;
}
