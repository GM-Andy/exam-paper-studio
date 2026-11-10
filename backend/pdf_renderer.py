import os
import sys
import subprocess
from pathlib import Path
from typing import Tuple, List, Optional
import pymupdf

class PdfRenderer:
    def __init__(self):
        self.is_windows = sys.platform == "win32"

    def convert_docx_to_pdf(self, docx_path: Path, pdf_path: Path) -> Path:
        """
        Converts DOCX to PDF using Word COM on Windows or LibreOffice headless on Linux.
        """
        docx_abs = str(docx_path.resolve())
        pdf_abs = str(pdf_path.resolve())
        
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        if pdf_path.exists():
            pdf_path.unlink()

        # Try Word COM first on Windows using robust script file
        if self.is_windows:
            ps_file = Path(__file__).resolve().parent / "convert_docx_to_pdf.ps1"
            if ps_file.exists():
                try:
                    res = subprocess.run(
                        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(ps_file), "-DocxPath", docx_abs, "-PdfPath", pdf_abs],
                        capture_output=True,
                        text=True,
                        timeout=35
                    )
                    if pdf_path.exists() and pdf_path.stat().st_size > 500:
                        return pdf_path
                except Exception as e:
                    print(f"Word COM conversion failed: {e}")

        # Fallback to LibreOffice headless
        cmd_candidates = ["soffice", "libreoffice", r"C:\Program Files\LibreOffice\program\soffice.exe"]
        for cmd in cmd_candidates:
            try:
                subprocess.run(
                    [cmd, "--headless", "--convert-to", "pdf", "--outdir", str(pdf_path.parent), docx_abs],
                    capture_output=True,
                    timeout=45
                )
                # Output filename is usually docx_stem.pdf in outdir
                generated = pdf_path.parent / (docx_path.stem + ".pdf")
                if generated.exists():
                    if generated != pdf_path:
                        if pdf_path.exists():
                            pdf_path.unlink()
                        generated.rename(pdf_path)
                    return pdf_path
            except Exception:
                continue

        if not pdf_path.exists():
            raise RuntimeError("PDF conversion failed: neither Word COM nor LibreOffice was able to convert DOCX.")
        return pdf_path

    def inspect_and_render_previews(self, pdf_path: Path, output_dir: Path, base_name: str) -> Tuple[int, List[str], bool, bool]:
        """
        Inspects PDF page count, checks for English and Devanagari text,
        and generates PNG preview images for each page.
        Returns (page_count, preview_image_paths, has_english, has_devanagari).
        """
        doc = pymupdf.open(str(pdf_path))
        page_count = len(doc)
        preview_paths = []
        
        has_english = False
        has_devanagari = False
        
        # Devanagari Unicode range: \u0900 - \u097F
        import re
        devanagari_pattern = re.compile(r'[\u0900-\u097F]')
        english_pattern = re.compile(r'[a-zA-Z]')

        for idx, page in enumerate(doc):
            text = page.get_text()
            if english_pattern.search(text):
                has_english = True
            if devanagari_pattern.search(text):
                has_devanagari = True
                
            # Render page to PNG
            pix = page.get_pixmap(dpi=150)
            img_path = output_dir / f"{base_name}_page_{idx+1}.png"
            pix.save(str(img_path))
            preview_paths.append(str(img_path))

        return page_count, preview_paths, has_english, has_devanagari
