import Link from "next/link";
import { AuthoroMark } from "@/components/authoro-mark";
import { IdLookup } from "@/components/id-lookup";
import { buttonClass } from "@/components/ui";

const STEPS = [
  {
    name: "Register",
    body: "Add a work: its title, byline, where it's published, and how it was made.",
  },
  {
    name: "Fingerprint",
    body: "Your browser hashes the document with SHA-256. The file doesn't have to leave your device.",
  },
  {
    name: "Attest",
    body: "You confirm the record yourself. Tools and agents can prepare a registration, but only you can finalize it.",
  },
  {
    name: "Mark",
    body: "Put the Authoro Mark beside your byline. It links to a permanent public record.",
  },
  {
    name: "Resolve",
    body: "Readers see who claims authorship, who reported what, and whether the text in front of them still matches.",
  },
] as const;

const SAYS = [
  "Jane Smith attested to this record on September 30, 2026.",
  "The author reports using AI for copyediting only.",
  "WordPress confirmed publication at 10:42 AM.",
  "This text matches the registered fingerprint.",
] as const;

const NEVER_SAYS = [
  "Definitely written by a human.",
  "92/100 human.",
  "Guaranteed original.",
  "Certified by Authoro.",
] as const;

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">Public provenance registry</p>
        <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] tracking-tight sm:text-7xl">
          The record behind the work.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted">
          Authoro is a public registry for creative work. Authors, and the tools they write with, record
          verifiable evidence of how a work was made. Readers click the mark and see it.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/sign-up" className={buttonClass("primary", "h-11 px-5")}>
            Register your work
          </Link>
          <div className="inline-flex items-center gap-3 rounded-full border border-line bg-paper-raised py-2 pr-5 pl-3 text-sm shadow-sm">
            <AuthoroMark size={22} />
            <span className="text-ink-muted">
              authoro.net/p/<span className="font-mono text-ink">AU-7K3F92</span>
            </span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-4 rounded-xl border border-line bg-paper-raised p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium">Saw the Authoro Mark somewhere?</h2>
            <p className="mt-1 text-sm text-ink-muted">
              Look up its record, or{" "}
              <Link href="/verify" className="text-ink underline underline-offset-4">
                check a document
              </Link>
              .
            </p>
          </div>
          <IdLookup />
        </div>
      </section>

      <section id="how" className="border-y border-line bg-paper-sunken">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="font-serif text-3xl tracking-tight">How it works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-5 sm:gap-6">
            {STEPS.map((step, index) => (
              <li key={step.name}>
                <span className="font-mono text-xs text-ink-muted">0{index + 1}</span>
                <h3 className="mt-1 font-medium">{step.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="principles" className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <h2 className="font-serif text-3xl tracking-tight">Evidence, not verdicts.</h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Authoro doesn&apos;t guess whether a work is &ldquo;human&rdquo; or &ldquo;AI&rdquo;, and it
              never gives a work a score. A record lists concrete claims and names who made each one: the
              author, an editor, a publisher or an AI tool. Claims the author supplies are always labelled as
              author-supplied.
            </p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">A record says</h3>
                <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                  {SAYS.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="text-accent" aria-hidden>
                        ✓
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-medium">A record never says</h3>
                <ul className="mt-3 space-y-2 text-sm text-ink-muted">
                  {NEVER_SAYS.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span aria-hidden>×</span>
                      <span className="line-through decoration-ink-muted/50">{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <ExampleRecord />
        </div>
      </section>

      <section id="open" className="border-t border-line">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
          <div className="md:col-span-1">
            <h2 className="font-serif text-3xl tracking-tight">Open by design.</h2>
          </div>
          <div className="space-y-4 leading-relaxed text-ink-muted md:col-span-2">
            <p>
              The Proof Envelope format, the fingerprinting rules and the verification logic are open source
              under Apache-2.0. Any editor, publisher or AI tool can produce Authoro-compatible evidence
              without proprietary software.
            </p>
            <p>
              Looking up a record, and checking a document against it, is always free. Authoro makes money
              from services that strengthen a record, never from access to one.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

function ExampleRecord() {
  return (
    <figure className="rounded-xl border border-line bg-paper-raised p-6 shadow-sm">
      <figcaption className="flex items-center justify-between text-xs text-ink-muted">
        <span className="tracking-wide uppercase">Creation record · Example</span>
        <span className="font-mono">AU-7K3F92</span>
      </figcaption>
      <h3 className="mt-4 font-serif text-2xl leading-snug">The Future of Independent Software</h3>
      <p className="mt-1 text-sm text-ink-muted">Jane Smith · Registered September 30, 2026</p>

      <div className="mt-6 space-y-2 text-sm">
        <p className="flex gap-2">
          <span className="text-accent">✓</span> Registered fingerprint valid
        </p>
        <p className="flex gap-2">
          <span className="text-accent">✓</span> Author attested
        </p>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">Author disclosure</p>
        <p className="mt-2 text-sm leading-relaxed">
          AI-assisted. AI was used for copyediting and shortening selected passages.
        </p>
        <p className="mt-2 inline-block rounded bg-caution-soft px-2 py-0.5 text-xs text-caution">
          Author supplied
        </p>
      </div>

      <div className="mt-6 border-t border-line pt-5 font-mono text-xs text-ink-muted">
        Version 1 · sha256:93ab8e…c41f
      </div>
    </figure>
  );
}
