"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({ reset, title }: { reset: () => void; title: string }) {
  return (
    <div className="flex min-h-[55vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-700"><AlertTriangle className="h-5 w-5" /></div>
        <h1 className="mt-5 text-xl font-bold tracking-[-0.03em] text-slate-950">{title}</h1>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">The data could not be loaded. No changes were made. Check the connection and try again.</p>
        <button type="button" onClick={reset} className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-[12.5px] font-semibold text-white hover:bg-slate-800"><RefreshCw className="mr-2 h-4 w-4" />Try again</button>
      </div>
    </div>
  );
}
