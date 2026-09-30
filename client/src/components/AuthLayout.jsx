import { UNIVERSITIES } from '../utils/universities.js'

// Two-column layout for login/register: pitch + allowed domains on the left, form on the right.
export default function AuthLayout({ eyebrow, title, children }) {
  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 md:py-16 lg:grid-cols-2">
      <section className="flex flex-col justify-between rounded-sm bg-ink p-8 text-paper md:p-10">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display mt-5 text-5xl md:text-6xl">{title}</h1>
          <p className="mt-6 max-w-sm text-paper/70">
            Campus Hub is for verified Hong Kong university students. Anyone can browse; booking, pledging and
            organising need a student account.
          </p>
        </div>
        <ul className="mt-10 space-y-3 font-mono text-xs">
          {UNIVERSITIES.map((university) => (
            <li key={university.code} className="flex flex-wrap justify-between gap-2 border-t border-paper/15 pt-3">
              <span>{university.code}</span>
              <span className="text-paper/60">@{university.domains[0]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  )
}
