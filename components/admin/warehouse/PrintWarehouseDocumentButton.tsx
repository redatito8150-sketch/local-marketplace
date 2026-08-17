"use client";

import { Printer } from "lucide-react";

export default function PrintWarehouseDocumentButton() {
  return <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#e2dcd4] px-3 text-[10.5px] font-bold text-[#62564d] hover:bg-[#d8d0c8] hover:text-[#302924]"><Printer className="h-3.5 w-3.5" />Print document</button>;
}
