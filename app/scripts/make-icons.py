"""앱 아이콘/스플래시 원본 생성 (Pillow). 디자인을 바꾸려면 resources/*.png 를 직접 교체해도 된다.
    python3 scripts/make-icons.py && npm run assets
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "resources"
NAVY, ACCENT, WHITE = (27, 42, 65, 255), (193, 68, 14, 255), (255, 255, 255, 255)
S = 4  # 슈퍼샘플링 배율(부드러운 가장자리)


def glyph(size: int) -> Image.Image:
    """투명 배경의 헤드폰 + 위치 핀. 안전영역(중앙 약 60%) 안에 그린다."""
    n = size * S
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = n / 1024
    d.arc([262 * u, 262 * u, 762 * u, 762 * u], 180, 360, fill=WHITE, width=int(52 * u))      # 헤드밴드
    for x0 in (252, 682):                                                                       # 이어컵
        d.rounded_rectangle([x0 * u, 500 * u, (x0 + 90) * u, 690 * u], radius=int(40 * u), fill=WHITE)
    d.ellipse([452 * u, 520 * u, 572 * u, 640 * u], fill=ACCENT)                                # 핀(위치)
    d.polygon([(458 * u, 600 * u), (566 * u, 600 * u), (512 * u, 700 * u)], fill=ACCENT)
    d.ellipse([487 * u, 555 * u, 537 * u, 605 * u], fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    fg = glyph(1024)
    fg.save(OUT / "icon-foreground.png")
    Image.new("RGBA", (1024, 1024), NAVY).save(OUT / "icon-background.png")
    only = Image.new("RGBA", (1024, 1024), NAVY)
    only.alpha_composite(fg)
    only.convert("RGB").save(OUT / "icon-only.png")                                              # iOS는 투명 불가
    for name in ("splash.png", "splash-dark.png"):
        sp = Image.new("RGBA", (2732, 2732), NAVY)
        g = glyph(1024).resize((820, 820), Image.LANCZOS)
        sp.alpha_composite(g, ((2732 - 820) // 2, (2732 - 820) // 2))
        sp.convert("RGB").save(OUT / name)
    print("resources/ 생성:", sorted(p.name for p in OUT.glob("*.png")))


main()
