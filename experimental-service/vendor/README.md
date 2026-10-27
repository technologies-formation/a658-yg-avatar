# Local PDF export dependencies

These files are served only through the authenticated private resource whitelist.
No CDN or remote font is used by the application. They are loaded only when the
user requests a PDF; the export does not call a dialogue or pathway endpoint.

- `jspdf.umd.min.js`: upstream jsPDF v4.2.1, copied without modifications from
  https://github.com/parallax/jsPDF/blob/v4.2.1/dist/jspdf.umd.min.js
  (license in `JSPDF-LICENSE.txt`).
- `DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`: DejaVu fonts, copied from the
  installed DejaVu distribution. Copyright and redistribution terms are retained
  in `DEJAVU-LICENSE.txt`. Fonts are embedded in the PDF for French accents and
  punctuation, independently of fonts installed on the reader's device.

Only text, font, vector drawing, image and HTTPS-link APIs are used. The HTML,
AcroForm, JavaScript-action and remote-image APIs are not used. Recheck the upstream
release and notices when updating the vendored library.
