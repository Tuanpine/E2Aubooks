// Builds a minimal but valid EPUB so the parse path can be verified for real.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAPTERS = [
  ['Chương Một', 'Mười một giờ đêm, phố cổ vắng tanh. Gió thu thổi ngang qua những mái ngói cũ kỹ, mang theo mùi lá khô. Tôi dừng bước trước cổng một ngôi nhà nhỏ.'],
  ['Chương Hai', 'Bên trong, tiếng đàn piano vọng ra đều đặn. Người chơi nhạc hẳn không biết có khách. Tôi đẩy cửa, và ánh đèn bật lên trước mặt.'],
];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const para = t => `<p>${t.split(/(?<=[.!?…])\s+/).map(esc).join('</p><p>')}</p>`;

(async () => {
  const zip = new JSZip();
  const m = 'OEBPS';

  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml',
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);

  const items = CHAPTERS.map((_, i) =>
    `<item id="c${i}" href="${m}/c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('');
  const spine = CHAPTERS.map((_, i) => `<itemref idref="c${i}"/>`).join('');
  zip.file('OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Tac Gia Thu Nghiem</dc:title><dc:language>vi</dc:language><dc:identifier id="id">e2a-test-1</dc:identifier></metadata><manifest>${items}</manifest><spine>${spine}</spine></package>`);

  CHAPTERS.forEach(([title, text], i) => {
    zip.file(`OEBPS/c${i}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(title)}</title></head><body><h1>${esc(title)}</h1>${para(text)}</body></html>`);
  });

  const out = path.join(__dirname, '..', 'ebooks_queue', 'test_thu_nghiem.epub');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  console.log(`wrote ${out} (${fs.statSync(out).size} bytes, ${CHAPTERS.length} chapters)`);
})();
