// Adapted from lach-hockey-app's scripts/lib/lachApi.mjs downloadPdfItems -
// that version fetches a protocol PDF lach.lv already has a URL for; this
// tool's whole point is parsing a PDF the user just picked from their own
// computer, which arrives here as an in-memory Buffer (from multer) with
// no URL at all - split the actual pdfjs parsing out into its own
// buffer-first function so both cases can share it.

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

export async function itemsFromBuffer(buffer) {
  // Same stray-leading-byte quirk seen on every protocol lach.lv serves
  // (confirmed in the main project) - stripped defensively here too in
  // case a locally-saved copy of the same PDF carries it.
  const start = buffer.indexOf(0x25) // first "%" byte = real start of "%PDF-"
  const data = start > 0 ? buffer.subarray(start) : buffer

  const loadingTask = getDocument({ data: new Uint8Array(data) })
  try {
    const doc = await loadingTask.promise
    const page = await doc.getPage(1) // everything of interest is on page 1
    const content = await page.getTextContent()
    return content.items
      .filter((it) => it.str.trim())
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))
  } finally {
    await loadingTask.destroy()
  }
}
