import Link from "next/link";
import { Logo } from "@/components/logo";

const features = [
  {
    title: "Organizations & roles",
    text: "Owners, admins, team members and clients, each with exactly the access they need.",
  },
  {
    title: "Projects & tasks",
    text: "Plan work per client, track progress on a simple board and never miss a due date.",
  },
  {
    title: "A portal for clients",
    text: "Clients log in to follow their own projects. They never see other clients' work.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login" className="rounded-lg px-3 py-2 text-slate-600 hover:text-slate-900">
            Log in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-brand-600 px-3.5 py-2 font-medium text-white hover:bg-brand-700"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-600">For freelancers and small agencies</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Projects, tasks and clients in one secure place.
          </h1>
          <p className="mt-5 text-lg text-slate-600">
            ClientHub keeps your team organized and gives every client a private view of the work
            you are doing for them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/register"
              className="rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
            >
              Create your workspace
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-white px-4 py-2.5 font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Log in
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{feature.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
