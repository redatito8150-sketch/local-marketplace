/**
 * `Request.prototype.formData()`'s return type resolves to a `FormData` whose
 * `.get`/`.getAll` members TypeScript reports as missing (`TS2339`), even
 * though `new FormData()` types fine. Root cause: `@types/node`'s dom-vs-undici
 * detection (`typeof globalThis extends { onmessage: any } ? ... `) is
 * order-dependent and misresolves specifically for the `Request.formData()`
 * signature in this project's toolchain (Next 16 / TS 5.9 / @types/node 20.19,
 * reproduced independent of NextRequest — plain `Request` hits it too). This
 * narrows back to the real spec-compliant shape after the awaited call so
 * every call site doesn't need its own cast.
 */
export interface WebFormData {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
  has(name: string): boolean;
}

export async function readFormData(request: Request): Promise<WebFormData> {
  return (await request.formData()) as unknown as WebFormData;
}
