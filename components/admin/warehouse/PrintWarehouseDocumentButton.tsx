"use client";

import { Printer } from "lucide-react";

export default function PrintWarehouseDocumentButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#e6ded7] bg-[#f8f5f2] px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#efe9e4] hover:text-[#302924]"><Printer className="h-3.5 w-3.5" />Print document</button>;
}
